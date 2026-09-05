import {
  cropFace,
  exportLastLiveFrame,
  faceDetection,
  startLivePreview,
  startVideoWorker,
  stopLivePreview,
  stopVideoWorker,
  subscribeVideoWorker,
  type FaceBox,
} from '../runtime';
import { workerFaceToBox } from './videoWorker';
import {
  checkFace,
  mergeEyes,
  mergeLiveness,
  warningFor,
  type CaptureState,
} from './captureLogic';
import type { CaptureResult, CaptureSettings } from './types';

export type CaptureSessionOptions = {
  settings: CaptureSettings;
  onState: (
    state: CaptureState,
    warning: string,
    boxes: FaceBox[],
    frame: { w: number; h: number }
  ) => void;
  onCaptured: (result: CaptureResult) => void;
};

export class CaptureSession {
  readonly settings: CaptureSettings;
  readonly onState: CaptureSessionOptions['onState'];
  readonly onCaptured: CaptureSessionOptions['onCaptured'];

  frameSize = { w: 480, h: 640 };
  lastBoxes: FaceBox[] = [];

  private unsubscribe: (() => void) | null = null;
  private cancelled = false;
  private workerReady = false;
  private capturing = false;
  private eyesBusy = false;
  private lastEyes: FaceBox[] = [];
  private sidePromise: Promise<void> | null = null;

  constructor(opts: CaptureSessionOptions) {
    this.settings = opts.settings;
    this.onState = opts.onState;
    this.onCaptured = opts.onCaptured;
  }

  /** Native front preview is mirrored on both platforms; engine frames are not. */
  get overlayMirror(): boolean {
    return this.settings.camera_lens === 'front';
  }

  async start(): Promise<void> {
    this.cancelled = false;
    this.capturing = false;
    await startLivePreview(this.settings.camera_lens === 'front');
    this.unsubscribe = subscribeVideoWorker((ev) => {
      if (this.cancelled || this.capturing || ev.type !== 'tracking') return;
      if (ev.frameWidth > 0 && ev.frameHeight > 0) {
        this.frameSize = { w: ev.frameWidth, h: ev.frameHeight };
      }
      const merged = mergeEyes(
        mergeLiveness(ev.faces.map(workerFaceToBox), this.lastEyes),
        this.lastEyes,
        this.overlayMirror
      );
      this.lastBoxes = merged;
      const state = checkFace(merged, this.settings, this.frameSize);
      this.onState(state, warningFor(state), merged, this.frameSize);
    });
    const started = await startVideoWorker({ matchThreshold: 0.8 });
    this.workerReady = started === 0;
    this.sidePromise = this.sideLoop();
  }

  async stop(): Promise<void> {
    this.cancelled = true;
    this.workerReady = false;
    this.unsubscribe?.();
    this.unsubscribe = null;
    await stopVideoWorker();
    await stopLivePreview();
    await this.sidePromise;
    this.sidePromise = null;
  }

  async captureNow(boxes: FaceBox[]): Promise<CaptureResult | null> {
    if (this.capturing) return null;
    this.capturing = true;
    try {
      const exported = await exportLastLiveFrame();
      const uri = exported.uri;
      if (!uri) return null;
      if (exported.width > 0 && exported.height > 0) {
        this.frameSize = { w: exported.width, h: exported.height };
      }
      let box = boxes[0] ?? this.lastBoxes[0] ?? null;
      try {
        const detected = await faceDetection(uri, {
          allAttributes: true,
          check_liveness: true,
          check_liveness_level: this.settings.liveness_level,
        });
        box = detected[0] ?? box;
      } catch {
        // keep tracker box
      }
      if (!box) return null;
      let cropB64: string | null = null;
      try {
        cropB64 = await cropFace(uri, box);
      } catch {
        cropB64 = null;
      }
      const result = { uri, faceBox: box, cropB64 };
      this.onCaptured(result);
      return result;
    } finally {
      this.capturing = false;
    }
  }

  private async sideLoop(): Promise<void> {
    const sleep = (ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms));
    while (!this.cancelled) {
      if (!this.workerReady || this.eyesBusy || this.capturing) {
        await sleep(120);
        continue;
      }
      this.eyesBusy = true;
      try {
        const exported = await exportLastLiveFrame();
        if (exported.uri) {
          const eyes = await faceDetection(exported.uri, {
            check_eye_closeness: true,
            check_pose: false,
            check_landmarks: false,
            check_liveness: false,
          });
          if (eyes.length) this.lastEyes = eyes;
        }
      } catch {
        // optional until camera warms up
      } finally {
        this.eyesBusy = false;
      }
      await sleep(220);
    }
  }
}

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
  private capturing = false;

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
        mergeLiveness(ev.faces.map(workerFaceToBox), []),
        [],
        this.overlayMirror
      );
      this.lastBoxes = merged;
      const state = checkFace(merged, this.settings, this.frameSize);
      this.onState(state, warningFor(state), merged, this.frameSize);
    });
    await startVideoWorker({ matchThreshold: 0.8 });
  }

  async stop(): Promise<void> {
    this.cancelled = true;
    this.unsubscribe?.();
    this.unsubscribe = null;
    await stopVideoWorker();
    await stopLivePreview();
  }

  async captureNow(boxes: FaceBox[]): Promise<CaptureResult | null> {
    if (this.capturing) return null;
    this.capturing = true;
    try {
      await stopVideoWorker();
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
}

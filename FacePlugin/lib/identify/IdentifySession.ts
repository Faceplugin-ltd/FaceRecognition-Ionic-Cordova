import {
  exportLastLiveFrame,
  faceDetection,
  startLivePreview,
  startVideoWorker,
  stopLivePreview,
  stopVideoWorker,
  subscribeVideoWorker,
  syncVideoWorkerDatabase,
  type FaceBox,
} from '../runtime';
import { workerFaceToBox } from '../capture/videoWorker';
import { mergeLiveness } from '../capture/captureLogic';

export type IdentifySettings = {
  frontCamera: boolean;
  matchThreshold: number;
  livenessLevel: 0 | 1;
  frameIntervalMs?: number;
  livenessIntervalMs?: number;
};

export type IdentifySessionOptions = {
  settings: IdentifySettings;
  featureTemplates: string[];
  onTracking: (boxes: FaceBox[], frame: { w: number; h: number }) => void;
  onMatch: (personIndex: number, score: number) => void;
};

export class IdentifySession {
  readonly settings: IdentifySettings;
  readonly featureTemplates: string[];
  readonly onTracking: IdentifySessionOptions['onTracking'];
  readonly onMatch: IdentifySessionOptions['onMatch'];

  lastLiveness: FaceBox[] = [];
  frameSize = { w: 480, h: 640 };
  lastUri: string | null = null;

  private unsubscribe: (() => void) | null = null;
  private cancelled = false;
  private workerReady = false;
  private livBusy = false;
  private lastLivenessMs = 0;
  private pollPromise: Promise<void> | null = null;

  constructor(opts: IdentifySessionOptions) {
    this.settings = opts.settings;
    this.featureTemplates = opts.featureTemplates;
    this.onTracking = opts.onTracking;
    this.onMatch = opts.onMatch;
  }

  /** Native front preview is mirrored on both platforms; engine frames are not. */
  get overlayMirror(): boolean {
    return this.settings.frontCamera;
  }

  async start(): Promise<void> {
    this.cancelled = false;
    await startLivePreview(this.settings.frontCamera);
    this.unsubscribe = subscribeVideoWorker((ev) => {
      if (this.cancelled) return;
      if (ev.type === 'tracking') {
        if (ev.frameWidth > 0 && ev.frameHeight > 0) {
          this.frameSize = { w: ev.frameWidth, h: ev.frameHeight };
        }
        let next = ev.faces.map(workerFaceToBox);
        next = mergeLiveness(next, this.lastLiveness);
        this.onTracking(next, this.frameSize);
        for (const f of ev.faces) {
          if (f.match?.matched && f.match.personIndex != null) {
            this.onMatch(f.match.personIndex, f.match.score ?? 0);
            break;
          }
        }
      } else if (ev.type === 'match' && ev.matched && ev.personIndex != null) {
        this.onMatch(ev.personIndex, ev.score ?? 0);
      }
    });

    const started = await startVideoWorker({
      matchThreshold: this.settings.matchThreshold,
    });
    const synced = await syncVideoWorkerDatabase(
      this.featureTemplates,
      this.settings.matchThreshold
    );
    if (!this.cancelled) {
      this.workerReady = started === 0 && synced === 0;
    }
    this.pollPromise = this.livenessLoop();
  }

  async stop(): Promise<void> {
    this.cancelled = true;
    this.workerReady = false;
    this.unsubscribe?.();
    this.unsubscribe = null;
    await stopVideoWorker();
    await stopLivePreview();
    await this.pollPromise;
    this.pollPromise = null;
  }

  async dispose(): Promise<void> {
    await this.stop();
  }

  private async livenessLoop(): Promise<void> {
    const sleep = (ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms));
    const interval = this.settings.livenessIntervalMs ?? 450;
    while (!this.cancelled) {
      if (!this.workerReady || this.livBusy) {
        await sleep(80);
        continue;
      }
      const now = Date.now();
      if (now - this.lastLivenessMs < interval) {
        await sleep(80);
        continue;
      }
      this.lastLivenessMs = now;
      this.livBusy = true;
      try {
        const exported = await exportLastLiveFrame();
        if (exported.uri) {
          this.lastUri = exported.uri;
          const liv = await faceDetection(exported.uri, {
            check_liveness: true,
            check_liveness_level: this.settings.livenessLevel,
            check_pose: false,
            check_landmarks: false,
            check_eye_closeness: false,
          });
          if (liv.length > 0) this.lastLiveness = liv;
        }
      } catch {
        // Side detect optional until the camera warms up.
      } finally {
        this.livBusy = false;
      }
      await sleep(interval);
    }
  }
}

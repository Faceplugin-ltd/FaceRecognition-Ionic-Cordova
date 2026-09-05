import { nativeCall, nativeListen, getCordovaPlatform } from './cordovaExec';
import type { FaceRecognitionSdkPlugin } from './definitions';
import {
  normalizeFaceBox,
  normalizeFaceBoxes,
} from './normalizeFaceBox';
import { planLiveFrame, LIVE_FRAME_MAX_EDGE } from './liveFramePrep';
import {
  parseVideoWorkerEvent,
  type VideoWorkerEvent,
} from './capture/videoWorker';
import {
  resultDetailRows,
  livenessPassed,
  qualityText,
  type DetailRow,
  type ResultDisplaySettings,
} from './resultDetails';

const SERVICE = 'FaceRecognitionSdk';

const FaceRecognitionSdkNative: FaceRecognitionSdkPlugin = {
  getMachineCode: () => nativeCall(SERVICE, 'getMachineCode'),
  setActivation: (options) => nativeCall(SERVICE, 'setActivation', [options]),
  init: () => nativeCall(SERVICE, 'init'),
  deinit: () => nativeCall(SERVICE, 'deinit'),
  lastLicenseError: () => nativeCall(SERVICE, 'lastLicenseError'),
  setLandmarkMode: (options) =>
    nativeCall(SERVICE, 'setLandmarkMode', [options]),
  getLandmarkMode: () => nativeCall(SERVICE, 'getLandmarkMode'),
  detect: (options) => nativeCall(SERVICE, 'detect', [options]),
  faceDetection: (options) => nativeCall(SERVICE, 'faceDetection', [options]),
  templateExtraction: (options) =>
    nativeCall(SERVICE, 'templateExtraction', [options]),
  cropFace: (options) => nativeCall(SERVICE, 'cropFace', [options]),
  extractFeature: (options) =>
    nativeCall(SERVICE, 'extractFeature', [options]),
  similarity: (options) => nativeCall(SERVICE, 'similarity', [options]),
  quality: (options) => nativeCall(SERVICE, 'quality', [options]),
  startVideoWorker: (options) =>
    nativeCall(SERVICE, 'startVideoWorker', [options ?? {}]),
  stopVideoWorker: () => nativeCall(SERVICE, 'stopVideoWorker'),
  syncVideoWorkerDatabase: (options) =>
    nativeCall(SERVICE, 'syncVideoWorkerDatabase', [options]),
  probeLiveImage: (options) =>
    nativeCall(SERVICE, 'probeLiveImage', [options]),
  applyLiveFrame: (options) =>
    nativeCall(SERVICE, 'applyLiveFrame', [options]),
  exportLastLiveFrame: (options) =>
    nativeCall(SERVICE, 'exportLastLiveFrame', [options ?? {}]),
  writeStatus: (options) => nativeCall(SERVICE, 'writeStatus', [options]),
  estimatorStatus: () => nativeCall(SERVICE, 'estimatorStatus'),
  startLivePreview: (options) =>
    nativeCall(SERVICE, 'startLivePreview', [options ?? {}]),
  stopLivePreview: () => nativeCall(SERVICE, 'stopLivePreview'),
  takeLiveSnapshot: () => nativeCall(SERVICE, 'takeLiveSnapshot'),
  addListener: async (eventName, listener) => {
    if (eventName !== 'FaceRecognitionVideoWorkerEvent') {
      return {
        remove: async () => {
          /* unsupported event */
        },
      };
    }
    const remove = nativeListen(SERVICE, 'addVideoWorkerListener', (data) => {
      listener({
        json:
          typeof data?.json === 'string'
            ? data.json
            : String(data?.json ?? '{}'),
      });
    });
    return {
      remove: async () => {
        remove();
      },
    };
  },
};

export type ImageInput = string;

export type LiveCameraPhoto = {
  path: string;
  orientation?: string;
  width?: number;
  height?: number;
};

export type LiveFrameInput = ImageInput | LiveCameraPhoto;

export type LiveFrameOptions = {
  frontCamera?: boolean;
  orientation?: string;
  rotateDegrees?: number;
  maxEdge?: number;
};

export type FaceBox = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  yaw?: number;
  roll?: number;
  pitch?: number;
  liveness?: number;
  face_quality?: number;
  face_luminance?: number;
  left_eye_closed?: number;
  right_eye_closed?: number;
  face_occlusion?: number;
  mouth_opened?: number;
  age?: number;
  gender?: number;
  livenessLabel?: string;
  genderLabel?: string;
  emotionLabel?: string;
  maskLabel?: string;
  qualityLabel?: string;
  eyesLeftLabel?: string;
  eyesRightLabel?: string;
  glassesLabel?: string;
  sunglassesLabel?: string;
  occlusionLabel?: string;
  attributes?: Record<string, string>;
  landmarkCount?: number;
  landmarks?: number[];
};

export type FaceDetectionParam = {
  allAttributes?: boolean;
  check_liveness?: boolean;
  check_liveness_level?: number;
  check_eye_closeness?: boolean;
  check_face_occlusion?: boolean;
  estimate_age_gender?: boolean;
  check_pose?: boolean;
  check_landmarks?: boolean;
  check_quality?: boolean;
  check_emotion?: boolean;
  check_mask?: boolean;
  check_glasses?: boolean;
};

export type VideoWorkerConfig = {
  matchThreshold?: number;
};

export type LiveFrameResult = {
  ingested: boolean;
  width: number;
  height: number;
  uri?: string | null;
  /** Compact JPEG base64 (no data: prefix) for Cordova WebView <img>. */
  previewB64?: string | null;
  /** @deprecated prefer previewB64 — kept for older builds. */
  previewDataUrl?: string | null;
};

export async function getMachineCode(): Promise<string> {
  const { value } = await FaceRecognitionSdkNative.getMachineCode();
  return value;
}

export async function setActivation(license: string): Promise<number> {
  const { value } = await FaceRecognitionSdkNative.setActivation({ license });
  return value;
}

export async function init(): Promise<number> {
  const { value } = await FaceRecognitionSdkNative.init();
  return value;
}

export async function deinit(): Promise<void> {
  await FaceRecognitionSdkNative.deinit();
}

export async function lastLicenseError(): Promise<string> {
  const { value } = await FaceRecognitionSdkNative.lastLicenseError();
  return value;
}

export async function setLandmarkMode(mode: number): Promise<number> {
  const { value } = await FaceRecognitionSdkNative.setLandmarkMode({ mode });
  return value;
}

export async function getLandmarkMode(): Promise<number> {
  const { value } = await FaceRecognitionSdkNative.getLandmarkMode();
  return value;
}

export async function detect(
  image: ImageInput,
  crop: boolean = false,
  flags: number = DETECT_ALL
): Promise<string> {
  const { value } = await FaceRecognitionSdkNative.detect({
    image,
    crop,
    flags,
  });
  return value;
}

export async function faceDetection(
  image: ImageInput,
  param?: FaceDetectionParam | null
): Promise<FaceBox[]> {
  const { value } = await FaceRecognitionSdkNative.faceDetection({
    image,
    param: param ? JSON.stringify(param) : null,
  });
  try {
    const parsed = JSON.parse(value);
    return normalizeFaceBoxes(Array.isArray(parsed) ? parsed : []) as FaceBox[];
  } catch {
    return [];
  }
}

export async function templateExtraction(
  image: ImageInput,
  faceBox: FaceBox | string
): Promise<string> {
  const boxJson = typeof faceBox === 'string' ? faceBox : JSON.stringify(faceBox);
  const { value } = await FaceRecognitionSdkNative.templateExtraction({
    image,
    faceBox: boxJson,
  });
  return value;
}

export async function cropFace(
  image: ImageInput,
  faceBox: FaceBox | string
): Promise<string> {
  const boxJson = typeof faceBox === 'string' ? faceBox : JSON.stringify(faceBox);
  const { value } = await FaceRecognitionSdkNative.cropFace({
    image,
    faceBox: boxJson,
  });
  return value;
}

export async function extractFeature(image: ImageInput): Promise<string> {
  const { value } = await FaceRecognitionSdkNative.extractFeature({ image });
  return value;
}

export async function similarity(
  feature1B64: string,
  feature2B64: string
): Promise<number> {
  const { value } = await FaceRecognitionSdkNative.similarity({
    feature1: feature1B64,
    feature2: feature2B64,
  });
  return value;
}

export async function quality(
  image: ImageInput,
  crop: boolean = false
): Promise<string> {
  const { value } = await FaceRecognitionSdkNative.quality({ image, crop });
  return value;
}

export async function startVideoWorker(
  config: VideoWorkerConfig | string = { matchThreshold: 0.67 }
): Promise<number> {
  const json = typeof config === 'string' ? config : JSON.stringify(config ?? {});
  const { value } = await FaceRecognitionSdkNative.startVideoWorker({
    config: json,
  });
  return value;
}

export async function stopVideoWorker(): Promise<void> {
  await FaceRecognitionSdkNative.stopVideoWorker();
}

export async function syncVideoWorkerDatabase(
  featuresB64: string[],
  matchThreshold: number = 0.67
): Promise<number> {
  const { value } = await FaceRecognitionSdkNative.syncVideoWorkerDatabase({
    features: featuresB64,
    matchThreshold,
  });
  return value;
}

function normalizeLiveFrameResult(raw: {
  ingested?: boolean;
  width?: number;
  height?: number;
  uri?: string | null;
  previewB64?: string | null;
  previewDataUrl?: string | null;
}): LiveFrameResult {
  return {
    ingested: Boolean(raw?.ingested),
    width: Number(raw?.width) || 0,
    height: Number(raw?.height) || 0,
    uri: typeof raw?.uri === 'string' ? raw.uri : null,
    previewB64: typeof raw?.previewB64 === 'string' ? raw.previewB64 : null,
    previewDataUrl:
      typeof raw?.previewDataUrl === 'string' ? raw.previewDataUrl : null,
  };
}

function resolveLiveUri(input: LiveFrameInput): string {
  if (typeof input === 'string') {
    if (
      input.startsWith('file://') ||
      input.startsWith('content:') ||
      input.startsWith('data:')
    ) {
      return input;
    }
    if (input.startsWith('/')) {
      return `file://${input}`;
    }
    return input;
  }
  const path = input?.path;
  if (!path || typeof path !== 'string') {
    throw new Error('ingestLiveCameraFrame: expected a URI string or { path }');
  }
  return path.startsWith('file://') || path.startsWith('content:')
    ? path
    : `file://${path}`;
}

function resolveLiveArgs(
  input: LiveFrameInput,
  frontOrOptions?: boolean | LiveFrameOptions,
  orientationArg?: string
): { uri: string; options: LiveFrameOptions } {
  if (typeof input === 'string' || (input && typeof input === 'object' && 'path' in input)) {
    if (typeof frontOrOptions === 'boolean') {
      return {
        uri: resolveLiveUri(input),
        options: {
          frontCamera: frontOrOptions,
          orientation:
            typeof orientationArg === 'string'
              ? orientationArg
              : typeof input === 'object'
                ? input.orientation
                : undefined,
        },
      };
    }
    const opts =
      frontOrOptions && typeof frontOrOptions === 'object' ? frontOrOptions : {};
    const photoOrient =
      typeof input === 'object' && input && 'orientation' in input
        ? (input as LiveCameraPhoto).orientation
        : undefined;
    return {
      uri: resolveLiveUri(input),
      options: {
        frontCamera: opts.frontCamera !== false,
        orientation: opts.orientation ?? photoOrient,
        rotateDegrees: opts.rotateDegrees,
        maxEdge: opts.maxEdge,
      },
    };
  }
  throw new Error('ingestLiveCameraFrame: invalid arguments');
}

async function prepareAndMaybeFeed(
  input: LiveFrameInput,
  frontOrOptions?: boolean | LiveFrameOptions,
  orientationArg?: string,
  feedWorker: boolean = true
): Promise<LiveFrameResult> {
  const { uri, options } = resolveLiveArgs(input, frontOrOptions, orientationArg);
  const maxEdge =
    options.maxEdge != null && options.maxEdge > 0
      ? options.maxEdge
      : LIVE_FRAME_MAX_EDGE;

  let rotateDegrees: number;
  if (options.rotateDegrees != null && Number.isFinite(options.rotateDegrees)) {
    rotateDegrees = options.rotateDegrees;
  } else {
    const probed = await FaceRecognitionSdkNative.probeLiveImage({ image: uri });
    const plan = planLiveFrame({
      frontCamera: options.frontCamera !== false,
      orientation: options.orientation,
      width: Number(probed?.width) || 0,
      height: Number(probed?.height) || 0,
      maxEdge,
      platform: getCordovaPlatform(),
    });
    rotateDegrees = plan.rotateDegrees;
  }

  const raw = await FaceRecognitionSdkNative.applyLiveFrame({
    image: uri,
    rotateDegrees,
    maxEdge,
    feedWorker,
  });
  return normalizeLiveFrameResult(raw);
}

export function ingestLiveCameraFrame(
  input: LiveFrameInput,
  frontOrOptions?: boolean | LiveFrameOptions,
  orientation?: string
): Promise<LiveFrameResult> {
  return prepareAndMaybeFeed(input, frontOrOptions, orientation, true);
}

export async function prepareLiveCameraFrame(
  input: LiveFrameInput,
  frontOrOptions?: boolean | LiveFrameOptions,
  orientation?: string
): Promise<string> {
  const result = await prepareAndMaybeFeed(
    input,
    frontOrOptions,
    orientation,
    false
  );
  if (!result.uri) {
    throw new Error('prepareLiveCameraFrame: no output URI');
  }
  return result.uri;
}

export async function addVideoWorkerFrame(
  input: LiveFrameInput,
  frontOrOptions?: boolean | LiveFrameOptions,
  orientation?: string
): Promise<number> {
  const result = await prepareAndMaybeFeed(
    input,
    frontOrOptions,
    orientation,
    true
  );
  return result.ingested ? 0 : 1;
}

export async function exportLastLiveFrame(options?: {
  preview?: boolean;
}): Promise<LiveFrameResult> {
  const raw = await FaceRecognitionSdkNative.exportLastLiveFrame(
    options ?? {}
  );
  return normalizeLiveFrameResult(raw);
}

export async function writeStatus(
  payload: Record<string, unknown>
): Promise<void> {
  await FaceRecognitionSdkNative.writeStatus({
    payload: JSON.stringify(payload),
  });
}

export async function estimatorStatus(): Promise<string> {
  const { value } = await FaceRecognitionSdkNative.estimatorStatus();
  return value;
}

export async function startLivePreview(frontCamera: boolean = true): Promise<void> {
  if (typeof document !== 'undefined') {
    document.documentElement.classList.add('frs-live-camera');
  }
  await FaceRecognitionSdkNative.startLivePreview({ frontCamera });
}

export async function stopLivePreview(): Promise<void> {
  try {
    await FaceRecognitionSdkNative.stopLivePreview();
  } finally {
    if (typeof document !== 'undefined') {
      document.documentElement.classList.remove('frs-live-camera');
    }
  }
}

export async function takeLiveSnapshot(): Promise<LiveCameraPhoto> {
  const snap = await FaceRecognitionSdkNative.takeLiveSnapshot();
  return { path: snap.path || snap.uri };
}

export function subscribeVideoWorker(
  cb: (ev: VideoWorkerEvent) => void
): () => void {
  let removed = false;
  const handle = FaceRecognitionSdkNative.addListener(
    'FaceRecognitionVideoWorkerEvent',
    (event) => {
      const ev = parseVideoWorkerEvent(
        typeof event?.json === 'string' ? event.json : '{}'
      );
      if (ev) cb(ev);
    }
  );
  return () => {
    if (removed) return;
    removed = true;
    void handle.then((h) => h.remove());
  };
}

export const SDK_SUCCESS = 0;
export const SDK_LICENSE_INVALID = 1;
export const SDK_LICENSE_EXPIRED = 2;
export const SDK_NOT_ACTIVATED = 3;
export const SDK_INIT_FAILED = 4;

export const DETECT_POSE = 1 << 0;
export const DETECT_LANDMARKS = 1 << 1;
export const DETECT_AGE = 1 << 2;
export const DETECT_GENDER = 1 << 3;
export const DETECT_EMOTION = 1 << 4;
export const DETECT_MASK = 1 << 5;
export const DETECT_QUALITY = 1 << 6;
export const DETECT_FACE_QUALITY = 1 << 7;
export const DETECT_EYES = 1 << 8;
export const DETECT_LIVENESS = 1 << 9;
export const DETECT_GLASSES = 1 << 11;
export const DETECT_LIVENESS_ACCURATE = 1 << 16;
export const DETECT_ALL = 0xffffffff;

export const LANDMARK_MODE_14 = 14;
export const LANDMARK_MODE_68 = 68;
export const LANDMARK_MODE_468 = 468;

export { normalizeFaceBox, normalizeFaceBoxes };
export { planLiveFrame, LIVE_FRAME_MAX_EDGE };
export { FaceRecognitionSdkNative as FaceRecognitionSdk };
export { resultDetailRows, livenessPassed, qualityText };
export type { DetailRow, ResultDisplaySettings, VideoWorkerEvent };
export type { FaceRecognitionSdkPlugin } from './definitions';
export {
  parseVideoWorkerEvent,
  workerFaceToBox,
} from './capture/videoWorker';
export {
  checkFace,
  warningFor,
  getROIRect1,
  mapRoiToView,
  mapFramePoint,
  mapLandmarksToCrop,
  mergeLiveness,
  mergeEyes,
  hasLiveness,
} from './capture/captureLogic';
export type { CaptureState } from './capture/captureLogic';
export {
  DEFAULT_CAPTURE_SETTINGS,
  toCaptureSettings,
} from './capture/types';
export type { CaptureSettings, CaptureResult } from './capture/types';

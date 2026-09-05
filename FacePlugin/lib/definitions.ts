export interface FaceRecognitionSdkPlugin {
  getMachineCode(): Promise<{ value: string }>;
  setActivation(options: { license: string }): Promise<{ value: number }>;
  init(): Promise<{ value: number }>;
  deinit(): Promise<void>;
  lastLicenseError(): Promise<{ value: string }>;
  setLandmarkMode(options: { mode: number }): Promise<{ value: number }>;
  getLandmarkMode(): Promise<{ value: number }>;
  detect(options: {
    image: string;
    crop?: boolean;
    flags?: number;
  }): Promise<{ value: string }>;
  faceDetection(options: {
    image: string;
    param?: string | null;
  }): Promise<{ value: string }>;
  templateExtraction(options: {
    image: string;
    faceBox: string;
  }): Promise<{ value: string }>;
  cropFace(options: {
    image: string;
    faceBox: string;
  }): Promise<{ value: string }>;
  extractFeature(options: { image: string }): Promise<{ value: string }>;
  similarity(options: {
    feature1: string;
    feature2: string;
  }): Promise<{ value: number }>;
  quality(options: {
    image: string;
    crop?: boolean;
  }): Promise<{ value: string }>;
  startVideoWorker(options?: { config?: string }): Promise<{ value: number }>;
  stopVideoWorker(): Promise<void>;
  syncVideoWorkerDatabase(options: {
    features: string[];
    matchThreshold?: number;
  }): Promise<{ value: number }>;
  probeLiveImage(options: { image: string }): Promise<{
    width: number;
    height: number;
  }>;
  applyLiveFrame(options: {
    image: string;
    rotateDegrees: number;
    maxEdge: number;
    feedWorker: boolean;
  }): Promise<{
    ingested: boolean;
    width: number;
    height: number;
    uri?: string | null;
  }>;
  exportLastLiveFrame(options?: {
    preview?: boolean;
  }): Promise<{
    ingested: boolean;
    width: number;
    height: number;
    uri?: string | null;
    /** Compact JPEG base64 (no data: prefix) for Cordova WebView <img>. */
    previewB64?: string | null;
    previewDataUrl?: string | null;
  }>;
  writeStatus(options: { payload: string }): Promise<void>;
  estimatorStatus(): Promise<{ value: string }>;
  startLivePreview(options?: { frontCamera?: boolean }): Promise<void>;
  stopLivePreview(): Promise<void>;
  takeLiveSnapshot(): Promise<{ uri: string; path: string }>;
  addListener(
    eventName: 'FaceRecognitionVideoWorkerEvent',
    listener: (event: { json: string }) => void
  ): Promise<{ remove: () => Promise<void> }>;
}

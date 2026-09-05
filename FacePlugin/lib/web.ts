import type { FaceRecognitionSdkPlugin } from './definitions';

const MSG =
  'Face Recognition SDK requires a native Android or iOS Cordova build.';

function unimplemented(): never {
  throw new Error(MSG);
}

/** Browser stub — native Cordova plugin is required on device. */
export class FaceRecognitionSdkWeb implements FaceRecognitionSdkPlugin {
  async getMachineCode(): Promise<{ value: string }> {
    unimplemented();
  }
  async setActivation(): Promise<{ value: number }> {
    unimplemented();
  }
  async init(): Promise<{ value: number }> {
    unimplemented();
  }
  async deinit(): Promise<void> {
    unimplemented();
  }
  async lastLicenseError(): Promise<{ value: string }> {
    unimplemented();
  }
  async setLandmarkMode(): Promise<{ value: number }> {
    unimplemented();
  }
  async getLandmarkMode(): Promise<{ value: number }> {
    unimplemented();
  }
  async detect(): Promise<{ value: string }> {
    unimplemented();
  }
  async faceDetection(): Promise<{ value: string }> {
    unimplemented();
  }
  async templateExtraction(): Promise<{ value: string }> {
    unimplemented();
  }
  async cropFace(): Promise<{ value: string }> {
    unimplemented();
  }
  async extractFeature(): Promise<{ value: string }> {
    unimplemented();
  }
  async similarity(): Promise<{ value: number }> {
    unimplemented();
  }
  async quality(): Promise<{ value: string }> {
    unimplemented();
  }
  async startVideoWorker(): Promise<{ value: number }> {
    unimplemented();
  }
  async stopVideoWorker(): Promise<void> {
    unimplemented();
  }
  async syncVideoWorkerDatabase(): Promise<{ value: number }> {
    unimplemented();
  }
  async probeLiveImage(): Promise<{ width: number; height: number }> {
    unimplemented();
  }
  async applyLiveFrame(): Promise<{
    ingested: boolean;
    width: number;
    height: number;
    uri?: string | null;
  }> {
    unimplemented();
  }
  async exportLastLiveFrame(): Promise<{
    ingested: boolean;
    width: number;
    height: number;
    uri?: string | null;
  }> {
    unimplemented();
  }
  async writeStatus(): Promise<void> {
    unimplemented();
  }
  async estimatorStatus(): Promise<{ value: string }> {
    unimplemented();
  }
  async startLivePreview(): Promise<void> {
    unimplemented();
  }
  async stopLivePreview(): Promise<void> {
    unimplemented();
  }
  async takeLiveSnapshot(): Promise<{ uri: string; path: string }> {
    unimplemented();
  }
  async addListener(): Promise<{ remove: () => Promise<void> }> {
    unimplemented();
  }
}

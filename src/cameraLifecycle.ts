import { stopLivePreview } from 'face-recognition-cordova';

/** Ensure native preview is stopped when leaving Identify/Capture (Ion keeps pages mounted). */
export async function ensureCameraStopped(): Promise<void> {
  try {
    await stopLivePreview();
  } catch {
    /* already stopped / not started */
  }
}

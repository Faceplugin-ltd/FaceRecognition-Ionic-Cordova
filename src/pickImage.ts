import { convertFileSrc } from 'face-recognition-cordova';

declare global {
  interface Navigator {
    camera?: {
      getPicture: (
        success: (data: string) => void,
        error: (err: string) => void,
        options?: Record<string, unknown>
      ) => void;
      DestinationType?: { FILE_URI: number; DATA_URL: number };
      PictureSourceType?: {
        PHOTOLIBRARY: number;
        CAMERA: number;
        SAVEDPHOTOALBUM: number;
      };
      EncodingType?: { JPEG: number; PNG: number };
      MediaType?: { PICTURE: number };
    };
  }
}

/**
 * Cordova WebView (https://localhost) cannot load content:// or raw file:// in <img>.
 * Prefer DATA_URL so gallery preview, measureImage, and native detect/crop share one payload.
 */
export async function pickGalleryPhoto(): Promise<string> {
  const cam = navigator.camera;
  if (!cam?.getPicture) {
    throw new Error(
      'cordova-plugin-camera is not available. Run on a Cordova device build.'
    );
  }
  const DestinationType = cam.DestinationType ?? { FILE_URI: 1, DATA_URL: 0 };
  const PictureSourceType = cam.PictureSourceType ?? {
    PHOTOLIBRARY: 0,
    CAMERA: 1,
    SAVEDPHOTOALBUM: 2,
  };
  const EncodingType = cam.EncodingType ?? { JPEG: 0, PNG: 1 };
  const MediaType = cam.MediaType ?? { PICTURE: 0 };

  const data = await new Promise<string>((resolve, reject) => {
    cam.getPicture(
      (raw) => resolve(raw),
      (err) => reject(new Error(String(err || 'No photo selected'))),
      {
        quality: 90,
        destinationType: DestinationType.DATA_URL,
        sourceType: PictureSourceType.PHOTOLIBRARY,
        encodingType: EncodingType.JPEG,
        mediaType: MediaType.PICTURE,
        correctOrientation: true,
        targetWidth: 1280,
        targetHeight: 1280,
      }
    );
  });

  if (!data) throw new Error('No photo selected');
  if (data.startsWith('data:')) return data;
  return `data:image/jpeg;base64,${data}`;
}

export function thumbSrc(b64: string | null | undefined): string | undefined {
  if (!b64) return undefined;
  return b64.startsWith('data:') ? b64 : `data:image/jpeg;base64,${b64}`;
}

export function displayUri(uri: string | null | undefined): string | undefined {
  if (!uri) return undefined;
  if (
    uri.startsWith('data:') ||
    uri.startsWith('blob:') ||
    uri.startsWith('http')
  ) {
    return uri;
  }
  try {
    return convertFileSrc(uri);
  } catch {
    return uri;
  }
}

export function measureImage(uri: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () =>
      resolve({
        w: img.naturalWidth || img.width,
        h: img.naturalHeight || img.height,
      });
    img.onerror = () => resolve({ w: 0, h: 0 });
    img.src = displayUri(uri) ?? uri;
  });
}

/** Match native ImageUtils.ENGINE_MAX_SIDE — face boxes are in this prepared space. */
export const ENGINE_MAX_SIDE = 1280;

export function engineImageSize(
  w: number,
  h: number,
  maxSide: number = ENGINE_MAX_SIDE
): { w: number; h: number } {
  if (w <= 0 || h <= 0) return { w, h };
  const edge = Math.max(w, h);
  if (edge <= maxSide) return { w, h };
  const scale = maxSide / edge;
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

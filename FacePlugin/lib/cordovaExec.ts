/** Cordova exec helper — Promise wrapper around cordova.exec. */

function getCordova(): any {
  if (typeof window === 'undefined') return null;
  return (window as any).cordova ?? null;
}

export function cordovaAvailable(): boolean {
  return Boolean(getCordova()?.exec);
}

export function getCordovaPlatform(): string {
  const c = getCordova();
  const p = c?.platformId;
  if (typeof p === 'string' && p) return p;
  return 'web';
}

/**
 * Convert a file URI for display in the Cordova WebView.
 * Prefer data:/blob:/http(s) inputs from the app; do not invent http://localhost
 * rewrites (Cordova Android serves the app as https://localhost).
 */
export function convertFileSrc(uri: string): string {
  if (!uri) return uri;
  if (
    uri.startsWith('data:') ||
    uri.startsWith('blob:') ||
    uri.startsWith('http://') ||
    uri.startsWith('https://') ||
    uri.startsWith('cdvfile:')
  ) {
    return uri;
  }
  const c = getCordova();
  try {
    const conv = c?.convertFileSrc ?? c?.file?.convertFileSrc;
    if (typeof conv === 'function') return conv.call(c, uri);
  } catch {
    /* fall through */
  }
  try {
    const wk = (window as any).WkWebView?.convertFilePath;
    if (typeof wk === 'function' && uri.startsWith('file:')) {
      return wk(uri);
    }
  } catch {
    /* fall through */
  }
  return uri;
}

export function nativeCall<T = any>(
  service: string,
  action: string,
  args: unknown[] = []
): Promise<T> {
  return new Promise((resolve, reject) => {
    const cordova = getCordova();
    if (!cordova?.exec) {
      reject(
        new Error(
          `Cordova not available (call ${service}.${action} on device)`
        )
      );
      return;
    }
    cordova.exec(
      (result: T) => resolve(result),
      (err: unknown) => {
        if (err && typeof err === 'object' && 'message' in (err as any)) {
          reject(new Error(String((err as any).message)));
        } else {
          reject(
            new Error(typeof err === 'string' ? err : JSON.stringify(err))
          );
        }
      },
      service,
      action,
      args
    );
  });
}

/** Keep-callback listener (Cordova PluginResult.keepCallback). */
export function nativeListen(
  service: string,
  action: string,
  onEvent: (data: any) => void,
  args: unknown[] = []
): () => void {
  const cordova = getCordova();
  let active = true;
  if (!cordova?.exec) {
    return () => {
      active = false;
    };
  }
  cordova.exec(
    (data: any) => {
      if (active) onEvent(data);
    },
    (_err: unknown) => {
      /* ignore listener errors */
    },
    service,
    action,
    args
  );
  return () => {
    active = false;
    try {
      cordova.exec(
        () => {},
        () => {},
        service,
        'removeVideoWorkerListener',
        []
      );
    } catch {
      /* optional */
    }
  };
}

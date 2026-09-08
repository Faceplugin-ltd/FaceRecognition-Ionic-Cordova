/** Wait until Cordova has fired deviceready (or plugins are already usable). */
export function whenDeviceReady(timeoutMs = 8000): Promise<void> {
  return new Promise((resolve) => {
    const w = typeof window !== 'undefined' ? (window as any) : null;
    if (!w?.cordova) {
      resolve();
      return;
    }
    if (w.cordova.platformId) {
      resolve();
      return;
    }
    try {
      const channel = w.cordova.require?.('cordova/channel');
      if (channel?.onDeviceReady?.state === 2) {
        resolve();
        return;
      }
    } catch {
      /* listen below */
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    document.addEventListener('deviceready', finish, { once: true });
    setTimeout(finish, timeoutMs);
  });
}

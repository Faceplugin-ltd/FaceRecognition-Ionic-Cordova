/** Wait until Cordova has fired deviceready (or platformId is already set). */
export function whenDeviceReady(timeoutMs = 8000): Promise<void> {
  return new Promise((resolve) => {
    const w = typeof window !== 'undefined' ? (window as any) : null;
    if (w?.cordova?.platformId) {
      resolve();
      return;
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

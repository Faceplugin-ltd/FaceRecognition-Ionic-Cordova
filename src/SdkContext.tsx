import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  getMachineCode,
  init,
  lastLicenseError,
  setActivation,
  writeStatus,
  SDK_SUCCESS,
} from 'face-recognition-cordova';
import { demoLicense } from './license';
import { whenDeviceReady } from './deviceReady';

export type SdkState = {
  status: string;
  ready: boolean;
  machine: string;
  refresh: () => void;
};

const SdkContext = createContext<SdkState | null>(null);

function statusLabel(code: number): string {
  switch (code) {
    case 0:
      return 'Ready';
    case 1:
      return 'License invalid';
    case 2:
      return 'License expired';
    case 3:
      return 'Not activated';
    case 4:
      return 'Init failed';
    default:
      return `Failed (${code})`;
  }
}

export function SdkProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState('Loading native SDK…');
  const [ready, setReady] = useState(false);
  const [machine, setMachine] = useState('');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setStatus('Loading native SDK…');
        setReady(false);
        await whenDeviceReady();
        if (cancelled) return;
        const mc = await getMachineCode();
        console.log('[FaceRecognition] machine=', mc);
        if (!cancelled) setMachine(mc);
        const act = await setActivation(demoLicense());
        console.log('[FaceRecognition] setActivation=', act);
        if (act !== SDK_SUCCESS) {
          const detail = await lastLicenseError();
          console.log('[FaceRecognition] license error=', detail);
          if (!cancelled) {
            setStatus(`${statusLabel(act)}${detail ? `: ${detail}` : ''}`);
            setReady(false);
          }
          return;
        }
        const code = await init();
        console.log('[FaceRecognition] init=', code);
        if (!cancelled) {
          setStatus(statusLabel(code));
          setReady(code === SDK_SUCCESS);
          try {
            await writeStatus({
              step: 'js',
              status: statusLabel(code),
              ready: code === SDK_SUCCESS,
              machine: mc,
              code,
            });
          } catch {
            // ignore debug write failures
          }
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.log('[FaceRecognition] init exception=', msg);
        if (!cancelled) {
          setStatus(`Init error: ${msg}`);
          setReady(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  const value = useMemo(
    () => ({ status, ready, machine, refresh }),
    [status, ready, machine, refresh]
  );

  return <SdkContext.Provider value={value}>{children}</SdkContext.Provider>;
}

export function useSdk(): SdkState {
  const ctx = useContext(SdkContext);
  if (!ctx) throw new Error('useSdk must be used within SdkProvider');
  return ctx;
}

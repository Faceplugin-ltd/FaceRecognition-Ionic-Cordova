import { useCallback, useEffect, useRef, useState } from 'react';
import {
  IonPage,
  useIonAlert,
  useIonViewDidEnter,
  useIonViewWillLeave,
} from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { goHome } from '../nav';
import {
  IdentifySession,
  cropFace,
  faceDetection,
  livenessPassed,
  mapLandmarksToCrop,
  type FaceBox,
} from 'face-recognition-cordova';
import { loadPeople, loadSettings, type AppSettings } from '../FaceDatabase';
import { ensureCameraPermission } from '../cameraPermission';
import { ensureCameraStopped } from '../cameraLifecycle';
import FaceOverlay from '../components/FaceOverlay';
import { displayUri, measureImage, thumbSrc } from '../pickImage';
import { setIdentifyResult } from '../resultStore';

export default function Identify() {
  const history = useHistory();
  const [presentAlert] = useIonAlert();
  const stageRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<IdentifySession | null>(null);
  const bootGenRef = useRef(0);
  const recognizedRef = useRef(false);
  const confirmingRef = useRef(false);
  const boxesRef = useRef<FaceBox[]>([]);
  const settingsRef = useRef<AppSettings | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [boxes, setBoxes] = useState<FaceBox[]>([]);
  const [frame, setFrame] = useState({ w: 480, h: 640 });
  const [mirror, setMirror] = useState(false);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const stopCamera = useCallback(async () => {
    bootGenRef.current += 1;
    const session = sessionRef.current;
    sessionRef.current = null;
    if (session) {
      try {
        await session.stop();
      } catch {
        /* ignore */
      }
    }
    await ensureCameraStopped();
  }, []);

  const tryConfirm = useCallback(
    async (personIndex: number, score: number, people: Awaited<ReturnType<typeof loadPeople>>) => {
      const s = settingsRef.current;
      const session = sessionRef.current;
      if (!s || !session || recognizedRef.current) return;
      if (!session.lastLiveness.length) return;
      const live0 = session.lastLiveness[0];
      if (live0 && !livenessPassed(s, live0.liveness ?? 0, live0.livenessLabel)) {
        return;
      }
      if (confirmingRef.current) return;
      confirmingRef.current = true;
      const uri = session.lastUri;
      if (!uri) {
        confirmingRef.current = false;
        return;
      }
      try {
        const person = people[personIndex] ?? people[personIndex - 1];
        if (!person) {
          confirmingRef.current = false;
          return;
        }
        const detected = await faceDetection(uri, {
          allAttributes: true,
          check_liveness_level: s.liveness_level,
        });
        let faceBox =
          detected[0] ?? session.lastLiveness[0] ?? boxesRef.current[0] ?? null;
        if (!faceBox) {
          confirmingRef.current = false;
          return;
        }
        if (
          !livenessPassed(s, faceBox.liveness ?? 0, faceBox.livenessLabel) &&
          session.lastLiveness.length
        ) {
          const live = session.lastLiveness[0];
          if (live) {
            faceBox = {
              ...faceBox,
              liveness: live.liveness,
              livenessLabel: live.livenessLabel,
            };
          }
        }
        recognizedRef.current = true;
        const frameSize = { ...session.frameSize };
        await stopCamera();
        let identifiedUri = uri;
        let cropLandmarks: { x: number; y: number }[] = [];
        try {
          const cropB64 = await cropFace(uri, faceBox);
          identifiedUri = thumbSrc(cropB64) ?? displayUri(uri) ?? uri;
          const srcW = frameSize.w > 0 ? frameSize.w : Math.max(faceBox.x2 + 1, 1);
          const srcH = frameSize.h > 0 ? frameSize.h : Math.max(faceBox.y2 + 1, 1);
          let outW = 200;
          let outH = 200;
          const cropDisplay = thumbSrc(cropB64);
          if (cropDisplay) {
            const measured = await measureImage(cropDisplay);
            if (measured.w > 0 && measured.h > 0) {
              outW = measured.w;
              outH = measured.h;
            }
          }
          cropLandmarks = mapLandmarksToCrop(faceBox, srcW, srcH, outW, outH);
        } catch {
          identifiedUri = displayUri(uri) ?? uri;
        }
        setIdentifyResult({
          identifiedUri,
          enrolledThumbB64: person.thumbB64,
          personName: person.name,
          similarity: score,
          box: faceBox,
          cropLandmarks,
        });
        history.replace('/result');
      } catch {
        confirmingRef.current = false;
        recognizedRef.current = false;
      }
    },
    [history, stopCamera]
  );

  const startCamera = useCallback(async () => {
    if (sessionRef.current) return;
    const gen = ++bootGenRef.current;
    recognizedRef.current = false;
    confirmingRef.current = false;
    boxesRef.current = [];
    setBoxes([]);
    try {
      await ensureCameraPermission();
      if (gen !== bootGenRef.current) return;
      const [people, loaded] = await Promise.all([loadPeople(), loadSettings()]);
      if (gen !== bootGenRef.current) return;
      setSettings(loaded);
      settingsRef.current = loaded;
      if (!people.length) {
        presentAlert({
          header: 'Identify',
          message: 'Enroll at least one person first.',
          buttons: [{ text: 'OK', handler: () => goHome(history) }],
        });
        return;
      }
      const session = new IdentifySession({
        settings: {
          frontCamera: loaded.camera_lens === 'front',
          matchThreshold: loaded.identify_threshold,
          livenessLevel: loaded.liveness_level,
        },
        featureTemplates: people.map((p) => p.featureB64),
        onTracking: (next, nextSize) => {
          if (recognizedRef.current) return;
          boxesRef.current = next;
          setBoxes(next);
          setFrame(nextSize);
        },
        onMatch: (personIndex, score) => {
          void tryConfirm(personIndex, score, people);
        },
      });
      if (gen !== bootGenRef.current) return;
      sessionRef.current = session;
      setMirror(session.overlayMirror);
      await session.start();
      if (gen !== bootGenRef.current) {
        await session.stop().catch(() => undefined);
        if (sessionRef.current === session) sessionRef.current = null;
        await ensureCameraStopped();
      }
    } catch (e) {
      if (gen !== bootGenRef.current) return;
      sessionRef.current = null;
      presentAlert({
        header: 'Identify',
        message: e instanceof Error ? e.message : String(e),
        buttons: ['OK'],
      });
    }
  }, [history, presentAlert, tryConfirm]);

  useIonViewDidEnter(() => {
    void startCamera();
  });

  useIonViewWillLeave(() => {
    void stopCamera();
  });

  useEffect(() => {
    return () => {
      void stopCamera();
    };
  }, [stopCamera]);

  return (
    <IonPage className="live-page">
      <div className="live-stage" ref={stageRef}>
        {settings ? (
          <FaceOverlay
            width={size.w}
            height={size.h}
            frameW={frame.w}
            frameH={frame.h}
            mirror={mirror}
            boxes={boxes}
            settings={settings}
          />
        ) : null}
        <button
          type="button"
          className="live-back"
          onClick={() => {
            void stopCamera().then(() => goHome(history));
          }}
        >
          ←
        </button>
      </div>
    </IonPage>
  );
}

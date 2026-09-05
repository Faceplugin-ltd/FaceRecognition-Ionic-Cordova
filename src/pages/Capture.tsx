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
  CaptureSession,
  exportLastLiveFrame,
  qualityText,
  toCaptureSettings,
  type CaptureResult,
  type CaptureSettings,
  type CaptureState,
  type FaceBox,
} from 'face-recognition-cordova';
import { cropFace, templateExtraction } from 'face-recognition-cordova';
import { addPerson, autoPersonName, loadSettings } from '../FaceDatabase';
import { ensureCameraPermission } from '../cameraPermission';
import { ensureCameraStopped } from '../cameraLifecycle';
import { displayUri, thumbSrc } from '../pickImage';
import CaptureOverlay, {
  type CaptureViewMode,
} from '../components/CaptureOverlay';
import enrollGradient from '../assets/tiles/gradient_back.png';

/**
 * Cordova WebView (https://localhost) cannot paint raw file:// in <img>.
 * Only data: / http(s) / cdvfile: are safe — never fall back to file://.
 */
function livePreviewSrc(exported: {
  previewB64?: string | null;
  previewDataUrl?: string | null;
  uri?: string | null;
}): string | null {
  const fromB64 = thumbSrc(exported.previewB64);
  if (fromB64) return fromB64;
  if (exported.previewDataUrl?.startsWith('data:')) return exported.previewDataUrl;
  const converted = displayUri(exported.uri);
  if (
    converted &&
    (converted.startsWith('data:') ||
      converted.startsWith('http://') ||
      converted.startsWith('https://') ||
      converted.startsWith('blob:') ||
      converted.startsWith('cdvfile:'))
  ) {
    return converted;
  }
  return null;
}

export default function Capture() {
  const history = useHistory();
  const [presentAlert] = useIonAlert();
  const stageRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<CaptureSession | null>(null);
  const bootGenRef = useRef(0);
  const viewModeRef = useRef<CaptureViewMode>('NO_FACE_PREPARE');
  const lastUriRef = useRef<string | null>(null);
  const capturedFaceRef = useRef<FaceBox | null>(null);
  const capturePreviewRef = useRef<string | null>(null);
  const [settings, setSettings] = useState<CaptureSettings | null>(null);
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [viewMode, setViewMode] = useState<CaptureViewMode>('NO_FACE_PREPARE');
  const [warning, setWarning] = useState('');
  const [faceBox, setFaceBox] = useState<FaceBox | null>(null);
  const [frameSize, setFrameSize] = useState({ w: 480, h: 640 });
  /** Full-frame preview for the capture circle (Cap-compatible). Never use cropFace here. */
  const [captureUri, setCaptureUri] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [captureResult, setCaptureResult] = useState<CaptureResult | null>(null);
  const [resultBox, setResultBox] = useState<FaceBox | null>(null);

  const setMode = useCallback((mode: CaptureViewMode) => {
    if (viewModeRef.current === mode) return;
    viewModeRef.current = mode;
    setViewMode(mode);
  }, []);

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

  const resetUi = useCallback(() => {
    viewModeRef.current = 'NO_FACE_PREPARE';
    lastUriRef.current = null;
    capturedFaceRef.current = null;
    capturePreviewRef.current = null;
    setViewMode('NO_FACE_PREPARE');
    setWarning('');
    setFaceBox(null);
    setCaptureUri(null);
    setShowResult(false);
    setCaptureResult(null);
    setResultBox(null);
  }, []);

  const setCapturePreview = useCallback((src: string | null) => {
    if (!src) return;
    capturePreviewRef.current = src;
    setCaptureUri(src);
  }, []);

  const finishWithResult = useCallback(
    async (shown: FaceBox | null, bitmapUri: string | null) => {
      if (!shown || !bitmapUri) {
        setShowResult(true);
        return;
      }
      setResultBox(shown);
      capturedFaceRef.current = shown;
      const result: CaptureResult = {
        uri: bitmapUri,
        faceBox: shown,
        cropB64: null,
      };
      try {
        result.cropB64 = await cropFace(bitmapUri, shown);
      } catch {
        result.cropB64 = null;
      }
      // Last-resort WebView-safe still (cropFace uses the proven value/base64 bridge).
      if (!capturePreviewRef.current && result.cropB64) {
        setCapturePreview(thumbSrc(result.cropB64) ?? null);
      }
      setCaptureResult(result);
      setShowResult(true);
      await stopCamera();
    },
    [setCapturePreview, stopCamera]
  );

  const onModeFinished = useCallback(
    async (mode: CaptureViewMode) => {
      if (mode === 'NO_FACE_PREPARE') {
        setMode('REPEAT_NO_FACE_PREPARE');
      } else if (mode === 'TO_FACE_CIRCLE') {
        setMode('FACE_CIRCLE');
      } else if (mode === 'FACE_CIRCLE_TO_NO_FACE') {
        setMode('NO_FACE_PREPARE');
      } else if (mode === 'FACE_CAPTURE_PREPARE') {
        setMode('FACE_CAPTURE_DONE');
      } else if (mode === 'FACE_CAPTURE_DONE') {
        let uri = lastUriRef.current;
        const fallback = capturedFaceRef.current;
        // Late / queued export: fetch preview once more before tearing down camera.
        if (!uri || !capturePreviewRef.current) {
          try {
            const exported = await exportLastLiveFrame({ preview: true });
            if (exported.uri) {
              uri = exported.uri;
              lastUriRef.current = exported.uri;
            }
            const src = livePreviewSrc(exported);
            if (src) setCapturePreview(src);
          } catch {
            /* keep whatever we have */
          }
        }
        if (!uri) {
          setShowResult(true);
          return;
        }
        const session = sessionRef.current;
        if (session) {
          const captured = await session.captureNow(fallback ? [fallback] : []);
          if (captured) {
            // Keep full-frame preview when we have it; else use crop (never file://).
            if (!capturePreviewRef.current && captured.cropB64) {
              setCapturePreview(thumbSrc(captured.cropB64) ?? null);
            }
            setResultBox(captured.faceBox);
            setCaptureResult(captured);
            setShowResult(true);
            await stopCamera();
            return;
          }
        }
        await finishWithResult(fallback, uri);
      }
    },
    [finishWithResult, setCapturePreview, setMode, stopCamera]
  );

  const startCamera = useCallback(async () => {
    if (sessionRef.current) return;
    const gen = ++bootGenRef.current;
    resetUi();
    try {
      await ensureCameraPermission();
      if (gen !== bootGenRef.current) return;
      const loaded = toCaptureSettings(await loadSettings());
      if (gen !== bootGenRef.current) return;
      setSettings(loaded);
      const session = new CaptureSession({
        settings: loaded,
        onState: (state: CaptureState, warn, boxes, frame) => {
          const mode = viewModeRef.current;
          if (mode === 'FACE_CAPTURE_DONE' || mode === 'NO_FACE_PREPARE') return;
          setFaceBox(boxes[0] ?? null);
          setFrameSize(frame);
          if (mode === 'REPEAT_NO_FACE_PREPARE') {
            if (state !== 'NO_FACE') setMode('TO_FACE_CIRCLE');
            return;
          }
          if (mode === 'FACE_CIRCLE') {
            if (state === 'NO_FACE') {
              setWarning('');
              setMode('FACE_CIRCLE_TO_NO_FACE');
              return;
            }
            if (state === 'CAPTURE_OK') {
              const box = boxes[0] ?? null;
              capturedFaceRef.current = box;
              setWarning('');
              setMode('FACE_CAPTURE_PREPARE');
              void exportLastLiveFrame({ preview: true })
                .then((exported) => {
                  if (!exported.uri) return;
                  // Don't use bootGen — stopCamera bumps it when DONE starts and
                  // would discard the preview, leaving a black circle (file://).
                  const mode = viewModeRef.current;
                  if (
                    mode !== 'FACE_CAPTURE_PREPARE' &&
                    mode !== 'FACE_CAPTURE_DONE'
                  ) {
                    return;
                  }
                  lastUriRef.current = exported.uri;
                  if (exported.width > 0 && exported.height > 0) {
                    setFrameSize({ w: exported.width, h: exported.height });
                  }
                  const src = livePreviewSrc(exported);
                  if (src) setCapturePreview(src);
                })
                .catch(() => undefined);
              return;
            }
            setWarning(warn);
          }
        },
        onCaptured: () => undefined,
      });
      if (gen !== bootGenRef.current) return;
      sessionRef.current = session;
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
        header: 'Capture',
        message: e instanceof Error ? e.message : String(e),
        buttons: ['OK'],
      });
    }
  }, [presentAlert, resetUi, setCapturePreview, setMode]);

  // First mount + every Ion re-entry (outlet keeps the page alive).
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

  const onEnroll = async () => {
    const result = captureResult;
    if (!result?.uri || !result.faceBox) {
      presentAlert({ header: 'Capture', message: 'Enrollment failed', buttons: ['OK'] });
      return;
    }
    try {
      const feature = await templateExtraction(result.uri, result.faceBox);
      await addPerson(autoPersonName(), feature, result.cropB64 ?? null);
      presentAlert({
        header: 'Person enrolled!',
        buttons: [{ text: 'OK', handler: () => goHome(history) }],
      });
    } catch (e) {
      presentAlert({
        header: 'Capture',
        message: e instanceof Error ? e.message : String(e),
        buttons: ['OK'],
      });
    }
  };

  const shown = resultBox;
  const livenessLine = (() => {
    if (!shown) return '';
    const label = (shown.livenessLabel ?? '').toLowerCase();
    const score = shown.liveness ?? 0;
    if (label.includes('spoof') || label.includes('fake')) {
      return `Liveness: Spoof, score = ${score}`;
    }
    if (score >= (settings?.liveness_threshold ?? 0.5)) {
      return `Liveness: Real, score = ${score}`;
    }
    return `Liveness: Spoof, score = ${score}`;
  })();

  return (
    <IonPage className="live-page">
      <div className="live-stage" ref={stageRef}>
        {viewMode !== 'FACE_CAPTURE_DONE' ? null : <div className="live-stage-fill" />}
        <CaptureOverlay
          width={size.w}
          height={size.h}
          frame={frameSize}
          mirror={settings?.camera_lens === 'front'}
          viewMode={viewMode}
          faceBox={faceBox}
          capturedUri={captureUri}
          onModeFinished={(mode) => void onModeFinished(mode)}
        />
        <div className="live-title">Face Capture</div>
        {warning ? <div className="live-warn">{warning}</div> : null}
        {showResult ? (
          <div className="capture-result-pane">
            <div className="capture-result-line">{livenessLine}</div>
            <div className="capture-result-line">
              {qualityText(shown?.face_quality ?? 0)}
              {shown?.qualityLabel ? `\n${shown.qualityLabel}` : ''}
            </div>
            <div className="capture-result-line">
              Luminance: {shown?.face_luminance ?? 0}
            </div>
            <button
              type="button"
              className="enroll-pill"
              style={{ backgroundImage: `url(${enrollGradient})` }}
              onClick={() => void onEnroll()}
            >
              Enroll
            </button>
          </div>
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

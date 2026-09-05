import { useEffect, useState } from 'react';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonPage,
  IonTitle,
  IonToolbar,
  useIonViewWillEnter,
} from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { resultDetailRows, type FaceBox } from 'face-recognition-cordova';
import { loadSettings } from '../FaceDatabase';
import { ensureCameraStopped } from '../cameraLifecycle';
import LandmarkImage from '../components/LandmarkImage';
import ResultDetailsList from '../components/ResultDetailsList';
import { displayUri, measureImage, thumbSrc } from '../pickImage';
import { getIdentifyResult, type IdentifyResult } from '../resultStore';
import { goHome } from '../nav';

function similarityLabel(score: number | undefined): string {
  if (score == null || !Number.isFinite(score)) return '—';
  if (score >= 0 && score <= 1) return `${Math.round(score * 100)}% (${score.toFixed(3)})`;
  return String(score);
}

export default function Result() {
  const history = useHistory();
  const stored = getIdentifyResult();
  const [data, setData] = useState<IdentifyResult | null>(stored);
  const [cropSize, setCropSize] = useState({ w: 200, h: 200 });
  const [rows, setRows] = useState<
    { kind: 'section' | 'field'; title: string; value: string }[]
  >([]);

  useIonViewWillEnter(() => {
    void ensureCameraStopped();
  });

  useEffect(() => {
    const next = getIdentifyResult() ?? data;
    if (!next) return;
    setData(next);
    (async () => {
      const settings = await loadSettings();
      if (next.box) {
        setRows(resultDetailRows(next.box, settings, { includeMatch: false }));
      }
      const uri = displayUri(next.identifiedUri) ?? next.identifiedUri;
      if (uri) {
        const measured = await measureImage(uri);
        if (measured.w > 0 && measured.h > 0) {
          setCropSize({ w: measured.w, h: measured.h });
        }
      }
    })();
  }, []);

  const identified = displayUri(data?.identifiedUri);
  const enrolled = thumbSrc(data?.enrolledThumbB64);
  const box: FaceBox | undefined = data?.box;

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonButton onClick={() => goHome(history)}>Home</IonButton>
          </IonButtons>
          <IonTitle>Identify Result</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        <div className="result-header">Identify Result</div>
        <div className="result-photos">
          <div className="result-photo-col">
            <LandmarkImage
              uri={identified}
              landmarks={data?.cropLandmarks ?? []}
              imageSize={cropSize}
              width={140}
              height={140}
            />
            <div className="result-caption">Identified</div>
          </div>
          <div className="result-photo-col">
            {enrolled ? (
              <img alt={data?.personName} src={enrolled} className="result-photo" />
            ) : (
              <div className="result-photo empty" />
            )}
            <div className="result-caption">Enrolled</div>
            <div className="muted">ID: {data?.personName ?? ''}</div>
          </div>
        </div>
        <div className="result-similarity">
          Similarity: {similarityLabel(data?.similarity)}
        </div>
        {!box ? (
          <p className="muted" style={{ padding: 16 }}>
            No identify result. Go back and try again.
          </p>
        ) : (
          <ResultDetailsList rows={rows} />
        )}
      </IonContent>
    </IonPage>
  );
}

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
import { goHome } from '../nav';
import {
  cropFace,
  mapLandmarksToCrop,
  resultDetailRows,
} from 'face-recognition-cordova';
import { loadSettings } from '../FaceDatabase';
import { ensureCameraStopped } from '../cameraLifecycle';
import LandmarkImage from '../components/LandmarkImage';
import ResultDetailsList from '../components/ResultDetailsList';
import {
  displayUri,
  engineImageSize,
  measureImage,
  thumbSrc,
} from '../pickImage';
import { getAttributeResult, type AttributeResult } from '../resultStore';

export default function Attribute() {
  const history = useHistory();
  const [data, setData] = useState<AttributeResult | null>(getAttributeResult());
  const [cropUri, setCropUri] = useState<string | null>(null);
  const [marks, setMarks] = useState<{ x: number; y: number }[]>(
    getAttributeResult()?.cropLandmarks ?? []
  );
  const [rows, setRows] = useState<
    { kind: 'section' | 'field'; title: string; value: string }[]
  >([]);

  const loadResult = async () => {
    const next = getAttributeResult();
    if (!next?.box) {
      setData(null);
      return;
    }
    setData(next);
    try {
      // Prefer the crop produced with the face box (same engine-prepared bitmap as detect).
      const b64 = next.cropB64 ?? (next.uri ? await cropFace(next.uri, next.box) : null);
      setCropUri(thumbSrc(b64) ?? null);

      if (next.cropLandmarks?.length) {
        setMarks(next.cropLandmarks);
      } else if (next.uri) {
        const size = await measureImage(next.uri);
        const prepared = engineImageSize(
          size.w > 0 ? size.w : Math.max(next.box.x2 + 1, 1),
          size.h > 0 ? size.h : Math.max(next.box.y2 + 1, 1)
        );
        setMarks(mapLandmarksToCrop(next.box, prepared.w, prepared.h, 200, 200));
      } else {
        setMarks([]);
      }
    } catch {
      setCropUri(thumbSrc(next.cropB64) ?? displayUri(next.uri) ?? null);
      setMarks(next.cropLandmarks ?? []);
    }
    const settings = await loadSettings();
    setRows(resultDetailRows(next.box, settings, { includeMatch: false }));
  };

  useIonViewWillEnter(() => {
    void ensureCameraStopped();
    void loadResult();
  });

  useEffect(() => {
    void loadResult();
  }, []);

  if (!data?.box) {
    return (
      <IonPage>
        <IonHeader>
          <IonToolbar>
            <IonButtons slot="start">
              <IonButton onClick={() => goHome(history)}>Back</IonButton>
            </IonButtons>
            <IonTitle>Attribute Result</IonTitle>
          </IonToolbar>
        </IonHeader>
        <IonContent className="ion-padding">
          <p className="muted">No result. Go back and pick a photo.</p>
        </IonContent>
      </IonPage>
    );
  }

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonButton onClick={() => goHome(history)}>Back</IonButton>
          </IonButtons>
          <IonTitle>Attribute Result</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        <div className="result-header">Attribute Result</div>
        <div className="attribute-card">
          <LandmarkImage
            uri={cropUri}
            landmarks={marks}
            imageSize={{ w: 200, h: 200 }}
            width={240}
            height={240}
          />
        </div>
        <ResultDetailsList rows={rows} />
      </IonContent>
    </IonPage>
  );
}

import { useCallback, useState } from 'react';
import {
  IonContent,
  IonFooter,
  IonPage,
  useIonAlert,
  useIonViewWillEnter,
} from '@ionic/react';
import { useHistory } from 'react-router-dom';
import {
  cropFace,
  faceDetection,
  mapLandmarksToCrop,
  templateExtraction,
} from 'face-recognition-cordova';
import { useSdk } from '../SdkContext';
import {
  addPerson,
  autoPersonName,
  deletePerson,
  loadPeople,
  loadSettings,
  type EnrolledPerson,
} from '../FaceDatabase';
import { ensureCameraStopped } from '../cameraLifecycle';
import { pickGalleryPhoto, thumbSrc, measureImage, engineImageSize } from '../pickImage';
import { setAttributeResult } from '../resultStore';
import FacePluginLogo from '../components/FacePluginLogo';
import enrollIcon from '../assets/tiles/enroll.png';
import identifyIcon from '../assets/tiles/identify.png';
import captureIcon from '../assets/tiles/capture.png';
import attributeIcon from '../assets/tiles/attributr.png';
import settingsIcon from '../assets/tiles/settings.png';
import aboutIcon from '../assets/tiles/information.png';

function Tile({
  title,
  icon,
  disabled,
  onPress,
}: {
  title: string;
  icon: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      className={`tile ${disabled ? 'disabled' : ''}`}
      disabled={disabled}
      onClick={onPress}
    >
      <img src={icon} alt="" className="tile-icon" />
      <span>{title}</span>
    </button>
  );
}

export default function Home() {
  const { status, ready } = useSdk();
  const history = useHistory();
  const [presentAlert] = useIonAlert();
  const [people, setPeople] = useState<EnrolledPerson[]>([]);

  const reload = useCallback(() => {
    void loadPeople().then(setPeople);
  }, []);

  useIonViewWillEnter(() => {
    void ensureCameraStopped();
    reload();
  });

  const guard = (go: () => void) => {
    if (!ready) {
      presentAlert({ header: 'SDK not ready', message: status, buttons: ['OK'] });
      return;
    }
    go();
  };

  const enrollGallery = async () => {
    try {
      const uri = await pickGalleryPhoto();
      const faces = await faceDetection(uri);
      if (faces.length !== 1) {
        presentAlert({
          header: 'Enroll',
          message:
            faces.length === 0 ? 'No face detected!' : 'Multiple face detected!',
          buttons: ['OK'],
        });
        return;
      }
      const template = await templateExtraction(uri, faces[0]);
      let crop: string | null = null;
      try {
        crop = await cropFace(uri, faces[0]);
      } catch {
        crop = null;
      }
      await addPerson(autoPersonName(), template, crop);
      reload();
      presentAlert({ header: 'Person enrolled!', buttons: ['OK'] });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.toLowerCase().includes('cancel')) {
        presentAlert({ header: 'Enroll failed', message: msg, buttons: ['OK'] });
      }
    }
  };

  const attributeGallery = async () => {
    try {
      const uri = await pickGalleryPhoto();
      const settings = await loadSettings();
      const faces = await faceDetection(uri, {
        allAttributes: true,
        check_liveness_level: settings.liveness_level,
      });
      if (faces.length !== 1) {
        presentAlert({
          header: 'Attribute',
          message:
            faces.length === 0 ? 'No face detected!' : 'Multiple face detected!',
          buttons: ['OK'],
        });
        return;
      }
      const size = await measureImage(uri);
      const prepared = engineImageSize(
        size.w > 0 ? size.w : Math.max(faces[0].x2 + 1, 1),
        size.h > 0 ? size.h : Math.max(faces[0].y2 + 1, 1)
      );
      let cropB64: string | null = null;
      try {
        cropB64 = await cropFace(uri, faces[0]);
      } catch {
        cropB64 = null;
      }
      setAttributeResult({
        uri,
        box: faces[0],
        cropB64,
        cropLandmarks: mapLandmarksToCrop(
          faces[0],
          prepared.w,
          prepared.h,
          200,
          200
        ),
      });
      history.push('/attribute');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.toLowerCase().includes('cancel')) {
        presentAlert({ header: 'Attribute failed', message: msg, buttons: ['OK'] });
      }
    }
  };

  return (
    <IonPage>
      <IonContent fullscreen>
        <FacePluginLogo />
        <h1 className="page-title">FaceRecognition</h1>
        <div className="tile-row">
          <Tile
            title="ENROLL"
            icon={enrollIcon}
            disabled={!ready}
            onPress={() => guard(() => void enrollGallery())}
          />
          <Tile
            title="IDENTIFY"
            icon={identifyIcon}
            disabled={!ready}
            onPress={() => guard(() => history.push('/identify'))}
          />
          <Tile
            title="CAPTURE"
            icon={captureIcon}
            disabled={!ready}
            onPress={() => guard(() => history.push('/capture'))}
          />
        </div>
        <div className="tile-row">
          <Tile
            title="ATTRIBUTE"
            icon={attributeIcon}
            disabled={!ready}
            onPress={() => guard(() => void attributeGallery())}
          />
          <Tile
            title="SETTINGS"
            icon={settingsIcon}
            onPress={() => history.push('/settings')}
          />
          <Tile
            title="ABOUT"
            icon={aboutIcon}
            onPress={() => history.push('/about')}
          />
        </div>
        {people.length > 0 ? <div className="enrolled-label">Enrolled Face</div> : null}
        <div className="person-list">
          {people.length === 0 && ready ? (
            <div className="muted empty-hint">No enrolled faces yet.</div>
          ) : (
            people.map((p) => (
              <div key={p.id} className="person-card">
                {p.thumbB64 ? (
                  <img alt={p.name} src={thumbSrc(p.thumbB64)} className="person-thumb" />
                ) : (
                  <div className="person-thumb empty" />
                )}
                <div className="person-name">{p.name}</div>
                <button
                  type="button"
                  className="person-delete"
                  onClick={() => void deletePerson(p.id).then(reload)}
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </div>
      </IonContent>
      <IonFooter className="ion-no-border status-footer">
        <div
          className={`status-bar ${
            ready
              ? 'status-ok'
              : status.toLowerCase().includes('loading')
                ? 'status-info'
                : 'status-error'
          }`}
        >
          {status}
        </div>
      </IonFooter>
    </IonPage>
  );
}

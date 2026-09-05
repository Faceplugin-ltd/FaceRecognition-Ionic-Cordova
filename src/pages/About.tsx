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
import { ensureCameraStopped } from '../cameraLifecycle';
import FacePluginLogo from '../components/FacePluginLogo';

export default function About() {
  const history = useHistory();
  useIonViewWillEnter(() => {
    void ensureCameraStopped();
  });
  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonButton onClick={() => goHome(history)}>Back</IonButton>
          </IonButtons>
          <IonTitle>About</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
        <FacePluginLogo />
        <h1 className="page-title">FacePlugin</h1>
        <div className="product-sub">Face Recognition SDK</div>
        <div className="about-card">
          FacePlugin builds on-device identity technology — face recognition,
          liveness, and document reading — so biometric data never has to leave
          the phone.
        </div>
        <div className="about-card">
          This app demos the Face Recognition SDK for Ionic Cordova: enroll,
          identify, capture, and attribute analysis. Everything runs fully
          on-premise.
        </div>
        <p className="about-link">
          <a href="https://faceplugin.com" target="_blank" rel="noreferrer">
            faceplugin.com
          </a>
        </p>
        <p className="muted" style={{ textAlign: 'center' }}>
          © 2026 FacePlugin. All rights reserved.
        </p>
      </IonContent>
    </IonPage>
  );
}

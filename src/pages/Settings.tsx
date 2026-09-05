import { useEffect, useState } from 'react';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonPage,
  IonTitle,
  IonToolbar,
  useIonAlert,
  useIonViewWillEnter,
} from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { goHome } from '../nav';
import {
  DEFAULT_SETTINGS,
  clearAllPeople,
  loadSettings,
  restoreDefaultSettings,
  saveSettings,
  type AppSettings,
} from '../FaceDatabase';
import { ensureCameraStopped } from '../cameraLifecycle';

function inRange(v: number, min: number, max: number) {
  return Number.isFinite(v) && v >= min && v <= max;
}

export default function Settings() {
  const history = useHistory();
  const [presentAlert] = useIonAlert();
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [draft, setDraft] = useState<Record<string, string>>({});

  useIonViewWillEnter(() => {
    void ensureCameraStopped();
  });

  useEffect(() => {
    void loadSettings().then((s) => {
      setSettings(s);
      setDraft({
        liveness_threshold: String(s.liveness_threshold),
        identify_threshold: String(s.identify_threshold),
        yaw_threshold: String(s.yaw_threshold),
        roll_threshold: String(s.roll_threshold),
        pitch_threshold: String(s.pitch_threshold),
        eyeclose_threshold: String(s.eyeclose_threshold),
      });
    });
  }, []);

  const commit = async (patch: Partial<AppSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    await saveSettings(next);
  };

  const commitNum = async (
    key: keyof AppSettings,
    raw: string,
    min: number,
    max: number
  ) => {
    setDraft((d) => ({ ...d, [key]: raw }));
    const v = parseFloat(raw);
    if (!inRange(v, min, max)) return;
    await commit({ [key]: v } as Partial<AppSettings>);
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonButton onClick={() => goHome(history)}>Back</IonButton>
          </IonButtons>
          <IonTitle>Settings</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        <div className="settings-section">Camera</div>
        <div className="settings-card">
          <div className="settings-label">Camera lens</div>
          <div className="radio-row">
            <button
              type="button"
              className="radio-item"
              onClick={() => void commit({ camera_lens: 'front' })}
            >
              <span className={`radio-dot ${settings.camera_lens === 'front' ? 'on' : ''}`} />
              Front
            </button>
            <button
              type="button"
              className="radio-item"
              onClick={() => void commit({ camera_lens: 'back' })}
            >
              <span className={`radio-dot ${settings.camera_lens === 'back' ? 'on' : ''}`} />
              Back
            </button>
          </div>
        </div>

        <div className="settings-section">Thresholds</div>
        <div className="settings-card">
          <IonList>
            <IonItem>
              <IonLabel>Liveness</IonLabel>
              <IonInput
                inputmode="decimal"
                value={draft.liveness_threshold ?? ''}
                onIonInput={(e) =>
                  void commitNum('liveness_threshold', String(e.detail.value ?? ''), 0, 1)
                }
              />
            </IonItem>
          </IonList>
          <div className="settings-label">Liveness Level</div>
          <div className="radio-row">
            <button
              type="button"
              className="radio-item"
              onClick={() => void commit({ liveness_level: 0 })}
            >
              <span className={`radio-dot ${settings.liveness_level === 0 ? 'on' : ''}`} />
              High Accuracy
            </button>
            <button
              type="button"
              className="radio-item"
              onClick={() => void commit({ liveness_level: 1 })}
            >
              <span className={`radio-dot ${settings.liveness_level === 1 ? 'on' : ''}`} />
              Light Weight
            </button>
          </div>
          {(
            [
              ['Identify', 'identify_threshold', 0, 1],
              ['Yaw', 'yaw_threshold', 0, 90],
              ['Roll', 'roll_threshold', 0, 90],
              ['Pitch', 'pitch_threshold', 0, 90],
              ['Eye closed', 'eyeclose_threshold', 0, 1],
            ] as const
          ).map(([label, key, min, max]) => (
            <IonItem key={key}>
              <IonLabel>{label}</IonLabel>
              <IonInput
                inputmode="decimal"
                value={draft[key] ?? ''}
                onIonInput={(e) =>
                  void commitNum(key, String(e.detail.value ?? ''), min, max)
                }
              />
            </IonItem>
          ))}
        </div>

        <div className="settings-section">Reset</div>
        <div className="settings-card">
          <button
            type="button"
            className="settings-action"
            onClick={() =>
              void restoreDefaultSettings().then((s) => {
                setSettings(s);
                setDraft({
                  liveness_threshold: String(s.liveness_threshold),
                  identify_threshold: String(s.identify_threshold),
                  yaw_threshold: String(s.yaw_threshold),
                  roll_threshold: String(s.roll_threshold),
                  pitch_threshold: String(s.pitch_threshold),
                  eyeclose_threshold: String(s.eyeclose_threshold),
                });
              })
            }
          >
            Restore default settings
          </button>
          <button
            type="button"
            className="settings-action"
            onClick={() =>
              presentAlert({
                header: 'Clear all person',
                buttons: [
                  { text: 'Cancel', role: 'cancel' },
                  {
                    text: 'Clear',
                    role: 'destructive',
                    handler: () => void clearAllPeople(),
                  },
                ],
              })
            }
          >
            Clear all person
          </button>
        </div>
      </IonContent>
    </IonPage>
  );
}

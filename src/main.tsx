import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { SdkProvider } from './SdkContext';

import '@ionic/react/css/core.css';
import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';
import '@ionic/react/css/typography.css';
import '@ionic/react/css/padding.css';
import '@ionic/react/css/float-elements.css';
import '@ionic/react/css/text-alignment.css';
import '@ionic/react/css/text-transformation.css';
import '@ionic/react/css/flex-utils.css';
import '@ionic/react/css/display.css';
import './theme.css';

/** Wait for Cordova plugins without hanging if `deviceready` already fired. */
function whenDeviceReady(): Promise<void> {
  return new Promise((resolve) => {
    const w = window as any;
    if (!w.cordova) {
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
    document.addEventListener('deviceready', () => resolve(), { once: true });
  });
}

async function bootstrap() {
  await whenDeviceReady();
  const container = document.getElementById('root');
  if (!container) return;
  createRoot(container).render(
    <React.StrictMode>
      <SdkProvider>
        <App />
      </SdkProvider>
    </React.StrictMode>
  );
}

bootstrap();

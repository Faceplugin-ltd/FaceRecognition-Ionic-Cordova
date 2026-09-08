import { Redirect, Route } from 'react-router-dom';
import { IonApp, IonRouterOutlet, setupIonicReact } from '@ionic/react';
/** Hash router: Cordova loads `…/index.html`, so BrowserRouter path `/index.html` matches nothing. */
import { IonReactHashRouter } from '@ionic/react-router';
import Home from './pages/Home';
import Identify from './pages/Identify';
import Capture from './pages/Capture';
import Result from './pages/Result';
import Attribute from './pages/Attribute';
import Settings from './pages/Settings';
import About from './pages/About';

setupIonicReact({ mode: 'ios' });

export default function App() {
  return (
    <IonApp>
      <IonReactHashRouter>
        <IonRouterOutlet>
          <Route exact path="/home" component={Home} />
          <Route exact path="/identify" component={Identify} />
          <Route exact path="/capture" component={Capture} />
          <Route exact path="/result" component={Result} />
          <Route exact path="/attribute" component={Attribute} />
          <Route exact path="/settings" component={Settings} />
          <Route exact path="/about" component={About} />
          <Route exact path="/">
            <Redirect to="/home" />
          </Route>
        </IonRouterOutlet>
      </IonReactHashRouter>
    </IonApp>
  );
}

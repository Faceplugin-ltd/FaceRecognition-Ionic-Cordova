import { Component } from '@angular/core';
import { Platform } from '@ionic/angular';

declare var cordova: any;

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
})
export class HomePage {
  user_list: any[] = [];

  constructor(private platform: Platform) {
    this.platform.ready().then(() => {
      console.log('MyApp: init home page');

      if(this.platform.is('android')) {
        if (window.hasOwnProperty('cordova')) {
          console.log('calling cordova api');
          cordova.exec(
            (success: any) => {
              console.log('Success:', success);
            },
            (error: any) => {
              console.error('Error:', error);
            },
            'FacePlugin',  // The Java/Kotlin class name
            'set_activation',    // The method name defined in Kotlin
            [{"license": "G4cKauk+yONyQz38KfLVwj3tiqjPqqVvvcuZ0lYpNZ0jC9NYCk0UDoou/P3CDI0siKHteEuBbexV" +
  "1lxx9n9cV2dPNonwpbNNy8CzyG9D5oMGzDWDn9G0/xtrgKzV5fqjVMPen0oPSz482s892m/lEP1j" +
  "69qASyR0eJPl5rCvI3xMYTyIt4bjTFv6yW0nKrj0bKsJRDUFHweT3r0hj3kLzPOYZR0pGX+e9sGp" +
  "kO7mdbxLiZ/xI71YEseoqWz4SjtRytHH8XOhgAffSrFzb2n9vGBoI7uHGPvoMihBZfuEFEU5L86T" +
  "szGa0ejUlHS1mKFMP10N4BaEUKLj4HQWce+dRw=="}]  // Arguments to pass to the native method
          );
        } else {
          console.warn('Cordova not available');
        }
      } else if(this.platform.is('ios')) {
        if (window.hasOwnProperty('cordova')) {
          console.log('calling cordova api');
          cordova.exec(
            (success: any) => {
              console.log('Success:', success);
            },
            (error: any) => {
              console.error('Error:', error);
            },
            'FacePlugin',  // The Java/Kotlin class name
            'set_activation',    // The method name defined in Kotlin
            [{"license": "NKBM7HUVvq8rSvdvAR722pdyDUKdHjLouQLPorIL6jbcJ/77KYbawNjqco3Q1Eb8GDxr6co0ufWO" +
            "sWOZUtzbk73iGGCqZPpnmHmSehXM4Dled7ToW0MSRnV6Y28ctGA4VDwKgcwNGzSb987pWaRV9xKV" +
            "h94fLtG8lXpMAeS0LDUSFd+5H7fEAhn6auN9TibPyRu42N4ejgm/Mc3b02cS/acHz443o84deoaU" +
            "LNsmDPhLUMFXyy4ERg2syR/VDQ3Rne0MdtcmpInEIW5CaUSCOgptdI2fnMT5KoDsNPMdhWE0uluo" +
            "/g9VzTc94BmSVm+5vfX817moexqtzN7ubIND0A=="}]  // Arguments to pass to the native method
          );
        } else {
          console.warn('Cordova not available');
        }  
      }
    });
  }

  updateData(user_list: any) {
    console.log('Update Data');
    if (window.hasOwnProperty('cordova')) {
      console.log('calling cordova api');
      cordova.exec(
        (success: any) => {
          console.log('Success:', success);
        },
        (error: any) => {
          console.error('Error:', error);
        },
        'FacePlugin',  // The Java/Kotlin class name
        'update_data',    // The method name defined in Kotlin
        [{"user_list": user_list}]  // Arguments to pass to the native method
      );
    } else {
      console.warn('Cordova not available');
    }
  }

  enrollPerson() {
    console.log('Enroll button clicked');
    if (window.hasOwnProperty('cordova')) {
      console.log('calling cordova api');
      cordova.exec(
        (success: any) => {
          console.log('Success:', success);

          if(success['exists'] == "") {
            success['face_id'] = this.user_list.length + 1;
            this.user_list.push(success);
    
            // FacePlugin.update_data(user_list);
            this.updateData(this.user_list);
            
            console.log("new user registered");
        } else {
            console.log("user already exists");
        }
        },
        (error: any) => {
          console.error('Error:', error);
        },
        'FacePlugin',  // The Java/Kotlin class name
        'face_register',    // The method name defined in Kotlin
        [{"cam_id": 0}]  // Arguments to pass to the native method
      );
    } else {
      console.warn('Cordova not available');
    }
  }

  identifyPerson() {
    console.log('Identify button clicked');
    if (window.hasOwnProperty('cordova')) {
      console.log('calling cordova api');
      cordova.exec(
        (success: any) => {
          console.log('Success:', success);
          console.log("Identify Result: " + success['face_id'] + ", " + success['liveness'] + ", " + success['face_boundary']['left'] + ", " + 
            success['face_boundary']['top'] + ", " + success['face_boundary']['right'] + ", " + success['face_boundary']['bottom']);

        },
        (error: any) => {
          console.error('Error:', error);
        },
        'FacePlugin',  // The Java/Kotlin class name
        'face_recognize',    // The method name defined in Kotlin
        [{"cam_id": 0}]  // Arguments to pass to the native method
      );
    } else {
      console.warn('Cordova not available');
    }
  }
}

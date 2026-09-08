import type { History } from 'history';

/** IonReactRouter often has an empty history stack, so goBack() is a no-op. */
export function goHome(history: History): void {
  history.replace('/home');
}

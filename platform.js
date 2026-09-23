import { nativeLinkRoute, shareWasCancelled } from './platform-utils.js?v=500413';

export function isNativeApp() {
  return globalThis.Capacitor?.isNativePlatform?.() === true;
}

let bridgePromise;
const nativeBridge = () => bridgePromise ||= import('./native/bridge.js');

// Web users never download native packages or receive a native permission prompt.
export async function shareNativeContent(payload) {
  if (!isNativeApp()) return false;
  try { await (await nativeBridge()).shareContent(payload); }
  catch (error) { if (!shareWasCancelled(error)) throw error; }
  return true;
}

export async function exportNativeJSON(json, filename) {
  if (!isNativeApp()) return false;
  try { await (await nativeBridge()).shareJSON(json, filename); }
  catch (error) { if (!shareWasCancelled(error)) throw error; }
  return true;
}

export async function initializeNativeApp({ onResume, onRoute, onFailure = () => {} }) {
  if (!isNativeApp()) return;
  document.documentElement.classList.add('native-app');
  try {
    const bridge = await nativeBridge();
    await bridge.connect({
      onResume,
      onURL: value => { const route = nativeLinkRoute(value); if (route) onRoute(route); }
    });
    let lastFeedback = 0;
    document.querySelector('.bottomnav')?.addEventListener('click', event => {
      const button = event.target.closest?.('.navbtn:not([disabled])');
      if (!button || matchMedia('(prefers-reduced-motion: reduce)').matches || Date.now() - lastFeedback < 350) return;
      lastFeedback = Date.now();
      bridge.selectionFeedback().catch(() => {});
    });
  } catch (error) {
    console.warn('Native integration unavailable');
    onFailure(error);
  }
}

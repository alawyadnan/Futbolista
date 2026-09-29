import { App } from '@capacitor/app';
import { Share } from '@capacitor/share';
import { Haptics } from '@capacitor/haptics';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { StatusBar, Style } from '@capacitor/status-bar';
import { registerPlugin } from '@capacitor/core';
import { installPushControls } from './push-controls.js';
const Push = registerPlugin('FutbolistaPush');

export const shareContent = payload => Share.share(payload);
export const selectionFeedback = () => Haptics.selectionChanged();

export async function connect({ onResume, onURL }) {
  await App.addListener('resume', onResume);
  await App.addListener('appUrlOpen', event => onURL(event.url));
  const launch = await App.getLaunchUrl();
  if (launch?.url) onURL(launch.url);
  // Styling failure must not disable navigation, login or sharing.
  await StatusBar.setStyle({style:Style.Dark}).catch(() => {});
  await installPushControls(Push, {onURL, onResume, app:App}).catch(() => {});
}

export async function shareJSON(json, filename) {
  if (!/^ftbll_backup_\d{4}-\d{2}-\d{2}\.json$/.test(filename)) throw new Error('Invalid backup filename');
  // Only a user-triggered export reaches this function. The backup stays in the
  // app's private cache and is removed after the share sheet has finished.
  const result = await Filesystem.writeFile({path:filename,data:json,directory:Directory.Cache,encoding:Encoding.UTF8});
  try { await Share.share({title:'Futbolista',files:[result.uri]}); }
  finally { await Filesystem.deleteFile({path:filename,directory:Directory.Cache}).catch(() => {}); }
}

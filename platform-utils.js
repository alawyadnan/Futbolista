import { appRouteFor, compareRouteFor, parseAppRoute, publicAppUrl } from './ux-utils.js?v=500410';

export const PUBLIC_APP_ORIGIN = 'https://ftbll.live/';

export function sharedAppUrl(currentUrl, hash, native = false) {
  return publicAppUrl(native ? PUBLIC_APP_ORIGIN : currentUrl, hash);
}

// An incoming URL may select a public screen only; never run an action or load
// an arbitrary URL into the privileged native WebView. Queries are not copied.
export function nativeLinkRoute(value) {
  try {
    const url = new URL(String(value));
    const accepted = (url.protocol === 'https:' && url.host === 'ftbll.live')
      || (url.protocol === 'futbolista:' && url.host === 'app');
    if (!accepted || url.username || url.password || !['','/'].includes(url.pathname)) return null;
    const hash = url.hash || '#dashboard';
    if (/[\u0000-\u001f\u007f]/.test(decodeURIComponent(hash))) return null;
    if (!/^#(?:dashboard|leaderboard|table|players|playerstats|account|history(?:\/player\/[^/]+)?|player\/[^/]+(?:\/compare(?:\/[^/]+(?:\/recent)?)?)?)$/.test(hash)) return null;
    const route = parseAppRoute(hash);
    const ids = [route.playerId, route.historyPlayerId, route.comparisonPlayerId].filter(Boolean);
    if (ids.some(id => id.length > 1500 || /[\u0000-\u001f\u007f/]/.test(id))) return null;
    return route.comparison ? compareRouteFor(route.playerId,route.comparisonPlayerId,route.comparisonScope)
      : appRouteFor(route.screen,route.historyPlayerId || route.playerId);
  } catch { return null; }
}

export function shareWasCancelled(error) {
  return error?.name === 'AbortError'
    || /^(share canceled|share cancelled|user canceled sharing|user cancelled sharing)$/i.test(String(error?.message || ''));
}

export function backupFileName(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) throw new Error('Invalid backup date');
  return `ftbll_backup_${date}.json`;
}

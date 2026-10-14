import { translate } from './i18n.js?v=500427';
import { buildPlayerAvatar, buildRankingMetric } from './ux-utils.js?v=500427';

const esc = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const metricFields = {form:'formPoints', winPct:'winPct', goals:'goals', gpm:'gpm', wins:'wins', matches:'matches', curStreak:'curStreak', bestStreak:'bestStreak', votingPoints:'votingPoints', motmAwards:'motmAwards', monthAwards:'monthAwards'};

// Keep the authoritative ranking and its competition ranks. Never manufacture
// a winner from a zero total or drop earned award ties at the podium boundary.
export function renderRankingPodium(rows, sortBy, language = 'en') {
  const field = metricFields[sortBy];
  if (!field || !rows.length || !(rows[0][field] > 0)) return '';
  const award = ['votingPoints','motmAwards','monthAwards'].includes(sortBy);
  const leaders = award ? rows.filter(row => row.displayRank !== null && row.displayRank <= 3 && row[field] > 0) : rows.slice(0, 3);
  if (!leaders.length) return '';
  return `<div class="ranking-podium" role="group" aria-label="${esc(translate(language,'rankingHighlights'))}">${leaders.map(row => {
    const avatar = buildPlayerAvatar(row.name), metric = buildRankingMetric(row,sortBy);
    return `<button type="button" class="podium-player ${row.displayRank === 1 ? 'podium-featured' : ''}" data-open-player="${esc(row.id)}">
      <span class="podium-rank">${esc(row.displayRank)}</span><span class="podium-avatar" data-avatar-tone="${avatar.tone}" aria-hidden="true">${esc(avatar.initials)}</span>
      <bdi class="podium-name" dir="auto">${esc(row.name)}</bdi><strong class="podium-value" dir="ltr">${esc(metric.value)}</strong><span class="podium-metric">${esc(translate(language,metric.labelKey))}</span>
      <span class="sr-only">${esc(translate(language,'openProfileAction'))}</span></button>`;
  }).join('')}</div>`;
}

export function renderAwardComparison(snapshot, aId, bId, language = 'en') {
  const t = key => translate(language,key);
  const a = snapshot?.byPlayer?.get(String(aId)), b = snapshot?.byPlayer?.get(String(bId));
  if (!a || !b) return '';
  const metric = (key, complete = true) => {
    const left = complete ? a[key] : null, right = complete ? b[key] : null;
    const max = Math.max(1, left || 0, right || 0);
    return `<div class="award-compare-row"><strong class="award-compare-a ${left > right ? 'is-leading' : ''}">${left ?? '—'}</strong><span>${esc(t(key))}</span><strong class="award-compare-b ${right > left ? 'is-leading' : ''}">${right ?? '—'}</strong><div class="award-compare-bars" aria-hidden="true"><i style="--fill:${(left || 0)/max*100}%"></i><i style="--fill:${(right || 0)/max*100}%"></i></div></div>`;
  };
  return `<article class="card comparison-awards"><div class="card-heading"><h2>${esc(t('profileAwards'))}</h2><span class="status-pill">${esc(t('allTime'))}</span></div>
    <div class="award-comparison-labels"><bdi dir="auto">${esc(a.name || t('player'))}</bdi><bdi dir="auto">${esc(b.name || t('player'))}</bdi></div>
    ${!snapshot.complete ? `<p class="note" role="status">${esc(t(snapshot.error ? 'awardLoadError' : 'loadingMvp'))}</p>` : ''}
    ${metric('votingPoints',snapshot.complete)}${metric('motmAwards',snapshot.complete)}${metric('monthAwards')}
  </article>`;
}

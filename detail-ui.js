import { translate, countText } from './i18n.js?v=500420';
import { buildPlayerAvatar, matchRouteFor } from './ux-utils.js?v=500420';
import { computeMonthlyPerformance, computeParticipationWindow, computeDuelScoring } from './insights-engine.js?v=500420';

const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const percentage = (value, total) => total > 0 ? Math.min(100, Math.max(0, value / total * 100)) : 0;

export const TABLE_VIEWS = Object.freeze({
  results: ['matches', 'wins', 'winPct'],
  attack: ['matches', 'goals', 'gpm'],
  awards: ['votingPoints', 'motmAwards', 'monthAwards']
});

export function resolveTableView(view, sort, communityEnabled = true) {
  const selected = view === 'all' || Object.prototype.hasOwnProperty.call(TABLE_VIEWS, view) ? view : 'results';
  if (selected === 'all') return 'all';
  if (selected === 'awards' && !communityEnabled) return 'results';
  if (sort === 'name' || TABLE_VIEWS[selected].includes(sort)) return selected;
  return Object.entries(TABLE_VIEWS).find(([key, columns]) => (communityEnabled || key !== 'awards') && columns.includes(sort))?.[0] || 'all';
}

export function applyTableColumns(table, sort, communityEnabled, language = 'en') {
  if (!table) return;
  const wrap = table.closest('.tablewrap');
  const view = resolveTableView(wrap?.dataset.columnView, sort, communityEnabled);
  if (wrap) wrap.dataset.columnView = view;
  table.classList.toggle('compact-columns', view !== 'all');
  table.querySelectorAll('[data-sort-key]').forEach(cell => {
    cell.hidden = cell.dataset.sortKey !== 'name' && (
      (!communityEnabled && TABLE_VIEWS.awards.includes(cell.dataset.sortKey)) ||
      (view !== 'all' && !TABLE_VIEWS[view].includes(cell.dataset.sortKey)));
  });
  table.querySelectorAll('thead [data-i18n]').forEach(header => {
    if (!header.dataset.i18n) return;
    const key = view !== 'all' && header.dataset.sortKey === 'wins' ? 'tableWinsShort' : header.dataset.i18n;
    header.textContent = translate(language, key);
  });
  table.querySelectorAll('td[colspan]').forEach(cell => { cell.colSpan = view === 'all' ? (communityEnabled ? 12 : 9) : 5; });
  const hint = table.closest('.table-card')?.querySelector?.('[data-i18n="swipeTable"]');
  if (hint) hint.hidden = view !== 'all';
  table.closest('.screen')?.querySelectorAll('[data-table-view]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.tableView === view));
    button.hidden = button.dataset.tableView === 'awards' && !communityEnabled;
  });
}

export function renderMonthlyPerformance(model, playerId, language, monthLabel) {
  const rows = computeMonthlyPerformance(model, playerId);
  if (!rows.length) return '';
  const t = key => translate(language, key), max = Math.max(1, ...rows.map(row => row.goals));
  const render = row => `<button type="button" class="month-performance-row" data-player-month="${row.month}" aria-label="${esc([monthLabel(row.month),countText(language,row.matches,'match'),countText(language,row.goals,'goal'),countText(language,row.wins,'win'),countText(language,row.draws,'draw'),countText(language,row.losses,'loss'),t('allPlayerMatches')].join(' · '))}">
    <span class="month-performance-label"><time datetime="${row.month}">${esc(monthLabel(row.month))}</time><small>${esc(countText(language, row.matches, 'match'))}</small></span>
    <span class="month-performance-results"><span class="win">${row.wins}<small>${esc(t('shortWin'))}</small></span><span class="draw">${row.draws}<small>${esc(t('shortDraw'))}</small></span><span class="loss">${row.losses}<small>${esc(t('shortLoss'))}</small></span></span>
    <span class="month-performance-goals"><b>${row.goals}</b><small>${esc(t('goals'))}</small></span>
    <span class="month-performance-track" aria-hidden="true"><i style="width:${percentage(row.goals, max)}%"></i></span></button>`;
  return `<article class="card month-performance"><div class="card-heading"><h2>${esc(t('monthByMonth'))}</h2><svg class="section-mark" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v5M17 3v5M3 11h18M7 15h3M14 15h3"/></svg></div>${rows.slice(0, 4).map(render).join('')}
    ${rows.length > 4 ? `<details class="month-archive"><summary>${esc(t('earlierMonths'))} <span>${rows.length - 4}</span></summary>${rows.slice(4).map(render).join('')}</details>` : ''}</article>`;
}

export function renderScoringLeaders(rows, language) {
  const maximum = Math.max(1, ...rows.map(row => row.s.goals));
  return rows.map((row, index) => {
    const avatar = buildPlayerAvatar(row.p.name), rank = row.s.goals > 0 ? rows.findIndex(item => item.s.goals === row.s.goals) + 1 : '—';
    return `<button type="button" class="scoring-leader ${index === 0 && row.s.goals > 0 ? 'featured' : ''}" data-open-player="${esc(row.p.id)}">
      <span class="scoring-leader-rank" aria-hidden="true">${rank}</span><span class="contribution-avatar" data-avatar-tone="${avatar.tone}" aria-hidden="true">${esc(avatar.initials)}</span>
      <span class="scoring-leader-name"><bdi>${esc(row.p.name)}</bdi><small>${row.s.gpm.toFixed(2)} <span>${esc(translate(language, 'gpm'))}</span></small></span>
      <span class="scoring-leader-total"><strong>${row.s.goals}</strong><small>${esc(translate(language, 'goals'))}</small></span>
      <span class="scoring-leader-track" aria-hidden="true"><i style="width:${percentage(row.s.goals, maximum)}%"></i></span></button>`;
  }).join('');
}

export function toggleComparisonPick(ids, id, players) {
  const valid = new Set(players.map(player => String(player.id)));
  const selected = [...new Set(ids.map(String))].filter(key => valid.has(key)).slice(0, 2);
  const key = String(id);
  if (!valid.has(key)) return selected;
  if (selected.includes(key)) return selected.filter(value => value !== key);
  return selected.length < 2 ? [...selected, key] : selected;
}

export function renderComparisonPicker(ids, players, language) {
  const selected = ids.map(id => players.find(player => String(player.id) === id)).filter(Boolean);
  const slots = [0,1].map(index => {
    const player = selected[index];
    return player ? `<button type="button" class="compare-pick-slot filled" data-remove-compare="${esc(player.id)}" aria-label="${esc(translate(language,'removeComparePlayer',{name:player.name}))}"><span class="pick-number" aria-hidden="true">${index + 1}</span><bdi>${esc(player.name)}</bdi><span aria-hidden="true">×</span></button>`
      : `<div class="compare-pick-slot empty"><span class="pick-number" aria-hidden="true">${index + 1}</span><span>${esc(translate(language,index ? 'pickSecondPlayer' : 'pickFirstPlayer'))}</span></div>`;
  }).join('');
  return `${slots}<button type="button" class="btn btn-primary compare-picked-action" data-compare-picked ${selected.length !== 2 ? 'disabled' : ''}>${esc(translate(language,'compareNow'))}</button><span class="sr-only" role="status">${esc(translate(language,'comparePickedCount',{count:selected.length}))}</span>`;
}

export function renderParticipationWindow(model, playerId, language, dateLabel) {
  const window = computeParticipationWindow(model, playerId);
  if (!window.total) return '';
  const t = (key, values) => translate(language, key, values);
  return `<article class="card participation-card"><div class="card-heading"><div><h2>${esc(t('groupParticipation'))}</h2><p class="participation-caption">${esc(t('groupMatchWindow',{count:window.total}))}</p></div><strong class="participation-total"><b>${window.played}</b><span>/ ${window.total}</span><small>${esc(t('participated'))}</small></strong></div>
    <div class="participation-grid">${window.matches.map((match,index) => `<button type="button" class="participation-cell ${match.result || 'not-played'}" data-open-match="${esc(match.matchKey)}" aria-label="${esc([dateLabel(match.date),t(match.result || 'didNotPlay'),match.played ? countText(language,match.goals,'goal') : '',t('details')].filter(Boolean).join(' · '))}">
      <time datetime="${esc(match.date)}"><bdi>${esc(match.date.slice(8)+'/'+match.date.slice(5,7))}</bdi></time><span class="participation-mark" aria-hidden="true">${match.played ? esc(t({win:'shortWin',draw:'shortDraw',loss:'shortLoss'}[match.result])) : '—'}</span>${index === window.total - 1 ? `<small>${esc(t('newest'))}</small>` : '<small aria-hidden="true">·</small>'}</button>`).join('')}</div>
    <div class="participation-legend">${['win','draw','loss','didNotPlay'].map(key => `<span class="${key}"><i aria-hidden="true"></i>${esc(t(key))}</span>`).join('')}</div></article>`;
}

export function renderDuelRecord(model, a, b, record, language) {
  const t = key => translate(language, key), goals = computeDuelScoring(model,a.id,b.id);
  if (!record.againstMatches) return `<p class="duel-empty">${esc(t('noAgainstMatches'))}</p>`;
  const left = record.aWinsAgainst, right = record.bWinsAgainst, draws = record.drawsAgainst;
  return `<div class="duel-scoreboard"><div class="duel-side"><strong>${left}</strong><bdi>${esc(a.name)}</bdi><small>${esc(t('wins'))}</small></div><div class="duel-draws"><strong>${draws}</strong><span>${esc(t('draws'))}</span></div><div class="duel-side"><strong>${right}</strong><bdi>${esc(b.name)}</bdi><small>${esc(t('wins'))}</small></div></div>
    <div class="duel-track" aria-hidden="true"><i style="flex-grow:${left}"></i><i style="flex-grow:${draws}"></i><i style="flex-grow:${right}"></i></div>
    <div class="duel-goals"><b>${goals.aGoals}</b><span>${esc(t('duelPersonalGoals'))}</span><b>${goals.bGoals}</b></div>
    <p class="duel-total">${esc(countText(language,record.againstMatches,'match'))} · ${esc(t('allTime'))}</p>`;
}

export function matchSharePayload(match, language, dateLabel) {
  if (!match || matchRouteFor(match.matchKey) === '#history') return null;
  const date = dateLabel(match.date);
  return { title:`${date} · Futbolista`,
    text:`${date}\n${translate(language,'teamA')} ${match.scoreA} – ${match.scoreB} ${translate(language,'teamB')}`,
    hash:matchRouteFor(match.matchKey) };
}

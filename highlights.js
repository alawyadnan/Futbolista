import { collection, doc, onSnapshot, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { computeTrends, selectHeadlineTrends, selectProfileTrends, summarizeAwards } from './highlights-engine.js?v=500404';
import { buildPlayerAvatar } from './ux-utils.js?v=500404';
import { buildAwardStatistics, rankAwardRows } from './award-statistics.js?v=500404';

export function createHighlights({ db, getModel, getProfileId, isAdmin, t, esc, notify }) {
  const $ = id => document.getElementById(id);
  let state = { sessions: [], results: new Map(), ready: false, error: false };
  let hidden = new Set(), settingsReady = false, settingsError = false, saving = false;
  let cachedModel, cachedState, cachedMonth, cachedLanguage, awards = summarizeAwards(), trends = [], statistics = new Map();
  let rankingKey = 'votingPoints';
  const name = id => getModel().playerById?.get(id)?.name || t('unknown');
  const date = value => {
    const parsed = new Date(`${value}T12:00:00`);
    return Number.isNaN(parsed.getTime()) ? '—' : new Intl.DateTimeFormat(document.documentElement.lang === 'ar' ? 'ar-SA-u-ca-gregory' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(parsed);
  };
  const text = trend => t(`trend_${trend.type}`, { count: trend.count });
  const avatar = id => { const value = buildPlayerAvatar(name(id)); return `<span class="spotlight-avatar" data-avatar-tone="${value.tone}" aria-hidden="true">${esc(value.initials)}</span>`; };
  const playerLink = id => `<button type="button" class="spotlight-player" data-open-player="${esc(id)}">${avatar(id)}<strong><bdi>${esc(name(id))}</bdi></strong></button>`;
  const edit = trend => isAdmin() ? `<button type="button" class="btn btn-quiet trend-edit" data-hide-trend="${esc(trend.id)}" ${saving || !settingsReady ? 'disabled' : ''} aria-label="${esc(t('hideTrendAria',{name:name(trend.playerId),trend:text(trend)}))}">${esc(t('hideTrend'))}</button>` : '';
  function trendCard(trend, headline = false) {
    return `<article class="trend-card ${trend.tone}">${headline ? playerLink(trend.playerId) : ''}<div class="trend-fact"><span class="trend-number" aria-hidden="true">${trend.count}</span><div><strong>${esc(text(trend))}</strong><span>${esc(date(trend.startDate))} — ${esc(date(trend.endDate))}</span></div></div><div class="trend-card-actions"><button type="button" class="text-action" data-open-match="${esc(trend.endMatchKey)}">${esc(t('lastInStreak'))}</button>${edit(trend)}</div></article>`;
  }
  function sync() {
    const model = getModel();
    const today = new Date(), month = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`;
    const language = document.documentElement.lang;
    if (model !== cachedModel || state !== cachedState || month !== cachedMonth || language !== cachedLanguage) {
      cachedModel = model; cachedState = state; cachedMonth = month; cachedLanguage = language;
      awards = summarizeAwards(state.sessions,state.results);
      trends = computeTrends(model,awards);
      statistics = buildAwardStatistics(model,awards,month,name);
    }
  }
  const resultsComplete = () => state.ready && !state.error && awards.complete;
  const pendingResults = () => `<p class="note" role="status">${esc(t(state.error ? 'awardLoadError' : 'loadingMvp'))}</p>${state.error ? `<button type="button" class="btn btn-quiet" data-community-action="retry-results">${esc(t('retryData'))}</button>` : ''}`;
  function renderRankings() {
    const box = $('dashboardAwardRanking');
    if (!box) return;
    box.classList.remove('hidden');
    const rows = rankAwardRows([...statistics.values()].filter(row => row[rankingKey] > 0), rankingKey).filter(row => row.rank <= 3);
    box.innerHTML = `<div class="card-heading"><div><span class="eyebrow">${esc(t('allTime'))}</span><h2>${esc(t('voteLeaders'))}</h2></div><button type="button" class="text-action" data-award-table="${rankingKey}">${esc(t('fullRanking'))}</button></div>
      <div class="award-switch" role="group" aria-label="${esc(t('sortBy'))}">${['votingPoints','motmAwards'].map(key => `<button type="button" data-award-ranking="${key}" aria-pressed="${rankingKey === key}">${esc(t(key))}</button>`).join('')}</div>
      ${!resultsComplete() ? pendingResults() : !rows.length ? `<p class="note">${esc(t('noVotePoints'))}</p>` : `<div class="award-leaders">${rows.map(row => `<div class="award-leader"><span class="rank-badge ${row.rank === 1 ? 'top' : ''}">${row.rank}</span>${playerLink(row.id)}<div class="award-leader-score"><strong>${row[rankingKey]}</strong><span>${esc(t(rankingKey === 'votingPoints' ? 'votePoints' : 'motmShort'))}</span></div></div>`).join('')}</div>`}
      <p class="award-rule">${esc(t('votePointsRule'))}</p>`;
  }
  function renderLatest() {
    const box = $('dashboardMotm');
    if (!box) return;
    const latest = awards.latest;
    box.classList.toggle('hidden', !latest && !state.error);
    if (!latest) { box.innerHTML = state.error ? `<p class="note">${esc(t('awardLoadError'))}</p><button class="btn btn-quiet" data-community-action="retry-results">${esc(t('retryData'))}</button>` : ''; return; }
    const award = awards.byMatch.get(latest.matchKey);
    box.innerHTML = `<div class="card-heading"><div><span class="eyebrow">${esc(t('latestMotm'))}</span><h2 dir="ltr">MOTM</h2></div><time class="status-pill" datetime="${esc(latest.date)}">${esc(date(latest.date))}</time></div>
      ${!award ? `<p class="note" ${state.error ? '' : 'role="status"'}>${esc(t(state.error ? 'awardLoadError' : 'loadingMvp'))}</p>${state.error ? `<button class="btn btn-quiet" data-community-action="retry-results">${esc(t('retryData'))}</button>` : ''}` : !award.winnerIds.length ? `<p class="note">${esc(t('noBallots'))}</p>` : `<div class="motm-winners">${award.winnerIds.map(playerLink).join('')}</div><div class="motm-award-meta"><span>${esc(t(award.winnerIds.length > 1 ? 'jointMotm' : 'motmFull'))}</span><strong>${award.result.ranking[0].points} ${esc(t('votePoints'))}</strong></div>`}
      <button class="text-action" type="button" data-open-match="${esc(latest.matchKey)}">${esc(t('viewVoteResult'))}</button>`;
  }
  function renderProfile() {
    const box = $('profileHighlights'), count = $('profileMotmStat');
    const playerId = getProfileId();
    if (!box) return;
    if (!playerId || !getModel().playerById?.has(playerId)) { box.replaceChildren(); return; }
    const wins = awards.byPlayer.get(playerId) || [];
    const complete = resultsComplete();
    const stats = statistics.get(playerId);
    if (count) count.innerHTML = `<div class="stLabel">${esc(t('motmAwards'))}</div><div class="stValue">${complete ? wins.length : '—'}</div>`;
    if ($('profileVotePointsStat')) $('profileVotePointsStat').innerHTML = `<div class="stLabel">${esc(t('votingPoints'))}</div><div class="stValue">${complete ? stats.votingPoints : '—'}</div>`;
    if ($('profileMonthAwardsStat')) $('profileMonthAwardsStat').innerHTML = `<div class="stLabel">${esc(t('monthAwards'))}</div><div class="stValue">${stats.monthAwards}</div>`;
    const rows = settingsReady ? selectProfileTrends(trends,playerId,hidden) : [];
    box.innerHTML = `<article class="card motm-record"><div class="card-heading"><h2>${esc(t('motmAwards'))}</h2><span class="motm-total">${complete ? wins.length : '—'}<small>MOTM</small></span></div>
      ${!complete ? `<p class="note">${esc(t(state.error ? 'awardLoadError' : 'loadingMvp'))}</p>${state.error ? `<button class="btn btn-quiet" data-community-action="retry-results">${esc(t('retryData'))}</button>` : ''}` : !wins.length ? `<p class="note">${esc(t('noMotmAwards'))}</p>` : ''}
      ${wins.length ? `<div class="award-history">${wins.slice(-5).reverse().map(award => `<button class="award-date" type="button" data-open-match="${esc(award.session.matchKey)}"><span aria-hidden="true">★</span><time datetime="${esc(award.session.date)}">${esc(date(award.session.date))}</time>${award.winnerIds.length > 1 ? `<small>${esc(t('jointAward'))}</small>` : ''}</button>`).join('')}</div>` : ''}${wins.length > 5 ? `<p class="note">${esc(t('latestFiveAwards'))}</p>` : ''}</article>
      <div class="career-awards-grid"><article class="card voting-record"><div class="card-heading"><h2>${esc(t('votingPoints'))}</h2><span class="motm-total">${complete ? stats.votingPoints : '—'}<small>${esc(t('votePoints'))}</small></span></div>
        ${!complete ? pendingResults() : `<dl class="vote-choice-breakdown">${[['firstChoices','firstPlace',5],['secondChoices','secondPlace',3],['thirdChoices','thirdPlace',1]].map(([key,label,weight]) => `<div><dt>${esc(t(label))}</dt><dd>${stats[key]} <span>× ${weight}</span></dd></div>`).join('')}</dl>`}<p class="award-rule">${esc(t('votePointsRule'))}</p></article>
        <article class="card monthly-record"><div class="card-heading"><h2>${esc(t('playerMonth'))}</h2><span class="motm-total">${stats.monthAwards}<small>${esc(t('monthAwards'))}</small></span></div>
        ${stats.months.length ? `<div class="monthly-award-history">${stats.months.slice().reverse().map(row => `<span class="month-award"><span aria-hidden="true">★</span><time datetime="${esc(row.month)}">${esc(new Intl.DateTimeFormat(document.documentElement.lang === 'ar' ? 'ar-SA-u-ca-gregory' : 'en-GB',{month:'long',year:'numeric'}).format(new Date(`${row.month}-01T12:00:00`)))}</time><strong>${row.score}/10</strong></span>`).join('')}</div>` : `<p class="note">${esc(t('noMonthAwards'))}</p>`}<p class="award-rule">${esc(t('completedMonthAwards'))}</p></article></div>
      ${rows.length ? `<section class="profile-trends" aria-label="${esc(t('playerStreaks'))}"><h2>${esc(t('playerStreaks'))}</h2><div class="trend-grid">${rows.map(row => trendCard(row)).join('')}</div></section>` : ''}`;
  }
  function renderAdmin() {
    const box = $('trendSettings');
    if (!box) return;
    box.classList.toggle('hidden', !isAdmin());
    if (!isAdmin()) { box.replaceChildren(); return; }
    box.innerHTML = `<h2>${esc(t('hiddenTrends'))}</h2>${settingsError ? `<p class="note">${esc(t('trendSettingsUnavailable'))}</p>` : !settingsReady ? `<p class="note">${esc(t('loadingTrends'))}</p>` : !hidden.size ? `<p class="note">${esc(t('noHiddenTrends'))}</p>` : `<div class="hidden-trend-list">${[...hidden].map(id => {
      let pid, type;
      try { [pid,type] = JSON.parse(decodeURIComponent(id)); } catch { return ''; }
      return `<div><span><bdi>${esc(name(pid))}</bdi> · ${esc(t(`trendName_${type}`))}</span><button type="button" class="btn btn-quiet" data-restore-trend="${esc(id)}" ${saving ? 'disabled' : ''}>${esc(t('restoreTrend'))}</button></div>`;
    }).join('')}</div>`}`;
  }
  function render() {
    sync(); renderLatest(); renderRankings(); renderProfile(); renderAdmin();
    const box = $('dashboardTrends');
    if (!box) return;
    // Fail closed when global moderation preferences cannot be read.
    const headlines = settingsReady ? selectHeadlineTrends(trends,hidden) : [];
    box.classList.toggle('hidden', !headlines.length);
    box.innerHTML = headlines.length ? `<div class="section-heading"><h2>${esc(t('headlineStreaks'))}</h2></div><div class="trend-grid">${headlines.map(trend => trendCard(trend,true)).join('')}</div>` : '';
  }
  const click = async event => {
    const ranking = event.target.closest('[data-award-ranking]');
    if (ranking && ['votingPoints','motmAwards'].includes(ranking.dataset.awardRanking)) {
      rankingKey = ranking.dataset.awardRanking; renderRankings();
      $('dashboardAwardRanking')?.querySelector(`[data-award-ranking="${rankingKey}"]`)?.focus({preventScroll:true});
      return;
    }
    const trigger = event.target.closest('[data-hide-trend], [data-restore-trend]');
    if (!trigger || !isAdmin() || saving || !settingsReady) return;
    const hide = !!trigger.dataset.hideTrend, id = trigger.dataset.hideTrend || trigger.dataset.restoreTrend;
    const trend = trends.find(row => row.id === id);
    if (hide && !trend) return;
    saving = true; render();
    try {
      const [playerId,type,startMatchKey] = JSON.parse(decodeURIComponent(id));
      await setDoc(doc(db,'trendVisibility',id),{playerId,type,startMatchKey,hidden:hide,updatedAt:serverTimestamp()});
      notify(t(hide ? 'trendHidden' : 'trendRestored'));
    } catch { notify(t('trendSettingsUnavailable'),'error'); }
    finally { saving = false; render(); }
  };
  document.addEventListener('click',click);
  const stop = onSnapshot(collection(db,'trendVisibility'),snap => {
    hidden = new Set(snap.docs.filter(row => row.data().hidden === true).map(row => row.id));
    settingsReady = true; settingsError = false; render();
  },() => { settingsReady = false; settingsError = true; render(); });
  return { render, getStatistics() { sync(); return { byPlayer: statistics, complete: resultsComplete(), error: state.error }; }, setResults(next) { state = next; render(); }, dispose() { stop(); document.removeEventListener('click',click); } };
}

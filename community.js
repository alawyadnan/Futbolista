import { collection, doc, getDoc, getDocs, onSnapshot, query, where, orderBy, limit, runTransaction, setDoc, updateDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, sendPasswordResetEmail, sendEmailVerification, reload } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { ballotChoices, moveVoteChoiceUp, planEntryVoting, selectVotingSession, sessionDocumentId, tallyBallots, validateBallot, validateProfile, votingState } from './community-engine.js?v=500405';
import { renderWithFormDraft } from './ux-utils.js?v=500405';
import { accountJourney, authFeedbackKey } from './account-ux.js?v=500405';
import { awardPodium, motmWinners } from './highlights-engine.js?v=500405';

export function createCommunity({ db, auth, getModel, getPlayers, isDataReady, t, esc, notify, openProfile, onProfilesChanged, showAccount, onResultsChanged = () => {} }) {
  const $ = id => document.getElementById(id);
  let user = null, admin = false, link = null, linkRequest = null, accountReady = false;
  let profiles = new Map(), sessions = [], requests = [], ownBallot = null, ballotKey = '', accountError = false;
  let ownStops = [], adminStop = null, ballotStop = null, busy = false, authMode = 'signin';
  let generation = 0, lastPhase = '', timer = null, expiryTimer = null, ballotDirty = false;
  let accountView = '';
  let editingRequest = false, passwordVisible = false, accountFeedback = null;
  let selectedSessionId = '';
  const results = new Map(), resultLoads = new Map();
  const publicStops = [];
  let sessionsReady = false, sessionsError = false, loadingArchive = false, disposed = false;
  let stopSessions = null;
  let receiptStops = [], receiptKey = '';
  const resultErrors = new Set(), receiptCounts = new Map();
  const playerName = id => getPlayers().find(player => String(player.id) === id)?.name || t('unknown');
  const errorMessage = error => t(authFeedbackKey(error) || (error?.code === 'permission-denied' ? 'communityDenied' : error?.message && ['playerAlreadyLinked','accountAlreadyLinked','invalidProfile','invalidDisplayName','invalidNumber','linkedRequired','votingClosed','chooseThree','uniqueChoices','noSelfVote','invalidCandidate','participantRequired','sessionTooLarge','sessionTooSmall'].includes(error.message) ? error.message : 'communityFailed'));
  const button = (action, label, extra = '') => `<button type="button" class="btn btn-quiet" data-community-action="${action}" ${extra}>${esc(t(label))}</button>`;
  const field = (id, label, type = 'text', value = '', extra = '') => `<label class="field" for="${id}"><span>${esc(t(label))}</span><input id="${id}" name="${id}" class="input" type="${type}" value="${esc(value)}" ${extra}></label>`;
  const option = (id, label, selected = '') => `<option value="${esc(id)}" ${id === selected ? 'selected' : ''}>${esc(label)}</option>`;

  function activeSession() { return selectVotingSession(sessions,selectedSessionId,link?.playerId); }
  const sessionDate = session => {
    const date = new Date(`${session.date}T12:00:00`);
    return Number.isNaN(date.getTime()) ? session.date : new Intl.DateTimeFormat(document.documentElement.lang === 'ar' ? 'ar-SA-u-ca-gregory' : 'en-GB',{day:'numeric',month:'long',year:'numeric'}).format(date);
  };
  function render() { renderAccount(); renderRequests(); renderAdminVoting(); renderVoting(); }
  function renderAccount() {
    const view = `${generation}:${authMode}:${editingRequest}:${accountReady}:${accountError}:${link?.playerId || ''}:${linkRequest?.status || ''}`;
    renderWithFormDraft($('accountContent'), renderAccountContent, accountView === view);
    accountView = view;
    const card = $('accountContent')?.querySelector('.account-card');
    if (card) card.insertAdjacentHTML('beforeend', `<p id="accountFeedback" class="account-feedback ${accountFeedback?.tone || ''}" role="${accountFeedback?.tone === 'error' ? 'alert' : 'status'}" ${accountFeedback ? '' : 'hidden'}>${esc(accountFeedback?.message || '')}</p>`);
    if (busy) $('accountContent')?.querySelectorAll('button').forEach(button => { button.disabled = true; });
  }
  function feedback(message, tone = 'success') {
    accountFeedback = { message, tone };
    const box = $('accountFeedback');
    if (!box) return;
    box.className = `account-feedback ${tone}`;
    box.setAttribute('role', tone === 'error' ? 'alert' : 'status');
    box.textContent = message; box.hidden = false;
  }
  function journey() {
    return `<ol class="account-journey" aria-label="${esc(t('accountSetup'))}">${accountJourney({emailVerified:user?.emailVerified,linked:!!link,requestStatus:linkRequest?.status}).map((step,index) => `<li class="${step.complete ? 'complete' : step.current ? 'current' : ''}" ${step.current ? 'aria-current="step"' : ''}><span aria-hidden="true">${step.complete ? '✓' : index + 1}</span><strong>${esc(t(step.label))}</strong></li>`).join('')}</ol>`;
  }
  function renderAccountContent() {
    const box = $('accountContent');
    if (!box) return;
    $('btnAccount').textContent = t(link ? 'myProfile' : 'account');
    if (!user) {
      box.innerHTML = `<article class="card account-card"><div class="account-mark" aria-hidden="true">◉</div><h2>${esc(t(authMode === 'signup' ? 'createAccount' : 'signIn'))}</h2>
        <div class="account-modes">${button('signin-mode','signIn',`aria-pressed="${authMode === 'signin'}"`)}${button('signup-mode','createAccount',`aria-pressed="${authMode === 'signup'}"`)}</div>
        <form id="communityAuthForm">${field('accountEmail','email','email','','autocomplete="username" inputmode="email" autocapitalize="none" spellcheck="false" required maxlength="254"')}
          <div class="field"><label for="accountPassword">${esc(t('password'))}</label><div class="password-wrap"><input id="accountPassword" name="accountPassword" class="input" type="${passwordVisible ? 'text' : 'password'}" autocomplete="${authMode === 'signup' ? 'new-password' : 'current-password'}" required ${authMode === 'signup' ? 'minlength="8"' : ''} maxlength="128"><button type="button" class="password-toggle" data-community-action="toggle-password" aria-controls="accountPassword" aria-pressed="${passwordVisible}">${esc(t(passwordVisible ? 'hidePassword' : 'showPassword'))}</button></div></div>
          ${authMode === 'signup' ? `<p class="note">${esc(t('accountLinkLead'))}</p>` : ''}<button class="btn btn-primary full" type="submit">${esc(t(authMode === 'signup' ? 'createAccount' : 'signIn'))}</button></form>
        ${button('reset-password','forgotPassword')}</article>`;
      return;
    }
    const identity = `<div class="account-identity"><bdi dir="auto">${esc(user.email || '')}</bdi>${button('signout','logout')}</div>`;
    if (admin) { box.innerHTML = `<article class="card account-card">${identity}<h2>${esc(t('adminWorkspace'))}</h2><p class="note">${esc(t('adminAccountLead'))}</p></article>`; return; }
    if (!user.emailVerified) {
      box.innerHTML = `<article class="card account-card">${identity}${journey()}<h2>${esc(t('verifyEmail'))}</h2><p class="note">${esc(t('verifyEmailLead'))}</p><p class="verification-tip">${esc(t('checkSpam'))}</p><div class="account-actions verification-actions">${button('refresh-account','verifiedContinue')}${button('verify-email','sendVerification')}</div></article>`;
      return;
    }
    if (accountError) { box.innerHTML = `<article class="card account-card">${identity}<h2>${esc(t('noData'))}</h2>${button('refresh-account','retryData')}</article>`; return; }
    if (!accountReady) { box.innerHTML = `<article class="card account-card" aria-busy="true">${identity}<p>${esc(t('loadingAccount'))}</p></article>`; return; }
    if (link) {
      const profile = profiles.get(link.playerId);
      box.innerHTML = `<article class="card account-card">${identity}<span class="account-status linked">${esc(t('accountLinked'))}</span><div class="account-linked"><span class="account-shirt" aria-hidden="true">${profile?.preferredNumber ?? '—'}</span><div><div class="eyebrow">${esc(t('myProfile'))}</div><h2><bdi dir="auto">${esc(playerName(link.playerId))}</bdi></h2></div></div>
        ${button('my-stats','viewMyStats')}<form id="profileEditForm">${field('displayName','displayName','text',profile?.displayName || playerName(link.playerId),'required maxlength="40" autocomplete="nickname"')}${field('preferredNumber','preferredNumber','number',profile?.preferredNumber ?? '','min="0" max="99" step="1" inputmode="numeric"')}
        <button class="btn btn-primary full" type="submit">${esc(t('saveProfile'))}</button></form></article>`;
      return;
    }
    const pending = linkRequest?.status === 'pending';
    box.innerHTML = `<article class="card account-card">${identity}${journey()}<h2>${esc(t(pending ? 'pendingApproval' : linkRequest?.status === 'rejected' ? 'requestRejected' : 'linkPlayer'))}</h2><p class="note">${esc(t(pending ? 'pendingApprovalLead' : linkRequest?.status === 'rejected' ? 'rejectedRequestLead' : 'accountLinkLead'))}</p>
      ${pending ? `<div class="account-requested"><bdi>${esc(playerName(linkRequest.requestedPlayerId))}</bdi></div>` : ''}
      ${pending && !editingRequest ? `<div class="account-actions">${button('edit-request','updateRequest')}</div>` : `<form id="linkPlayerForm"><label class="field" for="requestedPlayer"><span>${esc(t('player'))}</span><select class="select" id="requestedPlayer" name="requestedPlayer" required>${option('',t('selectPlayer'))}${getPlayers().map(player => option(String(player.id), player.name, linkRequest?.requestedPlayerId)).join('')}</select></label><button class="btn btn-primary full" type="submit">${esc(t(pending ? 'updateRequest' : 'requestLink'))}</button>${pending ? button('cancel-request-edit','cancel') : ''}</form>`}</article>`;
  }

  function renderRequests() {
    const box = $('accountRequests');
    if (!box) return;
    box.classList.toggle('hidden', !admin);
    if (!admin) { box.replaceChildren(); return; }
    box.innerHTML = `<div class="card-heading"><h2>${esc(t('accountRequests'))}</h2><span class="status-pill">${requests.length}</span></div>${requests.length ? requests.map(request => `<div class="account-request-row"><div><strong><bdi dir="auto">${esc(playerName(request.requestedPlayerId))}</bdi></strong><small><bdi dir="auto">${esc(request.email)}</bdi></small></div><div class="account-actions">${button('approve','approve',`data-uid="${esc(request.uid)}"`)}${button('reject','reject',`data-uid="${esc(request.uid)}"`)}</div></div>`).join('') : `<p class="note">${esc(t('noAccountRequests'))}</p>`}`;
  }

  function renderAdminVoting() {
    const box = $('adminVoting');
    if (!box) return;
    box.classList.toggle('hidden', !admin);
    if (!admin) { box.replaceChildren(); return; }
    box.innerHTML = `<h2>${esc(t('automaticVoting'))}</h2><p class="note">${esc(t('automaticVotingLead'))}</p>${sessions.filter(session => votingState(session).state === 'open').map(session => `<div class="vote-participation"><strong>${esc(sessionDate(session))}</strong><span>${esc(receiptCounts.has(session.id) ? t('confirmedVoters',{count:receiptCounts.get(session.id)}) : t('voterCountUnavailable'))}</span></div>`).join('')}<p class="note">${esc(t('receiptCountLead'))}</p>`;
  }

  function bindReceiptCounts() {
    const open = sessions.filter(session => votingState(session).state === 'open');
    const key = admin ? `${user?.uid}:${open.map(session => session.id).join('|')}` : '';
    if (key === receiptKey) return;
    receiptKey = key; receiptStops.forEach(stop => stop()); receiptStops = []; receiptCounts.clear();
    if (!admin) return;
    for (const session of open) receiptStops.push(onSnapshot(collection(db,'sessionVotes',session.id,'receipts'),snap => {
      if (receiptKey !== key) return;
      receiptCounts.set(session.id,snap.docs.length); renderAdminVoting();
    },() => { if (receiptKey === key) { receiptCounts.delete(session.id); renderAdminVoting(); } }));
  }

  function publishResults() {
    if (!disposed) onResultsChanged({ sessions, results: new Map(results), ready: sessionsReady, error: sessionsError || resultErrors.size > 0 });
  }
  async function loadResult(session) {
    if (votingState(session).state !== 'closed') return null;
    if (results.has(session.id)) return results.get(session.id);
    if (!resultLoads.has(session.id)) resultLoads.set(session.id, getDocs(collection(db,'sessionVotes',session.id,'ballots')).then(snap => {
      const result = tallyBallots(session,snap.docs.map(ballot => ({...ballot.data(),uid:ballot.id})));
      // A clock correction can reopen the UI while a request is in flight.
      if (result) { results.set(session.id,result); resultErrors.delete(session.id); }
      return result;
    }).catch(error => { resultErrors.add(session.id); throw error; }).finally(() => resultLoads.delete(session.id)));
    return resultLoads.get(session.id);
  }
  async function refreshArchive() {
    if (loadingArchive || disposed) return;
    loadingArchive = true;
    try {
      // All-time awards cannot use the former last-ten-session window. Only
      // closed ballots are fetched, once per page lifetime, in bounded batches.
      while (!disposed) {
        const batch = sessions.filter(session => votingState(session).state === 'closed' && !results.has(session.id) && !resultErrors.has(session.id)).slice(0,4);
        if (!batch.length) break;
        await Promise.allSettled(batch.map(loadResult));
        publishResults();
      }
    } finally { loadingArchive = false; publishResults(); }
  }

  async function saveMatchEntry(entry) {
    if (!admin || !isDataReady()) throw new Error('communityDenied');
    const matchKey = String(entry.matchId || entry.date).trim();
    const sessionRef = doc(db,'sessionVotes',sessionDocumentId(matchKey));
    const entryRef = doc(collection(db,'logs'));
    // Stats and the initial server-timed vote commit together, or neither does.
    await runTransaction(db,async transaction => {
      const existing = await transaction.get(sessionRef);
      const plan = planEntryVoting(getModel(),entry,existing.exists() ? existing.data() : null);
      transaction.set(entryRef,entry);
      if (plan.type === 'create') transaction.set(sessionRef,{...plan.value,firstEntryId:entryRef.id,openedAt:serverTimestamp()});
      else if (plan.type === 'append') transaction.update(sessionRef,plan.value);
    });
  }

  function bindOwnBallot(session) {
    const key = session && user?.emailVerified && session.candidatePlayerIds.includes(link?.playerId) ? `${session.id}/${user.uid}` : '';
    if (key === ballotKey) return;
    ballotStop?.(); ballotStop = null; ballotKey = key; ownBallot = null;
    if (key && link) ballotStop = onSnapshot(doc(db,'sessionVotes',session.id,'ballots',user.uid), snap => { if (ballotKey !== key) return; ownBallot = snap.exists() ? snap.data() : null; renderVoting(); }, error => { if (ballotKey === key) notify(errorMessage(error),'error'); });
  }

  function renderVoting() {
    const box = $('dashboardVoting');
    if (!box) return;
    const session = activeSession();
    bindOwnBallot(session);
    box.classList.toggle('hidden', !session);
    if (!session) { box.replaceChildren(); return; }
    const previousChoices = [...box.querySelectorAll('[data-vote-rank]')].map(select => select.value);
    const choices = ballotDirty && box.dataset.session === session.id && previousChoices.length === 3 ? previousChoices : ballotChoices(ownBallot);
    box.dataset.session = session.id;
    const enoughCandidates = session.candidatePlayerIds.length >= 4;
    const participating = session.candidatePlayerIds.includes(link?.playerId);
    const allowed = !!(user?.emailVerified && link && participating && enoughCandidates);
    const candidates = session.candidatePlayerIds.filter(id => id !== link?.playerId);
    const openSessions = sessions.filter(item => votingState(item).state === 'open');
    box.innerHTML = `<div class="card-heading"><div><div class="eyebrow">${esc(t('trainingDate'))} · <time datetime="${esc(session.date)}">${esc(sessionDate(session))}</time></div><h2>${esc(t('sessionMvp'))}</h2></div><span class="status-pill live">${esc(t('votingOpen'))}</span></div>
      ${openSessions.length > 1 ? `<label class="field voting-session" for="votingSession"><span>${esc(t('chooseTraining'))}</span><select class="select" id="votingSession">${openSessions.map(item => option(item.id,sessionDate(item),session.id)).join('')}</select></label>` : ''}
      <div class="voting-clock"><span>${esc(t('votingEndsIn'))}</span><strong data-vote-countdown></strong></div>
      ${allowed ? `<form id="ballotForm" data-session="${esc(session.id)}"><p class="vote-guidance">${esc(t('rankThreeLead'))}</p><fieldset class="vote-ranking"><legend class="sr-only">${esc(t('rankThreeLead'))}</legend>${['firstChoice','secondChoice','thirdChoice'].map((label,index) => `<div class="vote-choice" data-rank="${index}"><span class="vote-rank" aria-hidden="true">${index+1}</span><div class="vote-choice-body"><label class="field" for="voteChoice${index}"><span>${esc(t(label))}<small>${index === 2 ? esc(t('onePoint')) : `${[5,3][index]} ${esc(t('votePoints'))}`}</small></span><select id="voteChoice${index}" class="select" data-vote-rank="${index}" required>${option('',t('selectPlayer'))}${candidates.map(id => option(id,playerName(id),choices[index])).join('')}</select></label>${index ? `<button type="button" class="vote-reorder" data-vote-up="${index}" aria-label="${esc(t('moveVoteUp',{rank:t(index === 1 ? 'firstChoice' : 'secondChoice')}))}">${esc(t('moveUp'))}</button>` : ''}</div></div>`).join('')}</fieldset>
        <p class="note">${esc(t('ballotPrivacy'))}</p><div class="vote-submit"><span class="vote-saved">${ownBallot ? esc(t('youVoted')) : ''}</span><button class="btn btn-primary" type="submit">${esc(t(ownBallot ? 'updateVote' : 'submitVote'))}</button></div></form>` : !enoughCandidates ? `<p class="note">${esc(t('votingCandidatesPending'))}</p>` : `<p class="note">${esc(t('linkedRequired'))}</p>${button('open-account',user ? 'account' : 'signIn')}`}`;
    if (!allowed && enoughCandidates && link && !participating) {
      const note = box.querySelector('.note');
      note.textContent = t('participantRequired');
      box.querySelector('[data-community-action="open-account"]')?.remove();
    }
    updateChoiceAvailability(); updateCountdown();
  }

  function updateChoiceAvailability() {
    const selects = [...document.querySelectorAll('[data-vote-rank]')];
    const values = selects.map(select => select.value);
    selects.forEach(select => [...select.options].forEach(option => { option.disabled = !!option.value && option.value !== select.value && values.includes(option.value); }));
    document.querySelectorAll('[data-vote-up]').forEach(button => { button.disabled = busy || !values[Number(button.dataset.voteUp)]; });
  }
  function updateCountdown() {
    const session = activeSession();
    const phase = sessions.map(item => `${item.id}:${votingState(item).state}`).join('|');
    if (lastPhase && phase !== lastPhase) { lastPhase = phase; bindReceiptCounts(); renderVoting(); refreshHistory(); refreshArchive(); publishResults(); return; }
    lastPhase = phase;
    if (!session) return;
    const minutes = Math.ceil(votingState(session).remaining / 60000);
    const text = t('timeRemaining', { hours: Math.floor(minutes / 60), minutes: minutes % 60 });
    document.querySelectorAll('[data-vote-countdown]').forEach(node => { node.textContent = text; });
  }

  function historyMarkup(matchKey) {
    return `<div class="session-vote-result" data-session-result="${esc(matchKey)}"></div>`;
  }
  async function refreshHistory() {
    for (const box of document.querySelectorAll('.matchCard.expanded [data-session-result]')) {
      const matchKey = box.dataset.sessionResult;
      const id = sessionDocumentId(matchKey);
      let session = sessions.find(item => item.id === id);
      if (!session) {
        if (!resultLoads.has(`session:${id}`)) resultLoads.set(`session:${id}`, getDoc(doc(db,'sessionVotes',id)).then(snap => snap.exists() ? {id,...snap.data()} : null).catch(() => { resultLoads.delete(`session:${id}`); return null; }));
        session = await resultLoads.get(`session:${id}`);
      }
      if (!box.isConnected || !session) continue;
      if (votingState(session).state !== 'closed') { box.innerHTML = `<span class="status-pill">${esc(t('votingOpen'))}</span> ${button('open-voting','viewVoting',`data-session-id="${esc(id)}"`)}`; continue; }
      box.textContent = t('loadingMvp');
      try {
        await loadResult(session);
        if (!box.isConnected) continue;
        const result = results.get(id);
        box.innerHTML = `<h3>${esc(t('finalMvp'))}</h3>${!result?.totalBallots ? `<p class="note">${esc(t('noBallots'))}</p>` : `${motmWinners(result).length > 1 ? `<p class="note">${esc(t('jointMotm'))}</p>` : ''}<ol class="mvp-podium">${awardPodium(result).map(row => `<li value="${row.rank}"><span aria-hidden="true">${['🥇','🥈','🥉'][row.rank-1]}</span><button type="button" class="inline-player-link" data-community-player="${esc(row.playerId)}"><bdi>${esc(playerName(row.playerId))}</bdi></button><strong>${row.points}<small>${esc(t('votePoints'))}</small></strong></li>`).join('')}</ol><p class="note">${esc(t('ballotCount',{count:result.totalBallots}))}</p>`}`;
      } catch { if (box.isConnected) box.innerHTML = `<p class="note">${esc(t('mvpResultsPending'))}</p>${button('retry-results','retryData')}`; }
    }
  }

  function onAuth(nextUser, isAdmin) {
    const currentGeneration = ++generation;
    ownStops.forEach(stop => stop()); ownStops = []; adminStop?.(); adminStop = null;
    ballotStop?.(); ballotStop = null; ballotKey = ''; ownBallot = null; ballotDirty = false;
    selectedSessionId = '';
    user = nextUser; admin = isAdmin; link = null; linkRequest = null; requests = []; accountReady = false; accountError = false;
    bindReceiptCounts();
    editingRequest = false; passwordVisible = false; accountFeedback = null;
    if (user && !admin) {
      let userReady = false, requestReady = false;
      const loaded = () => { accountReady = userReady && requestReady; render(); };
      const fail = () => { if (generation !== currentGeneration) return; accountError = true; renderAccount(); };
      ownStops.push(onSnapshot(doc(db,'users',user.uid),snap => { if (generation !== currentGeneration) return; link = snap.exists() ? snap.data() : null; userReady = true; ballotKey = ''; loaded(); },fail));
      ownStops.push(onSnapshot(doc(db,'accountRequests',user.uid),snap => { if (generation !== currentGeneration) return; linkRequest = snap.exists() ? snap.data() : null; requestReady = true; loaded(); },fail));
    }
    if (admin) adminStop = onSnapshot(query(collection(db,'accountRequests'),where('status','==','pending')),snap => { if (generation !== currentGeneration) return; requests = snap.docs.map(item => ({...item.data(),uid:item.id})); renderRequests(); },error => notify(errorMessage(error),'error'));
    render();
  }

  async function approve(uid) {
    if (!admin) throw new Error('communityDenied');
    await runTransaction(db, async transaction => {
      const requestRef = doc(db,'accountRequests',uid);
      const request = await transaction.get(requestRef);
      if (!request.exists() || request.data().status !== 'pending') throw new Error('accountAlreadyLinked');
      const pid = request.data().requestedPlayerId;
      const userRef = doc(db,'users',uid), claimRef = doc(db,'playerClaims',pid), playerRef = doc(db,'players',pid);
      const existingUser = await transaction.get(userRef), claim = await transaction.get(claimRef), player = await transaction.get(playerRef);
      if (existingUser.exists()) throw new Error('accountAlreadyLinked');
      if (claim.exists()) throw new Error('playerAlreadyLinked');
      if (!player.exists()) throw new Error('invalidCandidate');
      const profile = validateProfile({displayName: String(player.data().name || '').slice(0,40), preferredNumber:null});
      if (profile.error) throw new Error(profile.error);
      transaction.set(userRef,{playerId:pid,createdAt:serverTimestamp()});
      transaction.set(claimRef,{uid,createdAt:serverTimestamp()});
      transaction.set(doc(db,'playerProfiles',pid),{...profile.value,updatedAt:serverTimestamp()});
      transaction.update(requestRef,{status:'approved',updatedAt:serverTimestamp()});
    });
  }

  async function action(fn, success = '') {
    if (busy) return;
    busy = true;
    const accountAction = !$('screen-account')?.classList.contains('hidden');
    const actionGeneration = generation;
    if (accountAction) { accountFeedback = null; if ($('accountFeedback')) $('accountFeedback').hidden = true; }
    document.querySelectorAll('[data-community-action], #accountContent button, #ballotForm button').forEach(button => { button.disabled = true; });
    try { await fn(); if (success) notify(t(success)); }
    catch(error) { const message = errorMessage(error); notify(message,'error'); if (accountAction && actionGeneration === generation) feedback(message,'error'); }
    finally { busy = false; document.querySelectorAll('[data-community-action], #accountContent button, #ballotForm button').forEach(button => { button.disabled = false; }); updateChoiceAvailability(); }
  }

  document.addEventListener('click', event => {
    const reorder = event.target.closest('[data-vote-up]');
    if (reorder && !busy) {
      const selects = [...document.querySelectorAll('[data-vote-rank]')];
      const choices = moveVoteChoiceUp(selects.map(select => select.value),Number(reorder.dataset.voteUp));
      selects.forEach((select,index) => { select.value = choices[index]; });
      ballotDirty = true; updateChoiceAvailability(); return;
    }
    const player = event.target.closest('[data-community-player]');
    if (player) openProfile(player.dataset.communityPlayer);
    const trigger = event.target.closest('[data-community-action]');
    if (!trigger) return;
    const name = trigger.dataset.communityAction;
    if (busy) return;
    if (name === 'toggle-password') {
      passwordVisible = !passwordVisible;
      $('accountPassword').type = passwordVisible ? 'text' : 'password';
      trigger.textContent = t(passwordVisible ? 'hidePassword' : 'showPassword');
      trigger.setAttribute('aria-pressed', String(passwordVisible)); return;
    }
    if (name === 'edit-request' || name === 'cancel-request-edit') { editingRequest = name === 'edit-request'; renderAccount(); if (editingRequest) $('requestedPlayer')?.focus(); return; }
    if (name === 'signin-mode' || name === 'signup-mode') { authMode = name === 'signup-mode' ? 'signup' : 'signin'; passwordVisible = false; accountFeedback = null; renderAccount(); return; }
    if (name === 'open-account') { showAccount(); return; }
    if (name === 'open-voting') { selectedSessionId = trigger.dataset.sessionId; ballotDirty = false; location.hash = 'dashboard'; renderVoting(); $('dashboardVoting')?.scrollIntoView({block:'start'}); return; }
    if (name === 'my-stats' && link) { openProfile(link.playerId); return; }
    if (name === 'retry-results') { resultErrors.clear(); if (sessionsError) subscribeSessions(); refreshArchive(); refreshHistory(); return; }
    action(async () => {
      if (name === 'signout') await signOut(auth);
      else if (name === 'verify-email' && user) { await sendEmailVerification(user); notify(t('verificationSent')); feedback(t('verificationSent')); }
      else if (name === 'refresh-account' && user) { await reload(user); await user.getIdToken(true); onAuth(auth.currentUser,admin); if (!auth.currentUser?.emailVerified) feedback(t('verificationNotYet'),'warning'); }
      else if (name === 'reset-password') {
        const email = $('accountEmail'); if (!email?.checkValidity()) { email?.reportValidity(); return; }
        try { await sendPasswordResetEmail(auth,email.value.trim()); } catch(error) { if (error.code !== 'auth/user-not-found') throw error; }
        notify(t('resetEmailSent')); feedback(t('resetEmailSent'));
      }
      else if (name === 'approve') await approve(trigger.dataset.uid);
      else if (name === 'reject' && admin) await updateDoc(doc(db,'accountRequests',trigger.dataset.uid),{status:'rejected',updatedAt:serverTimestamp()});
    });
  });
  const markAccountDraft = event => {
    const form = event.target.closest('#communityAuthForm, #profileEditForm, #linkPlayerForm');
    if (form) form.dataset.dirty = 'true';
  };
  document.addEventListener('input', markAccountDraft);
  document.addEventListener('change',event => {
    markAccountDraft(event);
    if (event.target.id === 'votingSession') { selectedSessionId = event.target.value; ballotDirty = false; renderVoting(); }
    if (event.target.matches('[data-vote-rank]')) { ballotDirty = true; updateChoiceAvailability(); }
  });
  document.addEventListener('submit',event => {
    if (!['communityAuthForm','profileEditForm','linkPlayerForm','ballotForm'].includes(event.target.id)) return;
    event.preventDefault();
    const form = event.target;
    if (!form.reportValidity()) return;
    action(async () => {
      if (form.id === 'communityAuthForm') {
        const email = $('accountEmail').value.trim(), password = $('accountPassword').value;
        const credential = authMode === 'signup' ? await createUserWithEmailAndPassword(auth,email,password) : await signInWithEmailAndPassword(auth,email,password);
        if (authMode === 'signup') { try { await sendEmailVerification(credential.user); notify(t('verificationSent')); } catch { notify(t('verificationRetry'),'warning'); } }
        if ($('accountPassword')) $('accountPassword').value = '';
      } else if (form.id === 'profileEditForm') {
        if (!link || !user?.emailVerified) throw new Error('linkedRequired');
        const rawNumber = $('preferredNumber').value;
        const profile = validateProfile({displayName:$('displayName').value,preferredNumber:rawNumber === '' ? null : Number(rawNumber)});
        if (profile.error) throw new Error(profile.error);
        await updateDoc(doc(db,'playerProfiles',link.playerId),{...profile.value,updatedAt:serverTimestamp()}); notify(t('profileSaved'));
      } else if (form.id === 'linkPlayerForm') {
        if (!user?.emailVerified || link) throw new Error('linkedRequired');
        await setDoc(doc(db,'accountRequests',user.uid),{requestedPlayerId:$('requestedPlayer').value,email:user.email,status:'pending',createdAt:linkRequest?.createdAt || serverTimestamp(),updatedAt:serverTimestamp()}); editingRequest = false; renderAccount(); notify(t('requestSent'));
      } else if (form.id === 'ballotForm') {
        const session = sessions.find(item => item.id === form.dataset.session), choices = [...form.querySelectorAll('[data-vote-rank]')].map(select => select.value);
        const invalid = validateBallot({session,user:link,choices}); if (invalid) throw new Error(invalid);
        const uid = user.uid, pid = link.playerId;
        const ref = doc(db,'sessionVotes',session.id,'ballots',uid);
        await runTransaction(db,async transaction => { const old = await transaction.get(ref); transaction.set(ref,{voterPlayerId:pid,firstPlayerId:choices[0],secondPlayerId:choices[1],thirdPlayerId:choices[2],submittedAt:old.exists() ? old.data().submittedAt : serverTimestamp(),updatedAt:serverTimestamp()});
          // Choice-free receipt: admins can count acknowledgements without
          // gaining access to private ballots. Existing ballots stay unchanged.
          transaction.set(doc(db,'sessionVotes',session.id,'receipts',uid),{updatedAt:serverTimestamp()});
        }); ballotDirty = false; notify(t('voteSaved'));
      }
    });
  });

  publicStops.push(onSnapshot(collection(db,'playerProfiles'),snap => { profiles = new Map(snap.docs.map(item => [item.id,item.data()])); onProfilesChanged(profiles); if (!$('accountContent')?.contains(document.activeElement)) renderAccount(); },error => notify(errorMessage(error),'error')));
  function subscribeSessions() {
    stopSessions?.();
    stopSessions = onSnapshot(query(collection(db,'sessionVotes'),orderBy('openedAt','desc')),snap => { sessions = snap.docs.map(item => ({...item.data(),id:item.id})); sessionsReady = true; sessionsError = false; clearTimeout(expiryTimer); const active = activeSession(); if (active) expiryTimer = setTimeout(() => { updateCountdown(); renderVoting(); refreshHistory(); refreshArchive(); }, Math.min(2147483647, votingState(active).remaining + 50)); bindReceiptCounts(); renderVoting(); renderAdminVoting(); refreshHistory(); publishResults(); refreshArchive(); },error => { sessionsError = true; publishResults(); notify(errorMessage(error),'error'); });
  }
  subscribeSessions();
  timer = setInterval(updateCountdown,15000);
  document.addEventListener('visibilitychange',() => { if (!document.hidden) { updateCountdown(); refreshHistory(); } });
  return { onAuth, render, saveMatchEntry, historyMarkup, refreshHistory, getProfile: id => profiles.get(String(id)), dispose() { disposed = true; stopSessions?.(); publicStops.forEach(stop => stop()); ownStops.forEach(stop => stop()); receiptStops.forEach(stop => stop()); adminStop?.(); ballotStop?.(); clearInterval(timer); clearTimeout(expiryTimer); } };
}

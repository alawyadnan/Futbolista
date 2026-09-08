import { collection, doc, getDoc, getDocs, onSnapshot, query, where, orderBy, limit, runTransaction, setDoc, updateDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, sendPasswordResetEmail, sendEmailVerification, reload } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { ballotChoices, planEntryVoting, sessionDocumentId, tallyBallots, validateBallot, validateProfile, votingState } from './community-engine.js?v=500400';
import { renderWithFormDraft } from './ux-utils.js?v=500400';

export function createCommunity({ db, auth, getModel, getPlayers, isDataReady, t, esc, notify, openProfile, onProfilesChanged, showAccount }) {
  const $ = id => document.getElementById(id);
  let user = null, admin = false, link = null, linkRequest = null, accountReady = false;
  let profiles = new Map(), sessions = [], requests = [], ownBallot = null, ballotKey = '', accountError = false;
  let ownStops = [], adminStop = null, ballotStop = null, busy = false, authMode = 'signin';
  let generation = 0, lastPhase = '', timer = null, expiryTimer = null, ballotDirty = false;
  let accountView = '';
  const results = new Map(), resultLoads = new Map();
  const publicStops = [];
  const playerName = id => getPlayers().find(player => String(player.id) === id)?.name || t('unknown');
  const errorMessage = error => t(error?.code === 'auth/too-many-requests' ? 'tooManyAttempts' : error?.code === 'auth/weak-password' ? 'strongPassword' : error?.code === 'permission-denied' ? 'communityDenied' : error?.message && ['playerAlreadyLinked','accountAlreadyLinked','invalidProfile','invalidDisplayName','invalidNumber','linkedRequired','votingClosed','chooseThree','uniqueChoices','noSelfVote','invalidCandidate','sessionTooLarge','sessionTooSmall'].includes(error.message) ? error.message : 'communityFailed');
  const button = (action, label, extra = '') => `<button type="button" class="btn btn-quiet" data-community-action="${action}" ${extra}>${esc(t(label))}</button>`;
  const field = (id, label, type = 'text', value = '', extra = '') => `<label class="field" for="${id}"><span>${esc(t(label))}</span><input id="${id}" name="${id}" class="input" type="${type}" value="${esc(value)}" ${extra}></label>`;
  const option = (id, label, selected = '') => `<option value="${esc(id)}" ${id === selected ? 'selected' : ''}>${esc(label)}</option>`;

  function latestOpen() { return sessions.find(session => votingState(session).state === 'open') || null; }
  function render() { renderAccount(); renderRequests(); renderAdminVoting(); renderVoting(); }
  function renderAccount() {
    const view = `${generation}:${authMode}:${accountReady}:${accountError}:${link?.playerId || ''}:${linkRequest?.status || ''}`;
    renderWithFormDraft($('accountContent'), renderAccountContent, accountView === view);
    accountView = view;
  }
  function renderAccountContent() {
    const box = $('accountContent');
    if (!box) return;
    $('btnAccount').textContent = t(link ? 'myProfile' : 'account');
    if (!user) {
      box.innerHTML = `<article class="card account-card"><div class="account-mark" aria-hidden="true">◉</div><h2>${esc(t(authMode === 'signup' ? 'createAccount' : 'signIn'))}</h2>
        <div class="account-modes">${button('signin-mode','signIn',`aria-pressed="${authMode === 'signin'}"`)}${button('signup-mode','createAccount',`aria-pressed="${authMode === 'signup'}"`)}</div>
        <form id="communityAuthForm">${field('accountEmail','email','email','','autocomplete="username" required maxlength="254"')}${field('accountPassword','password','password','',`autocomplete="${authMode === 'signup' ? 'new-password' : 'current-password'}" required ${authMode === 'signup' ? 'minlength="8"' : ''} maxlength="128"`)}
          ${authMode === 'signup' ? `<p class="note">${esc(t('accountLinkLead'))}</p>` : ''}<button class="btn btn-primary full" type="submit">${esc(t(authMode === 'signup' ? 'createAccount' : 'signIn'))}</button></form>
        ${button('reset-password','forgotPassword')}</article>`;
      return;
    }
    const identity = `<div class="account-identity"><bdi dir="auto">${esc(user.email || '')}</bdi>${button('signout','logout')}</div>`;
    if (admin) { box.innerHTML = `<article class="card account-card">${identity}<h2>${esc(t('adminWorkspace'))}</h2><p class="note">${esc(t('adminAccountLead'))}</p></article>`; return; }
    if (!user.emailVerified) {
      box.innerHTML = `<article class="card account-card">${identity}<h2>${esc(t('verifyEmail'))}</h2><p class="note">${esc(t('verifyEmailLead'))}</p><div class="account-actions">${button('verify-email','sendVerification')}${button('refresh-account','verifiedContinue')}</div></article>`;
      return;
    }
    if (accountError) { box.innerHTML = `<article class="card account-card">${identity}<h2>${esc(t('noData'))}</h2>${button('refresh-account','retryData')}</article>`; return; }
    if (!accountReady) { box.innerHTML = `<article class="card account-card" aria-busy="true">${identity}<p>${esc(t('loadingAccount'))}</p></article>`; return; }
    if (link) {
      const profile = profiles.get(link.playerId);
      box.innerHTML = `<article class="card account-card">${identity}<div class="account-linked"><span class="account-shirt" aria-hidden="true">${profile?.preferredNumber ?? '—'}</span><div><div class="eyebrow">${esc(t('myProfile'))}</div><h2><bdi dir="auto">${esc(playerName(link.playerId))}</bdi></h2></div></div>
        ${button('my-stats','viewMyStats')}<form id="profileEditForm">${field('displayName','displayName','text',profile?.displayName || playerName(link.playerId),'required maxlength="40" autocomplete="nickname"')}${field('preferredNumber','preferredNumber','number',profile?.preferredNumber ?? '','min="0" max="99" step="1" inputmode="numeric"')}
        <button class="btn btn-primary full" type="submit">${esc(t('saveProfile'))}</button></form></article>`;
      return;
    }
    const pending = linkRequest?.status === 'pending';
    box.innerHTML = `<article class="card account-card">${identity}<h2>${esc(t(pending ? 'pendingApproval' : linkRequest?.status === 'rejected' ? 'requestRejected' : 'linkPlayer'))}</h2><p class="note">${esc(t(pending ? 'pendingApprovalLead' : 'accountLinkLead'))}</p>
      ${pending ? `<div class="account-requested"><bdi>${esc(playerName(linkRequest.requestedPlayerId))}</bdi></div>` : ''}
      <form id="linkPlayerForm"><label class="field" for="requestedPlayer"><span>${esc(t('player'))}</span><select class="select" id="requestedPlayer" name="requestedPlayer" required>${option('',t('selectPlayer'))}${getPlayers().map(player => option(String(player.id), player.name, linkRequest?.requestedPlayerId)).join('')}</select></label><button class="btn btn-primary full" type="submit">${esc(t(pending ? 'updateRequest' : 'requestLink'))}</button></form></article>`;
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
    box.innerHTML = `<h2>${esc(t('automaticVoting'))}</h2><p class="note">${esc(t('automaticVotingLead'))}</p>`;
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
    const key = session && user ? `${session.id}/${user.uid}` : '';
    if (key === ballotKey) return;
    ballotStop?.(); ballotStop = null; ballotKey = key; ownBallot = null;
    if (key && link) ballotStop = onSnapshot(doc(db,'sessionVotes',session.id,'ballots',user.uid), snap => { if (ballotKey !== key) return; ownBallot = snap.exists() ? snap.data() : null; renderVoting(); }, error => { if (ballotKey === key) notify(errorMessage(error),'error'); });
  }

  function renderVoting() {
    const box = $('dashboardVoting');
    if (!box) return;
    const session = latestOpen();
    bindOwnBallot(session);
    box.classList.toggle('hidden', !session);
    if (!session) { box.replaceChildren(); return; }
    const previousChoices = [...box.querySelectorAll('[data-vote-rank]')].map(select => select.value);
    const choices = ballotDirty && box.dataset.session === session.id && previousChoices.length === 3 ? previousChoices : ballotChoices(ownBallot);
    box.dataset.session = session.id;
    const enoughCandidates = session.candidatePlayerIds.length >= 4;
    const allowed = !!(user?.emailVerified && link && enoughCandidates);
    const candidates = session.candidatePlayerIds.filter(id => id !== link?.playerId);
    box.innerHTML = `<div class="card-heading"><div><div class="eyebrow">${esc(session.date)}</div><h2>${esc(t('sessionMvp'))}</h2></div><span class="status-pill live">${esc(t('votingOpen'))}</span></div>
      <div class="voting-clock"><span>${esc(t('votingEndsIn'))}</span><strong data-vote-countdown></strong></div>
      ${allowed ? `<form id="ballotForm">${['firstChoice','secondChoice','thirdChoice'].map((label,index) => `<label class="vote-choice" for="voteChoice${index}"><span class="vote-rank">${index+1}</span><span class="field"><span>${esc(t(label))}<small>${index === 2 ? esc(t('onePoint')) : `${[5,3][index]} ${esc(t('votePoints'))}`}</small></span><select id="voteChoice${index}" class="select" data-vote-rank="${index}" required>${option('',t('selectPlayer'))}${candidates.map(id => option(id,playerName(id),choices[index])).join('')}</select></span></label>`).join('')}
        <p class="note">${esc(t('ballotPrivacy'))}</p><div class="vote-submit"><span class="vote-saved">${ownBallot ? esc(t('youVoted')) : ''}</span><button class="btn btn-primary" type="submit">${esc(t(ownBallot ? 'updateVote' : 'submitVote'))}</button></div></form>` : !enoughCandidates ? `<p class="note">${esc(t('votingCandidatesPending'))}</p>` : `<p class="note">${esc(t('linkedRequired'))}</p>${button('open-account',user ? 'account' : 'signIn')}`}`;
    updateChoiceAvailability(); updateCountdown();
  }

  function updateChoiceAvailability() {
    const selects = [...document.querySelectorAll('[data-vote-rank]')];
    const values = selects.map(select => select.value);
    selects.forEach(select => [...select.options].forEach(option => { option.disabled = !!option.value && option.value !== select.value && values.includes(option.value); }));
  }
  function updateCountdown() {
    const session = latestOpen();
    const phase = sessions.map(item => `${item.id}:${votingState(item).state}`).join('|');
    if (lastPhase && phase !== lastPhase) { lastPhase = phase; renderVoting(); refreshHistory(); return; }
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
      if (votingState(session).state !== 'closed') { box.innerHTML = `<span class="status-pill">${esc(t('votingOpen'))}</span>`; continue; }
      box.textContent = t('loadingMvp');
      try {
        if (!results.has(id)) {
          if (!resultLoads.has(id)) resultLoads.set(id, getDocs(collection(db,'sessionVotes',id,'ballots')).then(snap => tallyBallots(session,snap.docs.map(ballot => ({...ballot.data(),uid:ballot.id})))).catch(error => { resultLoads.delete(id); throw error; }));
          results.set(id, await resultLoads.get(id));
        }
        if (!box.isConnected) continue;
        const result = results.get(id);
        box.innerHTML = `<h3>${esc(t('finalMvp'))}</h3>${!result?.totalBallots ? `<p class="note">${esc(t('noBallots'))}</p>` : `<ol class="mvp-podium">${result.ranking.filter(row => row.points > 0).slice(0,3).map((row,index) => `<li><span aria-hidden="true">${['🥇','🥈','🥉'][index]}</span><button type="button" class="inline-player-link" data-community-player="${esc(row.playerId)}"><bdi>${esc(playerName(row.playerId))}</bdi></button><strong>${row.points}<small>${esc(t('votePoints'))}</small></strong></li>`).join('')}</ol><p class="note">${esc(t('ballotCount',{count:result.totalBallots}))}</p>`}`;
      } catch { if (box.isConnected) box.innerHTML = `<p class="note">${esc(t('mvpResultsPending'))}</p>${button('retry-results','retryData')}`; }
    }
  }

  function onAuth(nextUser, isAdmin) {
    const currentGeneration = ++generation;
    ownStops.forEach(stop => stop()); ownStops = []; adminStop?.(); adminStop = null;
    ballotStop?.(); ballotStop = null; ballotKey = ''; ownBallot = null; ballotDirty = false;
    user = nextUser; admin = isAdmin; link = null; linkRequest = null; requests = []; accountReady = false; accountError = false;
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
    document.querySelectorAll('[data-community-action], #accountContent button, #ballotForm button').forEach(button => { button.disabled = true; });
    try { await fn(); if (success) notify(t(success)); }
    catch(error) { notify(errorMessage(error),'error'); }
    finally { busy = false; document.querySelectorAll('[data-community-action], #accountContent button, #ballotForm button').forEach(button => { button.disabled = false; }); }
  }

  document.addEventListener('click', event => {
    const player = event.target.closest('[data-community-player]');
    if (player) openProfile(player.dataset.communityPlayer);
    const trigger = event.target.closest('[data-community-action]');
    if (!trigger) return;
    const name = trigger.dataset.communityAction;
    if (name === 'signin-mode' || name === 'signup-mode') { authMode = name === 'signup-mode' ? 'signup' : 'signin'; renderAccount(); return; }
    if (name === 'open-account') { showAccount(); return; }
    if (name === 'my-stats' && link) { openProfile(link.playerId); return; }
    if (name === 'retry-results') { refreshHistory(); return; }
    action(async () => {
      if (name === 'signout') await signOut(auth);
      else if (name === 'verify-email' && user) { await sendEmailVerification(user); notify(t('verificationSent')); }
      else if (name === 'refresh-account' && user) { await reload(user); await user.getIdToken(true); onAuth(auth.currentUser,admin); }
      else if (name === 'reset-password') {
        const email = $('accountEmail'); if (!email?.checkValidity()) { email?.reportValidity(); return; }
        try { await sendPasswordResetEmail(auth,email.value.trim()); } catch(error) { if (error.code !== 'auth/user-not-found') throw error; }
        notify(t('resetEmailSent'));
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
  document.addEventListener('change',event => { markAccountDraft(event); if (event.target.matches('[data-vote-rank]')) { ballotDirty = true; updateChoiceAvailability(); } });
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
        await setDoc(doc(db,'accountRequests',user.uid),{requestedPlayerId:$('requestedPlayer').value,email:user.email,status:'pending',createdAt:linkRequest?.createdAt || serverTimestamp(),updatedAt:serverTimestamp()}); notify(t('requestSent'));
      } else if (form.id === 'ballotForm') {
        const session = latestOpen(), choices = [...form.querySelectorAll('[data-vote-rank]')].map(select => select.value);
        const invalid = validateBallot({session,user:link,choices}); if (invalid) throw new Error(invalid);
        const uid = user.uid, pid = link.playerId;
        const ref = doc(db,'sessionVotes',session.id,'ballots',uid);
        await runTransaction(db,async transaction => { const old = await transaction.get(ref); transaction.set(ref,{voterPlayerId:pid,firstPlayerId:choices[0],secondPlayerId:choices[1],thirdPlayerId:choices[2],submittedAt:old.exists() ? old.data().submittedAt : serverTimestamp(),updatedAt:serverTimestamp()}); }); ballotDirty = false; notify(t('voteSaved'));
      }
    });
  });

  publicStops.push(onSnapshot(collection(db,'playerProfiles'),snap => { profiles = new Map(snap.docs.map(item => [item.id,item.data()])); onProfilesChanged(profiles); if (!$('accountContent')?.contains(document.activeElement)) renderAccount(); },error => notify(errorMessage(error),'error')));
  publicStops.push(onSnapshot(query(collection(db,'sessionVotes'),orderBy('openedAt','desc'),limit(10)),snap => { sessions = snap.docs.map(item => ({...item.data(),id:item.id})); resultLoads.clear(); clearTimeout(expiryTimer); const active = latestOpen(); if (active) expiryTimer = setTimeout(() => { updateCountdown(); renderVoting(); refreshHistory(); }, Math.min(2147483647, votingState(active).remaining + 50)); renderVoting(); renderAdminVoting(); refreshHistory(); },error => notify(errorMessage(error),'error')));
  timer = setInterval(updateCountdown,15000);
  document.addEventListener('visibilitychange',() => { if (!document.hidden) { updateCountdown(); refreshHistory(); } });
  return { onAuth, render, saveMatchEntry, historyMarkup, refreshHistory, getProfile: id => profiles.get(String(id)), dispose() { publicStops.forEach(stop => stop()); ownStops.forEach(stop => stop()); adminStop?.(); ballotStop?.(); clearInterval(timer); clearTimeout(expiryTimer); } };
}

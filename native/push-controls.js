// Native-only preference UI. No tokens, credentials or send APIs are exposed here.
export const PUSH_CONSOLE_URL = 'https://console.firebase.google.com/project/el-futbolistas/notification';
export function notificationRoute(screen) {
  return ['dashboard', 'history', 'leaderboard'].includes(screen) ? `futbolista://app/#${screen}` : null;
}
export function notificationView(state = {}) {
  if (!state.configured) return { label: 'unavailable', action: 'retry' };
  if (state.permission === 'denied') return { label: 'denied', action: 'openSettings' };
  if (!state.enabled) return { label: 'off', action: 'enable' };
  if (state.failed) return { label: 'failed', action: 'enable' };
  return { label: state.ready ? 'on' : 'connecting', action: 'disable' };
}
export function shouldIntroduceNotifications(state = {}) {
  return state?.configured === true && state.permission === 'prompt'
    && state.enabled === false && state.introductionSeen === false;
}

// Read-only status can offer the choice; only an explicit user action can
// request iOS permission. Keep decisions idempotent across status/resume races.
export function createNotificationIntroduction(push, ui) {
  let visible = false, finished = false;
  const close = () => { visible = false; ui.close(); };
  const choose = async enable => {
    if (!visible || finished) return;
    finished = true;
    close();
    ui.setBusy(true);
    try {
      if (enable) await push.enable();
      else await push.dismissIntroduction();
      ui.onState(await push.getStatus(), { enabledRequested: enable });
    } catch { ui.onError(); }
    finally { ui.setBusy(false); }
  };
  return {
    update(state, canPresent = true) {
      if (finished) return;
      if (!shouldIntroduceNotifications(state)) {
        // A settled native decision must not be undone by an older JS view.
        if (state?.enabled || state?.introductionSeen || ['granted','denied'].includes(state?.permission)) {
          finished = true;
          if (visible) close();
        }
        return;
      }
      if (!visible && canPresent) { visible = true; ui.open(() => { void choose(false); }); }
    },
    accept: () => choose(true),
    defer: () => choose(false),
    isFinished: () => finished
  };
}
const labels = {
  ar: {
    introductionTitle: 'إشعارات التمرين', introductionLead: 'تنبيهات فتح التصويت وإعلانات المجموعة، مباشرة على جوالك.',
    introductionNote: 'اختيارية، ولا تحتاج تسجيل دخول. يمكنك إيقافها في أي وقت.', later: 'ليس الآن',
    title: 'إشعارات المجموعة', lead: 'تنبيهات عامة من الإدارة، مثل فتح التصويت. اختياريّة ولا تؤثر على حسابك.',
    consent: 'عند التفعيل، تستخدم Apple وFirebase معرّفًا لهذا الجهاز لإيصال الإشعارات، دون ربطه بملف اللاعب.',
    unavailable: 'الإشعارات غير جاهزة في هذه النسخة.', denied: 'الإشعارات ممنوعة في إعدادات الآيفون.',
    off: 'متوقفة على هذا الجهاز', on: 'مفعّلة على هذا الجهاز', connecting: 'جارٍ الاتصال بخدمة الإشعارات…',
    failed: 'تعذر الاتصال. تحقق من الإنترنت وأعد المحاولة.', enable: 'تفعيل الإشعارات', disable: 'إيقاف الإشعارات',
    openSettings: 'فتح إعدادات الآيفون', retry: 'إعادة المحاولة', busy: 'جارٍ التحديث…',
    send: 'إرسال إشعار للمجموعة', console: 'فتح لوحة الإرسال',
    instructions: 'في Firebase: Messaging ← New campaign ← Notifications. اكتب العنوان والرسالة واختر موضوع futbolista_updates. راجع الرسالة قبل الإرسال. تصل فقط للأجهزة التي فعّلت الإشعارات في النسخة الجديدة.'
  },
  en: {
    introductionTitle: 'Pickup notifications', introductionLead: 'Get voting announcements and group updates on your phone.',
    introductionNote: 'Optional, with no sign-in required. You can turn them off anytime.', later: 'Not now',
    title: 'Group notifications', lead: 'Optional announcements from the admin, such as voting opening. Your account is unaffected.',
    consent: 'Enabling notifications lets Apple and Firebase use a device identifier for delivery, without linking it to your player profile.',
    unavailable: 'Notifications are not configured in this build.', denied: 'Notifications are blocked in iPhone Settings.',
    off: 'Off on this device', on: 'Enabled on this device', connecting: 'Connecting to notifications…',
    failed: 'Could not connect. Check your internet connection and retry.', enable: 'Enable notifications', disable: 'Turn off notifications',
    openSettings: 'Open iPhone Settings', retry: 'Retry', busy: 'Updating…',
    send: 'Send a group notification', console: 'Open sending dashboard',
    instructions: 'In Firebase: Messaging → New campaign → Notifications. Enter the title and message, and select topic futbolista_updates. Review before sending. Only opted-in devices running the new version receive these messages.'
  }
};

export async function installPushControls(push, { onURL, app, notificationIntro }) {
  const cards = [];
  let state, busy = false, error = false;
  for (const selector of ['#screen-account', '#screen-settings']) {
    const host = document.querySelector(selector);
    if (!host) continue;
    const card = document.createElement('article');
    card.className = 'card account-card native-notification-card';
    const title = document.createElement('h2');
    const lead = document.createElement('p'); lead.className = 'subnote';
    const consent = document.createElement('p'); consent.className = 'subnote';
    const status = document.createElement('p'); status.setAttribute('role', 'status');
    const button = document.createElement('button'); button.className = 'btn btn-primary'; button.type = 'button';
    card.append(title, lead, consent, status, button);
    const policy = selector === '#screen-account' ? host.querySelector('.policy-links') : null;
    if (policy) policy.before(card); else host.append(card);
    button.addEventListener('click', async () => {
      if (busy) return;
      const { action } = notificationView(state);
      busy = true; error = false; render();
      try { if (action !== 'retry') await push[action](); state = await push.getStatus(); }
      catch { error = true; }
      finally { busy = false; render(); }
    });
    cards.push({ title, lead, consent, status, button });
  }
  const settings = document.querySelector('#screen-settings');
  const sendCard = document.createElement('article'); sendCard.className = 'card account-card';
  const sendTitle = document.createElement('h2'), instructions = document.createElement('p'), link = document.createElement('a');
  instructions.className = 'subnote'; link.className = 'btn btn-primary';
  link.href = PUSH_CONSOLE_URL; link.target = '_blank'; link.rel = 'noopener noreferrer';
  sendCard.append(sendTitle, instructions, link); settings?.append(sendCard);
  let introduction;
  const intro = document.createElement('div');
  intro.id = 'nativeNotificationIntro'; intro.className = 'modal-backdrop hidden';
  const dialog = document.createElement('section'); dialog.className = 'modal push-introduction';
  dialog.setAttribute('role','dialog'); dialog.setAttribute('aria-modal','true');
  dialog.setAttribute('aria-labelledby','nativeNotificationIntroTitle'); dialog.setAttribute('aria-describedby','nativeNotificationIntroLead');
  const icon = document.createElement('span'); icon.className = 'push-intro-icon'; icon.setAttribute('aria-hidden','true');
  const bell = document.createElementNS('http://www.w3.org/2000/svg','svg'); bell.setAttribute('viewBox','0 0 24 24');
  const path = document.createElementNS('http://www.w3.org/2000/svg','path');
  path.setAttribute('d','M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M9 21h6M12 2V1'); bell.append(path); icon.append(bell);
  const introTitle = document.createElement('h2'); introTitle.id = 'nativeNotificationIntroTitle';
  const introLead = document.createElement('p'); introLead.id = 'nativeNotificationIntroLead'; introLead.className = 'modal-lead';
  const introNote = document.createElement('p'); introNote.className = 'push-intro-note';
  const introActions = document.createElement('div'); introActions.className = 'push-intro-actions';
  const enable = document.createElement('button'), later = document.createElement('button');
  enable.id = 'nativeNotificationEnable'; enable.className = 'btn btn-primary'; enable.type = 'button';
  later.className = 'btn btn-quiet'; later.type = 'button';
  introActions.append(enable,later); dialog.append(icon,introTitle,introLead,introNote,introActions); intro.append(dialog);
  if (notificationIntro) {
    document.body.append(intro);
    introduction = createNotificationIntroduction(push, {
      open: onClose => notificationIntro.present(onClose),
      close: () => notificationIntro.close(),
      setBusy: value => { busy = value; render(); },
      onState: (value, { enabledRequested }) => {
        state = value; error = false; render();
        if (enabledRequested) {
          const text = labels[document.documentElement.lang === 'ar' ? 'ar' : 'en'];
          const view = notificationView(value);
          notificationIntro.feedback?.(text[view.label], value.enabled && !value.failed ? 'success' : 'warning');
        }
      },
      onError: () => {
        error = true; render();
        notificationIntro.feedback?.(labels[document.documentElement.lang === 'ar' ? 'ar' : 'en'].failed, 'error');
      }
    });
    enable.addEventListener('click', () => { void introduction.accept(); });
    later.addEventListener('click', () => { void introduction.defer(); });
    intro.addEventListener('click', event => { if (event.target === intro) void introduction.defer(); });
  }
  function render() {
    const text = labels[document.documentElement.lang === 'ar' ? 'ar' : 'en'];
    const view = notificationView(state);
    for (const card of cards) {
      card.title.textContent = text.title; card.lead.textContent = text.lead; card.consent.textContent = text.consent;
      card.status.textContent = error ? text.failed : text[view.label];
      card.button.textContent = busy ? text.busy : text[view.action]; card.button.disabled = busy;
    }
    sendTitle.textContent = text.send; instructions.textContent = text.instructions; link.textContent = text.console;
    introTitle.textContent = text.introductionTitle; introLead.textContent = text.introductionLead;
    introNote.textContent = text.introductionNote; enable.textContent = text.enable; later.textContent = text.later;
    scheduleIntroduction();
  }
  async function refresh() { try { state = await push.getStatus(); error = false; } catch { error = true; } render(); }
  async function opened() {
    try { const route = notificationRoute((await push.consumeRoute()).screen); if (route) onURL(route); }
    catch { /* Notifications must not block ordinary app navigation. */ }
  }
  let scheduled = false;
  function scheduleIntroduction() {
    if (!introduction) return;
    if (introduction.isFinished()) {
      introObserver?.disconnect(); document.removeEventListener('visibilitychange',scheduleIntroduction);
      return;
    }
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      introduction.update(state, !busy && !document.hidden && notificationIntro.canPresent());
      if (introduction.isFinished()) { introObserver?.disconnect(); document.removeEventListener('visibilitychange',scheduleIntroduction); }
    });
  }
  // A login/reset dialog may already be open. Offer after it closes, without
  // interrupting form entry or obscuring another dialog; stop watching on choice.
  const introObserver = introduction ? new MutationObserver(scheduleIntroduction) : null;
  introObserver?.observe(document.body, {subtree:true,attributes:true,attributeFilter:['class','hidden']});
  if (introduction) document.addEventListener('visibilitychange',scheduleIntroduction);
  await push.addListener('statusChanged', value => { state = value; render(); });
  await push.addListener('notificationOpened', opened);
  await app.addListener('resume', () => { refresh(); opened(); });
  new MutationObserver(render).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  render(); await refresh(); await opened();
}

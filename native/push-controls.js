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
const labels = {
  ar: {
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

export async function installPushControls(push, { onURL, onResume, app }) {
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
  function render() {
    const text = labels[document.documentElement.lang === 'ar' ? 'ar' : 'en'];
    const view = notificationView(state);
    for (const card of cards) {
      card.title.textContent = text.title; card.lead.textContent = text.lead; card.consent.textContent = text.consent;
      card.status.textContent = error ? text.failed : text[view.label];
      card.button.textContent = busy ? text.busy : text[view.action]; card.button.disabled = busy;
    }
    sendTitle.textContent = text.send; instructions.textContent = text.instructions; link.textContent = text.console;
  }
  async function refresh() { try { state = await push.getStatus(); error = false; } catch { error = true; } render(); }
  async function opened() {
    try { const route = notificationRoute((await push.consumeRoute()).screen); if (route) onURL(route); }
    catch { /* Notifications must not block ordinary app navigation. */ }
  }
  await push.addListener('statusChanged', value => { state = value; render(); });
  await push.addListener('notificationOpened', opened);
  await app.addListener('resume', () => { refresh(); opened(); });
  new MutationObserver(render).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  render(); await refresh(); await opened();
}

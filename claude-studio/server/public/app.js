// --- tiny helpers ---
const $ = (id) => document.getElementById(id);
const api = async (path, { method = 'GET', body, auth = true } = {}) => {
  const headers = { 'Content-Type': 'application/json' };
  const token = localStorage.getItem('token');
  if (auth && token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { status: res.status, data });
  return data;
};

let state = { user: null, authMode: 'register' };

// --- view switching ---
function render() {
  const signedIn = Boolean(state.user);
  $('hero').classList.toggle('hidden', signedIn);
  $('app').classList.toggle('hidden', !signedIn);

  const account = $('account');
  if (signedIn) {
    account.innerHTML = `<span style="color:var(--muted);font-size:13px;margin-right:10px">${state.user.email}</span>
      <button class="btn ghost" id="signOutBtn">Sign out</button>`;
    $('signOutBtn').onclick = signOut;
    updateUsage();
  } else {
    account.innerHTML = `<button class="btn ghost" id="signInBtn">Sign in</button>`;
    $('signInBtn').onclick = () => openAuth('login');
  }
}

function timeLeft(iso) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'ended';
  const h = Math.floor(ms / 3600000);
  if (h >= 1) return `${h}h left`;
  return `${Math.max(1, Math.floor(ms / 60000))}m left`;
}

function updateUsage() {
  const u = state.user;
  if (!u) return;
  const upgrade = u.plan !== 'pro' ? ' · <a href="#" id="upgradeLink">Upgrade</a>' : '';
  let text;
  if (u.plan === 'free') {
    text =
      u.trialActive && u.trialEndsAt
        ? `Free trial — <strong>${timeLeft(u.trialEndsAt)}</strong>`
        : `Free trial ended — upgrade to keep creating`;
  } else {
    const left = Math.max(0, u.monthlyLimit - u.usedThisMonth);
    text = `${u.planLabel} plan — <strong>${left}</strong> of ${u.monthlyLimit} messages left this month`;
  }
  $('usage').innerHTML = text + upgrade;
  const link = $('upgradeLink');
  if (link) link.onclick = (e) => { e.preventDefault(); openPlans(); };
}

// --- auth ---
function openAuth(mode) {
  state.authMode = mode;
  $('authError').classList.add('hidden');
  $('authTitle').textContent = mode === 'register' ? 'Create your account' : 'Welcome back';
  $('authSubmit').textContent = mode === 'register' ? 'Create account' : 'Sign in';
  $('switchText').textContent = mode === 'register' ? 'Already have an account?' : 'New here?';
  $('switchLink').textContent = mode === 'register' ? 'Sign in' : 'Create one';
  $('authModal').classList.remove('hidden');
}
const closeAuth = () => $('authModal').classList.add('hidden');

async function submitAuth() {
  const email = $('email').value.trim();
  const password = $('password').value;
  const path = state.authMode === 'register' ? '/api/register' : '/api/login';
  try {
    const { token, user } = await api(path, { method: 'POST', auth: false, body: { email, password } });
    localStorage.setItem('token', token);
    state.user = user;
    closeAuth();
    render();
  } catch (err) {
    const el = $('authError');
    el.textContent = err.message;
    el.classList.remove('hidden');
  }
}

function signOut() {
  localStorage.removeItem('token');
  state.user = null;
  $('chat').innerHTML = '';
  render();
}

// --- chat ---
function addMessage(role, text, files) {
  const el = document.createElement('div');
  el.className = `msg ${role}`;
  el.textContent = text;
  if (files && files.length) {
    const wrap = document.createElement('div');
    wrap.className = 'files';
    for (const f of files) {
      const a = document.createElement('a');
      a.className = 'file-link';
      a.textContent = `📄 ${f.name}`;
      a.href = '#';
      a.onclick = (e) => { e.preventDefault(); downloadFile(f); };
      wrap.appendChild(a);
    }
    el.appendChild(wrap);
  }
  $('chat').appendChild(el);
  $('chat').scrollTop = $('chat').scrollHeight;
  return el;
}

async function downloadFile(f) {
  const token = localStorage.getItem('token');
  const res = await fetch(`/api/files/${f.id}`, { headers: { Authorization: `Bearer ${token}` } });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = f.name;
  a.click();
  URL.revokeObjectURL(url);
}

async function sendMessage(e) {
  e?.preventDefault();
  const input = $('input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  input.style.height = 'auto';
  addMessage('user', text);
  const thinking = addMessage('bot thinking', 'Thinking…');

  try {
    const data = await api('/api/chat', { method: 'POST', body: { message: text } });
    thinking.remove();
    addMessage('bot', data.reply || '(no response)', data.files);
    state.user = data.user;
    updateUsage();
  } catch (err) {
    thinking.remove();
    if (err.status === 402) {
      addMessage('bot', err.message);
      if (err.data?.needsSubscription) openPlans();
    } else {
      addMessage('bot', `⚠️ ${err.message}`);
    }
  }
}

// --- subscribe ---
async function openPlans() {
  const list = $('planList');
  list.innerHTML = '<p>Loading plans…</p>';
  $('subModal').classList.remove('hidden');
  try {
    const { stripeEnabled, plans } = await api('/api/plans', { auth: false });
    if (!stripeEnabled || !plans.length) {
      list.innerHTML = '<p>Subscriptions aren\'t available yet. Please check back soon.</p>';
      return;
    }
    list.innerHTML = '';
    for (const p of plans) {
      const card = document.createElement('button');
      card.className = 'plan-card';
      card.innerHTML =
        `<span class="plan-name">${p.label}</span>` +
        `<span class="plan-price">${p.priceText}</span>` +
        `<span class="plan-blurb">${p.blurb} · ${p.limit} msgs/mo</span>`;
      card.onclick = () => subscribe(p.key);
      list.appendChild(card);
    }
  } catch (err) {
    list.innerHTML = `<p class="error">${err.message}</p>`;
  }
}

async function subscribe(plan) {
  try {
    const { url } = await api('/api/checkout', { method: 'POST', body: { plan } });
    window.location.href = url;
  } catch (err) {
    alert(err.message);
  }
}

// --- wire up ---
$('getStartedBtn').onclick = () => openAuth('register');
$('signInBtn').onclick = () => openAuth('login');
$('authSubmit').onclick = submitAuth;
$('authClose').onclick = closeAuth;
$('switchLink').onclick = (e) => { e.preventDefault(); openAuth(state.authMode === 'register' ? 'login' : 'register'); };
$('composer').addEventListener('submit', sendMessage);
$('subClose').onclick = () => $('subModal').classList.add('hidden');

// Enter to send, Shift+Enter for newline; auto-grow textarea.
$('input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(e); }
});
$('input').addEventListener('input', (e) => {
  e.target.style.height = 'auto';
  e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px';
});

// Returning from a successful Stripe checkout.
if (new URLSearchParams(location.search).get('checkout') === 'success') {
  history.replaceState({}, '', '/');
}

// Restore session if a token exists.
(async () => {
  if (localStorage.getItem('token')) {
    try {
      const { user } = await api('/api/me');
      state.user = user;
    } catch {
      localStorage.removeItem('token');
    }
  }
  render();
})();

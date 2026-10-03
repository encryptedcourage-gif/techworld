// ---- Claude Marketplace — CLIENT site (customers / members) ----
const $ = (sel, root = document) => root.querySelector(sel);
const app = $('#app');
const topActions = $('#topActions');

const state = {
  token: localStorage.getItem('mkt_token') || null,
  user: JSON.parse(localStorage.getItem('mkt_user') || 'null'),
  pollTimer: null,
  lastMsgId: 0,
};

function saveSession(token, user) {
  state.token = token; state.user = user;
  localStorage.setItem('mkt_token', token);
  localStorage.setItem('mkt_user', JSON.stringify(user));
}
function clearSession() {
  state.token = null; state.user = null;
  localStorage.removeItem('mkt_token'); localStorage.removeItem('mkt_user');
}

async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { clearSession(); render(); }
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

const symbol = (c) => ({ USD: '$', EUR: '€', GBP: '£', NGN: '₦' }[c] || `${c} `);
const fmtPrice = (p) => {
  const n = (p.priceCents / 100).toFixed(2).replace(/\.00$/, '');
  return { big: `${symbol(p.currency)}${n}`, per: p.period === 'month' ? '/mo' : ' once' };
};
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const timeStr = (iso) => {
  const d = new Date(String(iso).replace(' ', 'T') + (String(iso).includes('Z') ? '' : 'Z'));
  return isNaN(d) ? '' : d.toLocaleString();
};
const tpl = (id) => $(`#${id}`).content.cloneNode(true);
const stopPolling = () => { if (state.pollTimer) { clearInterval(state.pollTimer); state.pollTimer = null; } };

// Built-in Claude-style sunburst, shown when no custom logo is uploaded.
function defaultLogoEl() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 48 48');
  svg.setAttribute('class', 'brand-logo');
  svg.setAttribute('aria-hidden', 'true');
  const g = document.createElementNS(NS, 'g');
  g.setAttribute('fill', '#d97757');
  for (let i = 0; i < 12; i++) {
    const ray = document.createElementNS(NS, 'path');
    ray.setAttribute('d', 'M24 4 L25.3 24 L22.7 24 Z');
    ray.setAttribute('transform', `rotate(${i * 30} 24 24)`);
    g.appendChild(ray);
  }
  svg.appendChild(g);
  return svg;
}

function setBrand(c) {
  const name = c.businessName || c.siteName || 'Claude Marketplace';
  document.title = name;
  const brand = $('#brand');
  brand.innerHTML = '';
  if (c.logo) {
    const img = document.createElement('img');
    img.src = c.logo; img.alt = ''; img.className = 'brand-logo';
    brand.append(img);
  } else {
    brand.append(defaultLogoEl());
  }
  const span = document.createElement('span');
  span.textContent = name;
  brand.append(span);
}

async function renderTop() {
  try { setBrand(await api('/api/config')); } catch {}
  topActions.innerHTML = '';
  if (state.user) {
    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = state.user.name || state.user.email;
    const out = document.createElement('button');
    out.textContent = 'Sign out';
    out.onclick = () => { stopPolling(); clearSession(); render(); };
    topActions.append(who, out);
  }
}

let showLogin = false;
function render() {
  stopPolling();
  renderTop();
  app.innerHTML = '';
  if (!state.user) return showLogin ? renderLogin() : renderPublic();
  return renderMember();
}

async function renderPublic() {
  app.append(tpl('tpl-public'));
  $('#goSignIn').onclick = () => { showLogin = true; render(); };
  try {
    const { plans } = await api('/api/plans');
    const wrap = $('#publicPlans');
    if (!plans.length) { wrap.innerHTML = '<p class="muted">No plans yet — check back soon.</p>'; return; }
    wrap.innerHTML = '';
    plans.forEach((p) => wrap.append(planCard(p, () => { showLogin = true; render(); }, 'Buy')));
  } catch (e) { $('#publicPlans').innerHTML = `<p class="error">${esc(e.message)}</p>`; }
}

function planCard(p, onBuy, label) {
  const { big, per } = fmtPrice(p);
  const el = document.createElement('div');
  el.className = 'plan';
  el.innerHTML = `
    <div class="name">${esc(p.name)}</div>
    <div class="price">${big}<small>${per}</small></div>
    <div class="desc">${esc(p.description || '')}</div>`;
  const btn = document.createElement('button');
  btn.className = 'primary';
  btn.textContent = label;
  btn.onclick = () => onBuy(p);
  el.append(btn);
  return el;
}

function renderLogin() {
  app.append(tpl('tpl-login'));
  $('#backHome').onclick = () => { showLogin = false; render(); };
  $('#loginForm').onsubmit = async (e) => {
    e.preventDefault();
    $('#loginError').textContent = '';
    try {
      const { token, user } = await api('/api/login', {
        method: 'POST',
        body: { email: $('#loginEmail').value, password: $('#loginPassword').value },
      });
      saveSession(token, user); showLogin = false; render();
    } catch (e) { $('#loginError').textContent = e.message; }
  };
}

async function renderMember() {
  app.append(tpl('tpl-member'));
  try {
    const { plans } = await api('/api/plans');
    const wrap = $('#memberPlans');
    wrap.innerHTML = plans.length ? '' : '<p class="muted">No plans available right now.</p>';
    plans.forEach((p) => wrap.append(planCard(p, buyPlan, 'Buy')));
  } catch (e) { $('#memberPlans').innerHTML = `<p class="error">${esc(e.message)}</p>`; }

  $('#memberComposer').onsubmit = async (e) => {
    e.preventDefault();
    const input = $('#memberInput');
    const body = input.value.trim();
    if (!body) return;
    input.value = '';
    try { await api('/api/conversation/messages', { method: 'POST', body: { body } }); await loadChat(); }
    catch (err) { input.value = body; alert(err.message); }
  };

  state.lastMsgId = 0;
  await loadChat(true);
  state.pollTimer = setInterval(() => loadChat(), 3500);
}

async function buyPlan(p) {
  try { await api('/api/buy', { method: 'POST', body: { planId: p.id } }); await loadChat(); $('#memberInput').focus(); }
  catch (e) { alert(e.message); }
}

async function loadChat(initial = false) {
  try {
    const data = await api(`/api/conversation${state.lastMsgId ? `?since=${state.lastMsgId}` : ''}`);
    const chat = $('#memberChat');
    if (!chat) return;
    if (initial || state.lastMsgId === 0) chat.innerHTML = '';
    if (!chat.children.length && !data.messages.length) {
      chat.innerHTML = '<p class="empty">No messages yet. Click Buy on a plan, or say hello!</p>';
    }
    appendBubbles(chat, data.messages, 'member');
    if (data.messages.length) state.lastMsgId = data.messages[data.messages.length - 1].id;
    updateBadge($('#memberBadge'), data.unread);
  } catch {}
}

function appendBubbles(chat, messages, myRole) {
  const emptyEl = chat.querySelector('.empty');
  if (messages.length && emptyEl) emptyEl.remove();
  const nearBottom = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 80;
  messages.forEach((m) => {
    const b = document.createElement('div');
    if (m.role === 'system') b.className = 'bubble system';
    else b.className = 'bubble ' + (m.role === myRole ? 'mine' : 'theirs');
    b.innerHTML = `${esc(m.body)}<span class="meta">${m.role === 'system' ? '' : m.role} · ${timeStr(m.createdAt)}</span>`;
    chat.append(b);
  });
  if (nearBottom) chat.scrollTop = chat.scrollHeight;
}

function updateBadge(el, n) {
  if (!el) return;
  if (n > 0) { el.textContent = n; el.hidden = false; } else el.hidden = true;
}

render();

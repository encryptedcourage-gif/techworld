// ---- Claude Marketplace front-end (vanilla JS) ----
const $ = (sel, root = document) => root.querySelector(sel);
const app = $('#app');
const topActions = $('#topActions');

const state = {
  token: localStorage.getItem('mkt_token') || null,
  user: JSON.parse(localStorage.getItem('mkt_user') || 'null'),
  pollTimer: null,
  lastMsgId: 0,         // member chat
  adminConvId: null,    // selected conversation
  adminLastMsgId: 0,
};

function saveSession(token, user) {
  state.token = token;
  state.user = user;
  localStorage.setItem('mkt_token', token);
  localStorage.setItem('mkt_user', JSON.stringify(user));
}
function clearSession() {
  state.token = null;
  state.user = null;
  localStorage.removeItem('mkt_token');
  localStorage.removeItem('mkt_user');
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

const fmtPrice = (p) => {
  const n = (p.priceCents / 100).toFixed(2).replace(/\.00$/, '');
  const per = p.period === 'month' ? '/mo' : ' once';
  return { big: `${symbol(p.currency)}${n}`, per };
};
const symbol = (c) => ({ USD: '$', EUR: '€', GBP: '£', NGN: '₦' }[c] || `${c} `);
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const timeStr = (iso) => {
  const d = new Date(String(iso).replace(' ', 'T') + (String(iso).includes('Z') ? '' : 'Z'));
  return isNaN(d) ? '' : d.toLocaleString();
};

function tpl(id) { return $(`#${id}`).content.cloneNode(true); }
function stopPolling() { if (state.pollTimer) { clearInterval(state.pollTimer); state.pollTimer = null; } }

// ---------------- Top bar ----------------
async function renderTop() {
  try { const c = await api('/api/config'); $('#brand').textContent = c.siteName; document.title = c.siteName; } catch {}
  topActions.innerHTML = '';
  if (state.user) {
    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = `${state.user.name || state.user.email} · ${state.user.role}`;
    const out = document.createElement('button');
    out.textContent = 'Sign out';
    out.onclick = () => { stopPolling(); clearSession(); render(); };
    topActions.append(who, out);
  }
}

// ---------------- Router ----------------
let showLogin = false;
function render() {
  stopPolling();
  renderTop();
  app.innerHTML = '';
  if (!state.user) return showLogin ? renderLogin() : renderPublic();
  if (state.user.role === 'admin') return renderAdmin();
  return renderMember();
}

// ---------------- Public landing ----------------
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

// ---------------- Login ----------------
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
      saveSession(token, user);
      showLogin = false;
      render();
    } catch (e) { $('#loginError').textContent = e.message; }
  };
}

// ---------------- Member ----------------
async function renderMember() {
  app.append(tpl('tpl-member'));
  // Plans with Buy -> posts a message and jumps into chat
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
    try {
      await api('/api/conversation/messages', { method: 'POST', body: { body } });
      await loadMemberChat();
    } catch (err) { input.value = body; alert(err.message); }
  };

  state.lastMsgId = 0;
  await loadMemberChat(true);
  state.pollTimer = setInterval(() => loadMemberChat(), 3500);
}

async function buyPlan(p) {
  try {
    await api('/api/buy', { method: 'POST', body: { planId: p.id } });
    await loadMemberChat();
    $('#memberInput').focus();
  } catch (e) { alert(e.message); }
}

async function loadMemberChat(initial = false) {
  try {
    const data = await api(`/api/conversation${state.lastMsgId ? `?since=${state.lastMsgId}` : ''}`);
    const chat = $('#memberChat');
    if (!chat) return; // view changed
    if (initial || state.lastMsgId === 0) chat.innerHTML = '';
    if (!chat.children.length && !data.messages.length) {
      chat.innerHTML = '<p class="empty">No messages yet. Click Buy on a plan, or say hello!</p>';
    }
    appendBubbles(chat, data.messages, 'member');
    if (data.messages.length) state.lastMsgId = data.messages[data.messages.length - 1].id;
    updateBadge($('#memberBadge'), data.unread);
  } catch {}
}

// ---------------- Admin ----------------
function renderAdmin() {
  app.append(tpl('tpl-admin'));
  // tab switching
  app.querySelectorAll('.tab').forEach((t) => {
    t.onclick = () => {
      app.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'));
      t.classList.add('active');
      const tab = t.dataset.tab;
      app.querySelectorAll('.tab-page').forEach((pg) => (pg.hidden = pg.dataset.page !== tab));
      if (tab === 'plans') loadAdminPlans();
      if (tab === 'members') loadMembers();
      if (tab === 'inbox') loadConversations();
    };
  });

  // Plan form
  $('#planForm').onsubmit = submitPlan;
  $('#planReset').onclick = resetPlanForm;
  // Member form
  $('#memberForm').onsubmit = submitMember;
  // Admin composer
  $('#adminComposer').onsubmit = async (e) => {
    e.preventDefault();
    const input = $('#adminInput');
    const body = input.value.trim();
    if (!body || !state.adminConvId) return;
    input.value = '';
    try {
      await api(`/api/admin/conversations/${state.adminConvId}/messages`, { method: 'POST', body: { body } });
      await loadAdminChat();
    } catch (err) { input.value = body; alert(err.message); }
  };

  loadConversations();
  state.pollTimer = setInterval(() => {
    const inboxVisible = !app.querySelector('[data-page="inbox"]').hidden;
    if (inboxVisible) { loadConversations(true); if (state.adminConvId) loadAdminChat(); }
  }, 3500);
}

// --- Admin: inbox ---
async function loadConversations(quiet = false) {
  try {
    const { conversations, totalUnread } = await api('/api/admin/conversations');
    updateBadge($('#inboxBadge'), totalUnread);
    const list = $('#convList');
    if (!list) return;
    if (!conversations.length) { list.innerHTML = '<p class="muted small">No conversations yet.</p>'; return; }
    list.innerHTML = '';
    conversations.forEach((c) => {
      const item = document.createElement('div');
      item.className = 'conv-item' + (c.id === state.adminConvId ? ' active' : '');
      item.innerHTML = `
        <div class="ci-top">
          <span class="ci-name">${esc(c.memberName || c.memberEmail)}</span>
          ${c.unread ? `<span class="badge">${c.unread}</span>` : ''}
        </div>
        <div class="ci-last">${esc(c.lastBody || 'No messages yet')}</div>`;
      item.onclick = () => openConversation(c.id, c.memberName || c.memberEmail);
      list.append(item);
    });
  } catch (e) { if (!quiet) $('#convList').innerHTML = `<p class="error">${esc(e.message)}</p>`; }
}

async function openConversation(id, title) {
  state.adminConvId = id;
  state.adminLastMsgId = 0;
  $('#convTitle').textContent = title;
  $('#adminComposer').hidden = false;
  app.querySelectorAll('.conv-item').forEach((x) => x.classList.remove('active'));
  await loadAdminChat(true);
  loadConversations(true);
}

async function loadAdminChat(initial = false) {
  if (!state.adminConvId) return;
  try {
    const q = state.adminLastMsgId ? `?since=${state.adminLastMsgId}` : '';
    const { messages } = await api(`/api/admin/conversations/${state.adminConvId}/messages${q}`);
    const chat = $('#adminChat');
    if (!chat) return;
    if (initial || state.adminLastMsgId === 0) chat.innerHTML = '';
    if (!chat.children.length && !messages.length) chat.innerHTML = '<p class="empty">No messages yet.</p>';
    appendBubbles(chat, messages, 'admin');
    if (messages.length) state.adminLastMsgId = messages[messages.length - 1].id;
  } catch {}
}

// --- Admin: plans ---
async function loadAdminPlans() {
  try {
    const { plans } = await api('/api/admin/plans');
    const wrap = $('#adminPlans');
    wrap.innerHTML = plans.length ? '' : '<p class="muted small">No plans yet. Add one above.</p>';
    plans.forEach((p) => {
      const { big, per } = fmtPrice(p);
      const row = document.createElement('div');
      row.className = 'list-row';
      row.innerHTML = `
        <div class="info">
          <div class="t">${esc(p.name)} <span class="pill ${p.active ? '' : 'off'}">${p.active ? 'active' : 'hidden'}</span></div>
          <div class="s">${big}${per} · ${esc(p.description || 'No description')}</div>
        </div>`;
      const actions = document.createElement('div');
      actions.className = 'actions';
      const edit = document.createElement('button'); edit.textContent = 'Edit'; edit.onclick = () => fillPlanForm(p);
      const toggle = document.createElement('button'); toggle.textContent = p.active ? 'Hide' : 'Show';
      toggle.onclick = async () => { await api(`/api/admin/plans/${p.id}`, { method: 'PUT', body: { active: !p.active } }); loadAdminPlans(); };
      const del = document.createElement('button'); del.className = 'danger'; del.textContent = 'Delete';
      del.onclick = async () => { if (confirm(`Delete "${p.name}"?`)) { await api(`/api/admin/plans/${p.id}`, { method: 'DELETE' }); loadAdminPlans(); } };
      actions.append(edit, toggle, del);
      row.append(actions);
      wrap.append(row);
    });
  } catch (e) { $('#adminPlans').innerHTML = `<p class="error">${esc(e.message)}</p>`; }
}

function fillPlanForm(p) {
  $('#planId').value = p.id;
  $('#planName').value = p.name;
  $('#planPrice').value = (p.priceCents / 100).toString();
  $('#planCurrency').value = p.currency;
  $('#planPeriod').value = p.period;
  $('#planDesc').value = p.description || '';
  $('#planSubmit').textContent = 'Save changes';
  $('#planReset').hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function resetPlanForm() {
  $('#planForm').reset();
  $('#planId').value = '';
  $('#planCurrency').value = 'USD';
  $('#planSubmit').textContent = 'Add plan';
  $('#planReset').hidden = true;
  $('#planError').textContent = '';
}
async function submitPlan(e) {
  e.preventDefault();
  $('#planError').textContent = '';
  const id = $('#planId').value;
  const body = {
    name: $('#planName').value.trim(),
    priceCents: Math.round(parseFloat($('#planPrice').value || '0') * 100),
    currency: ($('#planCurrency').value || 'USD').toUpperCase(),
    period: $('#planPeriod').value,
    description: $('#planDesc').value.trim(),
  };
  try {
    if (id) await api(`/api/admin/plans/${id}`, { method: 'PUT', body });
    else await api('/api/admin/plans', { method: 'POST', body });
    resetPlanForm();
    loadAdminPlans();
  } catch (err) { $('#planError').textContent = err.message; }
}

// --- Admin: members ---
async function loadMembers() {
  try {
    const { members } = await api('/api/admin/members');
    const wrap = $('#memberList');
    wrap.innerHTML = members.length ? '' : '<p class="muted small">No members yet. Create one above.</p>';
    members.forEach((m) => {
      const row = document.createElement('div');
      row.className = 'list-row';
      row.innerHTML = `<div class="info"><div class="t">${esc(m.name || '—')}</div><div class="s">${esc(m.email)}</div></div>`;
      const actions = document.createElement('div');
      actions.className = 'actions';
      const pw = document.createElement('button'); pw.textContent = 'Reset password';
      pw.onclick = async () => {
        const np = prompt(`New password for ${m.email} (min 6 chars):`);
        if (np == null) return;
        try { await api(`/api/admin/members/${m.id}/password`, { method: 'POST', body: { password: np } }); alert('Password updated.'); }
        catch (e) { alert(e.message); }
      };
      const del = document.createElement('button'); del.className = 'danger'; del.textContent = 'Delete';
      del.onclick = async () => { if (confirm(`Delete ${m.email} and their chat?`)) { await api(`/api/admin/members/${m.id}`, { method: 'DELETE' }); loadMembers(); } };
      actions.append(pw, del);
      row.append(actions);
      wrap.append(row);
    });
  } catch (e) { $('#memberList').innerHTML = `<p class="error">${esc(e.message)}</p>`; }
}
async function submitMember(e) {
  e.preventDefault();
  $('#memberError').textContent = '';
  try {
    await api('/api/admin/members', {
      method: 'POST',
      body: { name: $('#newName').value.trim(), email: $('#newEmail').value.trim(), password: $('#newPassword').value },
    });
    $('#memberForm').reset();
    loadMembers();
  } catch (err) { $('#memberError').textContent = err.message; }
}

// ---------------- shared chat rendering ----------------
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
  if (n > 0) { el.textContent = n; el.hidden = false; } else { el.hidden = true; }
}

render();

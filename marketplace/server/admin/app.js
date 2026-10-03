// ---- Claude Marketplace — ADMIN site (control panel) ----
const $ = (sel, root = document) => root.querySelector(sel);
const app = $('#app');
const topActions = $('#topActions');

const state = {
  token: localStorage.getItem('mkt_admin_token') || null,
  user: JSON.parse(localStorage.getItem('mkt_admin_user') || 'null'),
  pollTimer: null,
  convId: null,
  convMemberId: null,
  convMemberLabel: '',
  lastMsgId: 0,
};

function saveSession(token, user) {
  state.token = token; state.user = user;
  localStorage.setItem('mkt_admin_token', token);
  localStorage.setItem('mkt_admin_user', JSON.stringify(user));
}
function clearSession() {
  state.token = null; state.user = null;
  localStorage.removeItem('mkt_admin_token'); localStorage.removeItem('mkt_admin_user');
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
  document.title = 'Admin · ' + name;
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
  span.textContent = 'Admin · ' + name;
  brand.append(span);
}

async function renderTop() {
  try { setBrand(await api('/api/config')); } catch {}
  topActions.innerHTML = '';
  if (state.user) {
    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = `${state.user.name || state.user.email} · admin`;
    const out = document.createElement('button');
    out.textContent = 'Sign out';
    out.onclick = () => { stopPolling(); clearSession(); render(); };
    topActions.append(who, out);
  }
}

function render() {
  stopPolling();
  renderTop();
  app.innerHTML = '';
  if (!state.user) return renderLogin();
  return renderAdmin();
}

function renderLogin() {
  app.append(tpl('tpl-login'));
  $('#loginForm').onsubmit = async (e) => {
    e.preventDefault();
    $('#loginError').textContent = '';
    try {
      const { token, user } = await api('/api/login', {
        method: 'POST',
        body: { email: $('#loginEmail').value, password: $('#loginPassword').value },
      });
      saveSession(token, user); render();
    } catch (e) { $('#loginError').textContent = e.message; }
  };
}

function renderAdmin() {
  app.append(tpl('tpl-admin'));
  app.querySelectorAll('.tab').forEach((t) => {
    t.onclick = () => {
      app.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'));
      t.classList.add('active');
      const tab = t.dataset.tab;
      app.querySelectorAll('.tab-page').forEach((pg) => (pg.hidden = pg.dataset.page !== tab));
      if (tab === 'plans') loadAdminPlans();
      if (tab === 'members') loadMembers();
      if (tab === 'inbox') loadConversations();
      if (tab === 'settings') loadSettings();
    };
  });

  $('#planForm').onsubmit = submitPlan;
  $('#planReset').onclick = resetPlanForm;
  $('#memberForm').onsubmit = submitMember;
  $('#adminComposer').onsubmit = async (e) => {
    e.preventDefault();
    const input = $('#adminInput');
    const body = input.value.trim();
    if (!body || !state.convId) return;
    input.value = '';
    try { await api(`/api/admin/conversations/${state.convId}/messages`, { method: 'POST', body: { body } }); await loadChat(); }
    catch (err) { input.value = body; alert(err.message); }
  };

  $('#clearAllChats').onclick = clearAllChats;
  $('#clearChat').onclick = clearChat;
  $('#closeAccount').onclick = closeAccount;

  $('#settingsForm').onsubmit = submitSettings;
  $('#logoFile').onchange = onLogoFile;
  $('#logoRemove').onclick = onLogoRemove;

  loadConversations();
  state.pollTimer = setInterval(() => {
    if (!app.querySelector('[data-page="inbox"]').hidden) { loadConversations(true); if (state.convId) loadChat(); }
  }, 3500);
}

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
      item.className = 'conv-item' + (c.id === state.convId ? ' active' : '');
      item.innerHTML = `
        <div class="ci-top">
          <span class="ci-name">${esc(c.memberName || c.memberEmail)}</span>
          ${c.unread ? `<span class="badge">${c.unread}</span>` : ''}
        </div>
        <div class="ci-last">${esc(c.lastBody || 'No messages yet')}</div>`;
      item.onclick = () => openConversation(c);
      list.append(item);
    });
  } catch (e) { if (!quiet) $('#convList').innerHTML = `<p class="error">${esc(e.message)}</p>`; }
}

async function openConversation(c) {
  state.convId = c.id;
  state.convMemberId = c.memberId;
  state.convMemberLabel = c.memberName || c.memberEmail;
  state.lastMsgId = 0;
  $('#convTitle').textContent = state.convMemberLabel;
  $('#chatHeadActions').hidden = false;
  $('#convHint').hidden = false;
  $('#adminComposer').hidden = false;
  await loadChat(true);
  loadConversations(true);
}

function resetConversationView(emptyText) {
  state.convId = null;
  state.convMemberId = null;
  state.convMemberLabel = '';
  state.lastMsgId = 0;
  $('#convTitle').textContent = 'Select a conversation';
  $('#chatHeadActions').hidden = true;
  $('#convHint').hidden = true;
  $('#adminComposer').hidden = true;
  $('#adminChat').innerHTML = `<p class="empty">${esc(emptyText || 'Select a conversation')}</p>`;
}

async function deleteMessage(id) {
  try {
    await api(`/api/admin/messages/${id}`, { method: 'DELETE' });
    state.lastMsgId = 0;        // force a clean refresh
    await loadChat(true);
    loadConversations(true);
  } catch (e) { alert(e.message); }
}

async function clearChat() {
  if (!state.convId) return;
  if (!confirm(`Delete ALL messages in the chat with ${state.convMemberLabel}? This cannot be undone. The account stays.`)) return;
  try {
    await api(`/api/admin/conversations/${state.convId}/messages`, { method: 'DELETE' });
    state.lastMsgId = 0;
    await loadChat(true);
    loadConversations(true);
  } catch (e) { alert(e.message); }
}

async function clearAllChats() {
  if (!confirm('Delete EVERY message in EVERY conversation? Member accounts stay. This cannot be undone.')) return;
  try {
    await api('/api/admin/chats', { method: 'DELETE' });
    state.lastMsgId = 0;
    if (state.convId) await loadChat(true);
    loadConversations(true);
  } catch (e) { alert(e.message); }
}

async function closeAccount() {
  if (!state.convMemberId) return;
  if (!confirm(`Close the account for ${state.convMemberLabel}? Their login AND chat are permanently deleted. Use this for accounts that don't belong.`)) return;
  try {
    await api(`/api/admin/members/${state.convMemberId}`, { method: 'DELETE' });
    resetConversationView('Account closed.');
    loadConversations(true);
  } catch (e) { alert(e.message); }
}

async function loadChat(initial = false) {
  if (!state.convId) return;
  try {
    const q = state.lastMsgId ? `?since=${state.lastMsgId}` : '';
    const { messages } = await api(`/api/admin/conversations/${state.convId}/messages${q}`);
    const chat = $('#adminChat');
    if (!chat) return;
    if (initial || state.lastMsgId === 0) chat.innerHTML = '';
    if (!chat.children.length && !messages.length) chat.innerHTML = '<p class="empty">No messages yet.</p>';
    appendBubbles(chat, messages, 'admin');
    if (messages.length) state.lastMsgId = messages[messages.length - 1].id;
  } catch {}
}

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

// --- Admin: branding + auto-welcome settings ---
// pendingLogo: undefined = unchanged, '' = remove, data-URL string = new upload.
let pendingLogo;

async function loadSettings() {
  $('#settingsError').textContent = '';
  $('#settingsSaved').hidden = true;
  pendingLogo = undefined;
  try {
    const s = await api('/api/admin/settings');
    $('#bizName').value = s.businessName || '';
    $('#welcomeMsg').value = s.welcomeMessage || '';
    if (s.logo) { $('#logoImg').src = s.logo; $('#logoPreview').hidden = false; }
    else { $('#logoPreview').hidden = true; $('#logoImg').removeAttribute('src'); }
  } catch (e) { $('#settingsError').textContent = e.message; }
}

function onLogoFile(e) {
  const f = e.target.files[0];
  if (!f) return;
  if (f.size > 1_500_000) { $('#settingsError').textContent = 'Logo is too big — pick an image under ~1.5 MB.'; e.target.value = ''; return; }
  const reader = new FileReader();
  reader.onload = () => {
    pendingLogo = reader.result;
    $('#logoImg').src = reader.result;
    $('#logoPreview').hidden = false;
    $('#settingsError').textContent = '';
  };
  reader.readAsDataURL(f);
}

function onLogoRemove() {
  pendingLogo = '';
  $('#logoPreview').hidden = true;
  $('#logoImg').removeAttribute('src');
  $('#logoFile').value = '';
}

async function submitSettings(e) {
  e.preventDefault();
  $('#settingsError').textContent = '';
  $('#settingsSaved').hidden = true;
  const body = { businessName: $('#bizName').value, welcomeMessage: $('#welcomeMsg').value };
  if (pendingLogo !== undefined) body.logo = pendingLogo;
  try {
    await api('/api/admin/settings', { method: 'POST', body });
    pendingLogo = undefined;
    $('#settingsSaved').hidden = false;
    renderTop(); // refresh the logo/name in the top bar right away
  } catch (err) { $('#settingsError').textContent = err.message; }
}

function appendBubbles(chat, messages, myRole) {
  const emptyEl = chat.querySelector('.empty');
  if (messages.length && emptyEl) emptyEl.remove();
  const nearBottom = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 80;
  messages.forEach((m) => {
    const b = document.createElement('div');
    if (m.role === 'system') b.className = 'bubble system';
    else b.className = 'bubble ' + (m.role === myRole ? 'mine' : 'theirs');
    b.dataset.id = m.id;
    b.innerHTML = `${esc(m.body)}<span class="meta">${m.role === 'system' ? '' : m.role} · ${timeStr(m.createdAt)}</span>`;
    const del = document.createElement('button');
    del.className = 'msg-del';
    del.title = 'Delete this message';
    del.textContent = '✕';
    del.onclick = () => deleteMessage(m.id);
    b.append(del);
    chat.append(b);
  });
  if (nearBottom) chat.scrollTop = chat.scrollHeight;
}

function updateBadge(el, n) {
  if (!el) return;
  if (n > 0) { el.textContent = n; el.hidden = false; } else el.hidden = true;
}

render();

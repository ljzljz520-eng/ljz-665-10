/* 演播室器材档案 - 前端逻辑 */
const $ = (s) => document.querySelector(s);
const state = {
  token: localStorage.getItem('token') || '',
  user: null,
  meta: { categories: [], statuses: [] },
  list: [],
  stats: {},
  filter: { category: '', status: '', q: '' },
  uploadTarget: null, // 当前上传附件的器材 id
};

/* ---------- 工具 ---------- */
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function fmtSize(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(1) + ' MB';
}
function fmtTime(t) { return t ? t.replace('T', ' ').slice(0, 16) : '-'; }
let toastTimer;
function toast(msg, type = 'ok') {
  const el = $('#toast');
  el.textContent = msg;
  el.className = 'toast ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 2600);
}
function can(perm) { return state.user && state.user.perms.includes(perm); }

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { ...(opts.body && !(opts.body instanceof Blob) ? { 'Content-Type': 'application/json' } : {}),
               Authorization: 'Bearer ' + state.token, ...(opts.headers || {}) },
  });
  if (res.status === 401) { doLogout(true); throw new Error('登录已过期，请重新登录'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '请求失败 (' + res.status + ')');
  return data;
}

/* ---------- 登录 / 登出 ---------- */
async function doLogin(username, password) {
  const res = await fetch('/api/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '登录失败');
  state.token = data.token;
  state.user = data.user;
  localStorage.setItem('token', data.token);
  await enterApp();
}
async function doLogout(expired) {
  if (state.token && !expired) { try { await api('/api/logout', { method: 'POST' }); } catch (e) {} }
  state.token = ''; state.user = null;
  localStorage.removeItem('token');
  $('#appView').classList.add('hidden');
  $('#loginView').classList.remove('hidden');
  if (expired) toast('登录已过期，请重新登录', 'err');
}

/* ---------- 进入平台 ---------- */
async function enterApp() {
  const meta = await api('/api/meta');
  state.meta = meta;
  $('#loginView').classList.add('hidden');
  $('#appView').classList.remove('hidden');
  renderUser();
  renderFilters();
  await loadList();
  switchPage('archive');
}
function renderUser() {
  const u = state.user;
  $('#userBadge').innerHTML = `${esc(u.name)} · <b>${esc(u.roleName)}</b>`;
  const desc = {
    admin: '当前角色可查看、新增、编辑、删除器材并管理附件。',
    keeper: '当前角色可查看、新增、编辑器材并管理附件，不可删除。',
    viewer: '当前角色为只读权限，可查看档案并下载附件。',
  }[u.role];
  $('#roleHint').textContent = `当前登录：${u.name}（${u.roleName}）—— ${desc}`;
  $('#addBtn').classList.toggle('hidden', !can('create'));
}

/* ---------- 菜单切换 ---------- */
function switchPage(page) {
  document.querySelectorAll('.menu-item').forEach((m) => m.classList.toggle('active', m.dataset.page === page));
  document.querySelectorAll('.page').forEach((p) => p.classList.add('hidden'));
  $('#page-' + page).classList.remove('hidden');
  if (page === 'home') renderHome();
}
function renderHome() {
  const total = Object.values(state.stats).reduce((a, b) => a + b, 0);
  const cards = [{ lbl: '器材总数', num: total },
    ...state.meta.categories.map((c) => ({ lbl: c, num: state.stats[c] || 0 }))];
  $('#homeCards').innerHTML = cards.map((c) =>
    `<div class="stat-card"><div class="num">${c.num}</div><div class="lbl">${esc(c.lbl)}</div></div>`).join('');
}

/* ---------- 筛选与列表 ---------- */
function renderFilters() {
  const tabs = [{ v: '', l: '全部' }, ...state.meta.categories.map((c) => ({ v: c, l: c }))];
  $('#catTabs').innerHTML = tabs.map((t) =>
    `<div class="tab ${state.filter.category === t.v ? 'active' : ''}" data-cat="${esc(t.v)}">${esc(t.l)}<span class="cnt">${t.v ? (state.stats[t.v] || 0) : ''}</span></div>`).join('');
  $('#statusFilter').innerHTML = '<option value="">全部状态</option>' +
    state.meta.statuses.map((s) => `<option ${state.filter.status === s ? 'selected' : ''}>${esc(s)}</option>`).join('');
  $('#fCategory').innerHTML = state.meta.categories.map((c) => `<option>${esc(c)}</option>`).join('');
  $('#fStatus').innerHTML = state.meta.statuses.map((s) => `<option>${esc(s)}</option>`).join('');
}
async function loadList() {
  const p = new URLSearchParams();
  if (state.filter.category) p.set('category', state.filter.category);
  if (state.filter.status) p.set('status', state.filter.status);
  if (state.filter.q) p.set('q', state.filter.q);
  const data = await api('/api/equipment?' + p);
  state.list = data.list;
  state.stats = data.stats;
  renderFilters();
  renderTable();
}
function renderTable() {
  const tb = $('#equipTbody');
  $('#emptyTip').classList.toggle('hidden', state.list.length > 0);
  tb.innerHTML = state.list.map((e) => {
    const attCount = e.attachments.length;
    const actions = [
      `<button class="btn btn-sm" data-act="detail" data-id="${e.id}">详情/附件</button>`,
      can('update') ? `<button class="btn btn-sm" data-act="edit" data-id="${e.id}">编辑</button>` : '',
      can('delete') ? `<button class="btn btn-sm btn-danger" data-act="del" data-id="${e.id}">删除</button>` : '',
    ].join('');
    return `<tr>
      <td class="code">${esc(e.code)}</td>
      <td>${esc(e.name)}</td>
      <td>${esc(e.category)}</td>
      <td>${esc(e.location)}</td>
      <td><span class="badge ${esc(e.status)}">${esc(e.status)}</span></td>
      <td>${esc(e.owner)}</td>
      <td>${attCount ? `<span class="att-chip" data-act="detail" data-id="${e.id}">📎 ${attCount} 个</span>` : '<span class="muted">无</span>'}</td>
      <td><div class="row-actions">${actions}</div></td>
    </tr>`;
  }).join('');
}

/* ---------- 新增 / 编辑 ---------- */
function openForm(item) {
  $('#formTitle').textContent = item ? '编辑器材' : '新增器材';
  $('#fId').value = item ? item.id : '';
  $('#fCode').value = item ? item.code : '';
  $('#fName').value = item ? item.name : '';
  $('#fCategory').value = item ? item.category : state.meta.categories[0];
  $('#fStatus').value = item ? item.status : state.meta.statuses[0];
  $('#fLocation').value = item ? item.location : '';
  $('#fOwner').value = item ? item.owner : '';
  $('#fNote').value = item ? item.note : '';
  $('#formModal').classList.remove('hidden');
}
async function submitForm(ev) {
  ev.preventDefault();
  const id = $('#fId').value;
  const payload = {
    code: $('#fCode').value.trim(), name: $('#fName').value.trim(),
    category: $('#fCategory').value, status: $('#fStatus').value,
    location: $('#fLocation').value.trim(), owner: $('#fOwner').value.trim(),
    note: $('#fNote').value.trim(),
  };
  try {
    if (id) {
      await api('/api/equipment/' + id, { method: 'PUT', body: JSON.stringify(payload) });
      toast('器材已更新');
    } else {
      await api('/api/equipment', { method: 'POST', body: JSON.stringify(payload) });
      toast('器材已新增');
    }
    $('#formModal').classList.add('hidden');
    await loadList();
  } catch (err) { toast(err.message, 'err'); }
}

/* ---------- 删除 ---------- */
async function delItem(id) {
  const item = state.list.find((e) => e.id === id);
  if (!confirm(`确定删除器材「${item.code} ${item.name}」吗？其附件将一并删除。`)) return;
  try {
    await api('/api/equipment/' + id, { method: 'DELETE' });
    toast('器材已删除');
    await loadList();
  } catch (err) { toast(err.message, 'err'); }
}

/* ---------- 详情与附件 ---------- */
function openDetail(item) {
  const canAttach = can('attach');
  $('#detailBody').innerHTML = `
    <dl class="detail-grid">
      <dt>器材编号</dt><dd class="code">${esc(item.code)}</dd>
      <dt>器材名称</dt><dd>${esc(item.name)}</dd>
      <dt>分类</dt><dd>${esc(item.category)}</dd>
      <dt>存放位置</dt><dd>${esc(item.location)}</dd>
      <dt>借用状态</dt><dd><span class="badge ${esc(item.status)}">${esc(item.status)}</span></dd>
      <dt>责任人</dt><dd>${esc(item.owner)}</dd>
      <dt>备注</dt><dd>${esc(item.note) || '<span class="muted">无</span>'}</dd>
      <dt>最近更新</dt><dd>${fmtTime(item.updatedAt)}</dd>
    </dl>
    <div class="att-head">
      <h4>附件（${item.attachments.length}）</h4>
      ${canAttach ? `<button class="btn btn-sm btn-primary" id="uploadBtn">📎 上传附件</button>` : ''}
    </div>
    <div class="att-list">
      ${item.attachments.length ? item.attachments.map((a) => `
        <div class="att-item">
          <span>📄</span>
          <span class="att-name" title="${esc(a.name)}">${esc(a.name)}</span>
          <span class="att-meta">${fmtSize(a.size)} · ${esc(a.uploadedBy)} · ${fmtTime(a.uploadedAt)}</span>
          <button class="btn btn-sm" data-att-dl="${a.id}">下载</button>
          ${canAttach ? `<button class="btn btn-sm btn-danger" data-att-del="${a.id}">删除</button>` : ''}
        </div>`).join('')
      : '<div class="att-empty">暂无附件' + (canAttach ? '，可点击右上角上传' : '') + '</div>'}
    </div>`;
  $('#detailModal').classList.remove('hidden');

  const upBtn = $('#uploadBtn');
  if (upBtn) upBtn.onclick = () => { state.uploadTarget = item.id; $('#fileInput').click(); };
  $('#detailBody').querySelectorAll('[data-att-dl]').forEach((b) =>
    (b.onclick = () => downloadAttachment(item.id, b.dataset.attDl)));
  $('#detailBody').querySelectorAll('[data-att-del]').forEach((b) =>
    (b.onclick = () => delAttachment(item.id, b.dataset.attDel)));
}
async function downloadAttachment(equipId, attId) {
  try {
    const res = await fetch(`/api/equipment/${equipId}/attachments/${attId}`,
      { headers: { Authorization: 'Bearer ' + state.token } });
    if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || '下载失败'); }
    const blob = await res.blob();
    const cd = res.headers.get('Content-Disposition') || '';
    const m = cd.match(/filename\*=UTF-8''([^;]+)/);
    const name = m ? decodeURIComponent(m[1]) : 'attachment';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (err) { toast(err.message, 'err'); }
}
async function uploadAttachment(file) {
  const id = state.uploadTarget;
  if (!id || !file) return;
  try {
    await api(`/api/equipment/${id}/attachments?filename=${encodeURIComponent(file.name)}`,
      { method: 'POST', body: file });
    toast('附件已上传');
    await loadList();
    const item = state.list.find((e) => e.id === id) ||
      (await api('/api/equipment/' + id)).item;
    openDetail(item);
  } catch (err) { toast(err.message, 'err'); }
}
async function delAttachment(equipId, attId) {
  if (!confirm('确定删除该附件吗？')) return;
  try {
    await api(`/api/equipment/${equipId}/attachments/${attId}`, { method: 'DELETE' });
    toast('附件已删除');
    await loadList();
    const item = state.list.find((e) => e.id === equipId) ||
      (await api('/api/equipment/' + equipId)).item;
    openDetail(item);
  } catch (err) { toast(err.message, 'err'); }
}

/* ---------- 事件绑定 ---------- */
$('#loginForm').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  $('#loginError').textContent = '';
  try {
    await doLogin($('#loginUser').value.trim(), $('#loginPass').value);
  } catch (err) { $('#loginError').textContent = err.message; }
});
document.querySelectorAll('.demo-item').forEach((d) =>
  d.addEventListener('click', () => {
    $('#loginUser').value = d.dataset.u;
    $('#loginPass').value = d.dataset.p;
  }));
$('#logoutBtn').addEventListener('click', () => doLogout(false));
$('#menu').addEventListener('click', (ev) => {
  const item = ev.target.closest('.menu-item');
  if (item) switchPage(item.dataset.page);
});
$('#catTabs').addEventListener('click', async (ev) => {
  const tab = ev.target.closest('.tab');
  if (!tab) return;
  state.filter.category = tab.dataset.cat;
  await loadList();
});
$('#statusFilter').addEventListener('change', async (ev) => {
  state.filter.status = ev.target.value;
  await loadList();
});
let searchTimer;
$('#searchInput').addEventListener('input', (ev) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(async () => {
    state.filter.q = ev.target.value.trim();
    await loadList();
  }, 300);
});
$('#addBtn').addEventListener('click', () => openForm(null));
$('#equipForm').addEventListener('submit', submitForm);
$('#equipTbody').addEventListener('click', (ev) => {
  const btn = ev.target.closest('[data-act]');
  if (!btn) return;
  const item = state.list.find((e) => e.id === btn.dataset.id);
  if (!item) return;
  if (btn.dataset.act === 'edit') openForm(item);
  else if (btn.dataset.act === 'del') delItem(item.id);
  else if (btn.dataset.act === 'detail') openDetail(item);
});
document.querySelectorAll('[data-close]').forEach((b) =>
  b.addEventListener('click', () => b.closest('.modal-mask').classList.add('hidden')));
document.querySelectorAll('.modal-mask').forEach((m) =>
  m.addEventListener('click', (ev) => { if (ev.target === m) m.classList.add('hidden'); }));
$('#fileInput').addEventListener('change', (ev) => {
  const f = ev.target.files[0];
  ev.target.value = '';
  if (f) uploadAttachment(f);
});

/* ---------- 启动：尝试恢复会话 ---------- */
(async function init() {
  if (state.token) {
    try {
      const { user } = await api('/api/me');
      state.user = user;
      await enterApp();
      return;
    } catch (e) { /* 会话失效，回到登录页 */ }
  }
  $('#loginView').classList.remove('hidden');
})();

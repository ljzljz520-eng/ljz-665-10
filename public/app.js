/* ============================================================
 * 演播室器材档案平台 —— 前端单页应用（原生 JS，零依赖）
 * ============================================================ */

// ---------- 全局状态 ----------
const state = {
  token: localStorage.getItem('sga_token') || null,
  user: null,
  meta: null,
  view: 'dashboard',
  filters: { q: '', category: '', status: '' },
  gearList: []
};

const CAT_ICON = { camera: '🎥', light: '💡', audio: '🎙️', switcher: '🎛️' };
const FILE_ICON = (name = '') => {
  if (/\.(png|jpe?g|gif|webp|svg)$/i.test(name)) return '🖼️';
  if (/\.(pdf)$/i.test(name)) return '📕';
  if (/\.(xlsx?|csv)$/i.test(name)) return '📊';
  if (/\.(docx?|txt|md)$/i.test(name)) return '📄';
  if (/\.(zip|rar|7z)$/i.test(name)) return '🗜️';
  return '📎';
};

// ---------- API 封装 ----------
async function api(path, { method = 'GET', body = null, raw = false } = {}) {
  const headers = {};
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  if (body !== null) headers['Content-Type'] = 'application/json';
  const resp = await fetch(path, { method, headers, body: body !== null ? JSON.stringify(body) : undefined });
  if (raw) return resp;
  let json = null;
  try { json = await resp.json(); } catch { /* 非 JSON */ }
  if (!resp.ok || (json && json.ok === false)) {
    const err = new Error(json?.error || `请求失败（${resp.status}）`);
    err.status = resp.status;
    err.details = json?.details || null;
    throw err;
  }
  return json?.data;
}

// ---------- 小工具 ----------
const $app = document.getElementById('app');
function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function canDo(action) { return Boolean(state.user?.permissions?.[action]); }
function catLabel(v) { return state.meta?.categories.find((c) => c.value === v)?.label || v; }
function stLabel(v) { return state.meta?.statuses.find((s) => s.value === v)?.label || v; }
function roleLabel(v) { return state.meta?.roles.find((r) => r.value === v)?.label || v; }
function fmtSize(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
function fmtTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function initials(name) { return esc((name || '?').slice(0, 1)); }

// ---------- Toast ----------
function toast(msg, type = 'info') {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  const icon = type === 'success' ? '✅' : type === 'error' ? '⛔' : 'ℹ️';
  el.innerHTML = `<span>${icon}</span><span>${esc(msg)}</span>`;
  root.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }, 2600);
}

// ---------- Modal ----------
function openModal(innerHtml, { small = false } = {}) {
  closeModal();
  const root = document.getElementById('modal-root');
  root.innerHTML = `<div class="modal-mask"><div class="modal${small ? ' sm' : ''}">${innerHtml}</div></div>`;
  const mask = root.firstElementChild;
  const box = root.querySelector('.modal');
  const close = () => { root.innerHTML = ''; };
  mask.addEventListener('mousedown', (e) => { if (e.target === mask) close(); });
  box.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  return { box, close };
}
function closeModal() { document.getElementById('modal-root').innerHTML = ''; }
function confirmDanger(title, message) {
  return new Promise((resolve) => {
    const { box, close } = openModal(`
      <div class="modal-head"><h3>${esc(title)}</h3><button class="x-btn" data-close>×</button></div>
      <div class="modal-body"><div style="margin:4px 0">${esc(message)}</div></div>
      <div class="modal-foot">
        <button class="btn" data-close>取消</button>
        <button class="btn btn-danger" id="cf-ok">确认删除</button>
      </div>`, { small: true });
    box.querySelector('#cf-ok').addEventListener('click', () => { close(); resolve(true); });
  });
}

// ============================================================
//  登录页
// ============================================================
function renderLogin() {
  state.view = 'dashboard';
  $app.innerHTML = `
  <div class="login-wrap">
    <div class="login-card">
      <div class="login-logo">🎬</div>
      <h1>演播室器材档案平台</h1>
      <p class="login-sub">摄像机 · 灯光 · 收音 · 切换台 全生命周期台账</p>
      <div class="demo-accounts">
        <div style="margin-bottom:6px"><b>演示账号（点击自动填充）</b></div>
        <div>系统管理员：<span class="acc" data-u="admin" data-p="admin123">admin / admin123</span></div>
        <div>器材管理员：<span class="acc" data-u="editor" data-p="edit123">editor / edit123</span></div>
        <div>普通查看员：<span class="acc" data-u="viewer" data-p="view123">viewer / view123</span></div>
      </div>
      <form id="login-form">
        <div class="field">
          <label>用户名</label>
          <input class="input" id="lg-u" autocomplete="username" placeholder="请输入用户名" />
        </div>
        <div class="field">
          <label>密码</label>
          <input class="input" id="lg-p" type="password" autocomplete="current-password" placeholder="请输入密码" />
          <div class="field-error" id="lg-err" style="display:none"></div>
        </div>
        <button class="btn btn-primary btn-block" type="submit" style="padding:10px;font-size:14.5px">登 录</button>
      </form>
    </div>
  </div>`;

  $app.querySelectorAll('.acc').forEach((el) =>
    el.addEventListener('click', () => {
      $app.querySelector('#lg-u').value = el.dataset.u;
      $app.querySelector('#lg-p').value = el.dataset.p;
    })
  );
  $app.querySelector('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errBox = $app.querySelector('#lg-err');
    errBox.style.display = 'none';
    try {
      const data = await api('/api/auth/login', {
        method: 'POST',
        body: { username: $app.querySelector('#lg-u').value, password: $app.querySelector('#lg-p').value }
      });
      state.token = data.token;
      state.user = data.user;
      localStorage.setItem('sga_token', data.token);
      toast(`欢迎回来，${data.user.realName}`, 'success');
      render();
    } catch (err) {
      errBox.textContent = err.message;
      errBox.style.display = 'block';
    }
  });
}

function logout() {
  state.token = null;
  state.user = null;
  localStorage.removeItem('sga_token');
  renderLogin();
}

// ============================================================
//  主框架 + 菜单
// ============================================================
const MENU = [
  { group: '工作台' },
  { key: 'dashboard', label: '总览面板', icon: '📊' },
  { group: '档案管理' },
  { key: 'gear', label: '器材档案', icon: '📋' },
  { group: '系统管理', adminOnly: true },
  { key: 'users', label: '用户与权限', icon: '👥', adminOnly: true }
];

function render() {
  if (!state.user) return renderLogin();
  const items = MENU.filter((m) => !m.adminOnly || canDo('userAdmin'));
  $app.innerHTML = `
  <div class="layout">
    <aside class="sidebar">
      <div class="brand">
        <span class="logo">🎬</span>
        <span class="txt">
          <span class="t1">演播室器材档案</span><br/>
          <span class="t2">Studio Gear Archive</span>
        </span>
      </div>
      <nav class="nav">
        ${items
          .map((m) =>
            m.group
              ? `<div class="nav-group">${m.group}</div>`
              : `<div class="nav-item ${state.view === m.key ? 'active' : ''}" data-nav="${m.key}">
                   <span class="ico">${m.icon}</span><span class="txt">${m.label}</span>
                 </div>`
          )
          .join('')}
      </nav>
      <div class="userbox">
        <div class="avatar">${initials(state.user.realName)}</div>
        <div class="uinfo">
          <div class="uname">${esc(state.user.realName)}</div>
          <div class="urole">${esc(roleLabel(state.user.role))}</div>
        </div>
        <button class="btn btn-ghost btn-sm logout" id="btn-logout" title="退出登录"
          style="color:#b9c8e0">退出</button>
      </div>
    </aside>
    <div class="main">
      <header class="topbar">
        <div>
          <h2 id="page-title"></h2>
          <div class="crumb" id="page-crumb"></div>
        </div>
        <div id="page-actions"></div>
      </header>
      <div class="content" id="content"></div>
    </div>
  </div>`;

  $app.querySelectorAll('[data-nav]').forEach((el) =>
    el.addEventListener('click', () => { state.view = el.dataset.nav; render(); })
  );
  $app.querySelector('#btn-logout').addEventListener('click', logout);

  if (state.view === 'dashboard') renderDashboard();
  else if (state.view === 'gear') renderGearPage();
  else if (state.view === 'users') renderUsersPage();
  else { state.view = 'dashboard'; render(); }
}

// ============================================================
//  总览面板
// ============================================================
async function renderDashboard() {
  $app.querySelector('#page-title').textContent = '总览面板';
  $app.querySelector('#page-crumb').textContent = '工作台 / 总览面板';
  const content = $app.querySelector('#content');
  content.innerHTML = `<div class="empty"><div class="big">⏳</div>数据加载中…</div>`;
  const stats = await api('/api/stats');
  const maxC = Math.max(1, ...Object.values(stats.byCategory));
  const maxS = Math.max(1, ...Object.values(stats.byStatus));
  const permRows = [
    ['查看档案（列表/详情/附件下载）', true, true, true],
    ['新增 / 编辑档案、上传与删除附件', false, true, true],
    ['删除器材档案', false, false, true],
    ['用户与角色权限管理', false, false, true]
  ];
  content.innerHTML = `
    <div class="stat-grid">
      <div class="card stat-card">
        <div class="s-label">📦 器材总数</div>
        <div class="s-value">${stats.total}</div>
        <div class="s-sub">覆盖 4 大类演播室设备</div>
      </div>
      <div class="card stat-card">
        <div class="s-label">📤 借用中</div>
        <div class="s-value" style="color:var(--warn)">${stats.byStatus.borrowed}</div>
        <div class="s-sub">维修中 ${stats.byStatus.repair} 台 · 已报废 ${stats.byStatus.scrapped} 台</div>
      </div>
      <div class="card stat-card">
        <div class="s-label">✅ 在库可用</div>
        <div class="s-value" style="color:var(--success)">${stats.byStatus.in_stock}</div>
        <div class="s-sub">可随时领用 / 排期</div>
      </div>
      <div class="card stat-card">
        <div class="s-label">📎 附件档案</div>
        <div class="s-value">${stats.attachmentCount}</div>
        <div class="s-sub">登记用户 ${stats.userCount} 人</div>
      </div>
    </div>

    <div class="card panel">
      <h3>器材分类分布</h3>
      <div class="bars">
        <div>${state.meta.categories.map((c) => barHtml(c.label, stats.byCategory[c.value], maxC, CAT_COLOR[c.value], CAT_ICON[c.value])).join('')}</div>
        <div>${state.meta.statuses.map((s) => barHtml(s.label, stats.byStatus[s.value], maxS, ST_COLOR[s.value], '🔘')).join('')}</div>
      </div>
    </div>

    <div class="card panel">
      <h3>角色权限矩阵（查看与编辑权限分离）</h3>
      <table class="grid">
        <thead><tr><th>功能权限</th><th class="center">普通查看员</th><th class="center">器材管理员</th><th class="center">系统管理员</th></tr></thead>
        <tbody>
          ${permRows
            .map(
              (r) => `<tr>
                <td>${r[0]}</td>
                <td class="center">${r[1] ? '✅' : '—'}</td>
                <td class="center">${r[2] ? '✅' : '—'}</td>
                <td class="center">${r[3] ? '✅' : '—'}</td>
              </tr>`
            )
            .join('')}
        </tbody>
      </table>
      <div class="perm-note" style="margin-top:14px;margin-bottom:0">
        <span>🔐</span>
        <span>当前登录身份：<b>${esc(roleLabel(state.user.role))}</b>。
        所有接口均在服务端二次校验权限；前端按钮仅作展示控制，越权请求会返回 403。
        可退出后切换角色账号体验权限差异。</span>
      </div>
    </div>`;
}
const CAT_COLOR = { camera: '#2563eb', light: '#d97706', audio: '#16a34a', switcher: '#7c3aed' };
const ST_COLOR = { in_stock: '#16a34a', borrowed: '#d97706', repair: '#dc2626', scrapped: '#64748b' };
function barHtml(label, value, max, color, icon) {
  const w = Math.round((value / max) * 100);
  return `<div class="bar-row">
    <span>${icon || ''} ${esc(label)}</span>
    <span class="bar-track"><span class="bar-fill" style="width:${w}%;background:${color}"></span></span>
    <span class="bar-num">${value}</span>
  </div>`;
}

// ============================================================
//  器材档案列表（筛选 + 增删改查）
// ============================================================
function renderGearPage() {
  $app.querySelector('#page-title').textContent = '器材档案';
  $app.querySelector('#page-crumb').textContent = '档案管理 / 器材档案';
  const content = $app.querySelector('#content');
  content.innerHTML = `
    ${canDo('edit') ? '' : `
    <div class="perm-note"><span>👁️</span>
      <span>当前为<b>只读</b>身份（${esc(roleLabel(state.user.role))}）：可查看档案、检索与下载附件，但新增、编辑、删除及附件上传按钮不可用。</span>
    </div>`}
    <div class="card panel">
      <div class="toolbar">
        <div class="search-box">
          <input class="input" id="f-q" placeholder="搜索编号 / 名称 / 位置 / 责任人…" value="${esc(state.filters.q)}" />
        </div>
        <select class="input" id="f-cat">
          <option value="">全部类别</option>
          ${state.meta.categories.map((c) => `<option value="${c.value}" ${state.filters.category === c.value ? 'selected' : ''}>${CAT_ICON[c.value]} ${c.label}</option>`).join('')}
        </select>
        <select class="input" id="f-st">
          <option value="">全部状态</option>
          ${state.meta.statuses.map((s) => `<option value="${s.value}" ${state.filters.status === s.value ? 'selected' : ''}>${s.label}</option>`).join('')}
        </select>
        <button class="btn" id="f-reset">重置</button>
        <span class="spacer"></span>
        ${canDo('edit') ? `<button class="btn btn-primary" id="btn-add">➕ 新增器材</button>` : ''}
      </div>
      <div style="overflow-x:auto">
        <table class="grid">
          <thead>
            <tr>
              <th>器材编号</th><th>类别</th><th>名称 / 型号</th><th>存放位置</th>
              <th>借用状态</th><th>责任人</th><th>附件</th><th class="right">操作</th>
            </tr>
          </thead>
          <tbody id="gear-tbody"></tbody>
        </table>
      </div>
    </div>`;

  const q = content.querySelector('#f-q');
  const cat = content.querySelector('#f-cat');
  const st = content.querySelector('#f-st');
  let timer;
  q.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => { state.filters.q = q.value; loadGear(); }, 250);
  });
  cat.addEventListener('change', () => { state.filters.category = cat.value; loadGear(); });
  st.addEventListener('change', () => { state.filters.status = st.value; loadGear(); });
  content.querySelector('#f-reset').addEventListener('click', () => {
    state.filters = { q: '', category: '', status: '' };
    renderGearPage();
  });
  if (canDo('edit')) content.querySelector('#btn-add').addEventListener('click', () => openGearForm());
  loadGear();
}

async function loadGear() {
  const tbody = $app.querySelector('#gear-tbody');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="8" class="empty">加载中…</td></tr>`;
  const params = new URLSearchParams();
  if (state.filters.q) params.set('q', state.filters.q);
  if (state.filters.category) params.set('category', state.filters.category);
  if (state.filters.status) params.set('status', state.filters.status);
  try {
    state.gearList = await api(`/api/equipment?${params.toString()}`);
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty">加载失败：${esc(e.message)}</td></tr>`;
    return;
  }
  if (!state.gearList.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty"><div class="big">🗂️</div>没有符合条件的器材档案</td></tr>`;
    return;
  }
  tbody.innerHTML = state.gearList
    .map(
      (g) => `<tr class="clickable" data-view="${g.id}">
        <td><span class="code">${esc(g.code)}</span></td>
        <td><span class="tag tag-${g.category}">${CAT_ICON[g.category]} ${esc(catLabel(g.category))}</span></td>
        <td>
          <div style="font-weight:600">${esc(g.name)}</div>
          <div class="muted" style="font-size:12px">${esc([g.brand, g.model].filter(Boolean).join(' · ') || '—')}</div>
        </td>
        <td>${esc(g.location)}</td>
        <td><span class="tag st-${g.status}">${esc(stLabel(g.status))}</span></td>
        <td>${esc(g.owner)}</td>
        <td><span class="att-count">📎 ${g.attachments?.length || 0}</span></td>
        <td>
          <div class="row-actions">
            <button class="btn btn-sm" data-view="${g.id}">详情</button>
            ${canDo('edit') ? `<button class="btn btn-sm" data-edit="${g.id}">编辑</button>` : ''}
            ${canDo('delete') ? `<button class="btn btn-sm btn-danger" data-del="${g.id}">删除</button>` : ''}
          </div>
        </td>
      </tr>`
    )
    .join('');

  tbody.querySelectorAll('[data-view]').forEach((b) =>
    b.addEventListener('click', (e) => { e.stopPropagation(); openGearDetail(b.dataset.view); })
  );
  tbody.querySelectorAll('[data-edit]').forEach((b) =>
    b.addEventListener('click', (e) => { e.stopPropagation(); openGearForm(b.dataset.edit); })
  );
  tbody.querySelectorAll('[data-del]').forEach((b) =>
    b.addEventListener('click', (e) => { e.stopPropagation(); deleteGear(b.dataset.del); })
  );
  tbody.querySelectorAll('tr.clickable').forEach((tr) =>
    tr.addEventListener('click', () => openGearDetail(tr.dataset.view))
  );
}

async function deleteGear(id) {
  const g = state.gearList.find((x) => x.id === id);
  const ok2 = await confirmDanger('删除器材档案', `确定删除「${g?.name || id}」（${g?.code || ''}）吗？其全部附件将一并删除，此操作不可恢复。`);
  if (!ok2) return;
  try {
    await api(`/api/equipment/${id}`, { method: 'DELETE' });
    toast('档案已删除', 'success');
    loadGear();
  } catch (e) { toast(e.message, 'error'); }
}

// ---------- 详情弹窗 ----------
async function openGearDetail(id) {
  let g;
  try { g = await api(`/api/equipment/${id}`); }
  catch (e) { return toast(e.message, 'error'); }
  const editable = canDo('edit');
  const { box, close } = openModal(`
    <div class="modal-head">
      <h3>📋 器材档案详情</h3>
      <button class="x-btn" data-close>×</button>
    </div>
    <div class="modal-body" id="detail-body">
      <div class="empty"><div class="big">⏳</div>加载中…</div>
    </div>
    <div class="modal-foot">
      <button class="btn" data-close>关闭</button>
      ${canDo('delete') ? '<button class="btn btn-danger" id="d-del">删除档案</button>' : ''}
      ${editable ? '<button class="btn btn-primary" id="d-edit">编辑档案</button>' : ''}
    </div>`);

  const body = box.querySelector('#detail-body');
  body.innerHTML = detailHtml(g);
  bindAttachmentEvents(box, g, editable, () => openGearDetail(id));
  box.querySelector('#d-edit')?.addEventListener('click', () => { close(); openGearForm(id); });
  box.querySelector('#d-del')?.addEventListener('click', async () => {
    close();
    await deleteGear(id);
  });
}

function detailHtml(g) {
  const item = (label, value, full = false) => `
    <div class="detail-item${full ? ' full' : ''}">
      <div class="dl">${label}</div><div class="dv">${value === '' || value == null ? '—' : value}</div>
    </div>`;
  return `
    <div class="detail-head">
      <h3>${esc(g.name)}</h3>
      <span class="tag tag-${g.category}">${CAT_ICON[g.category]} ${esc(catLabel(g.category))}</span>
      <span class="tag st-${g.status}">${esc(stLabel(g.status))}</span>
    </div>
    <div class="detail-grid">
      ${item('器材编号', `<span class="code">${esc(g.code)}</span>`)}
      ${item('品牌', esc(g.brand))}
      ${item('型号', esc(g.model))}
      ${item('存放位置', `📍 ${esc(g.location)}`)}
      ${item('责任人', esc(g.owner))}
      ${item('责任人电话', esc(g.ownerPhone))}
      ${item('借用状态', esc(stLabel(g.status)))}
      ${item('购置日期', esc(g.purchaseDate))}
      ${item('最近更新', fmtTime(g.updatedAt))}
      ${item('备注', esc(g.remark), true)}
    </div>
    <div class="hr"></div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
      <h3 style="margin:0;font-size:14px">📎 附件清单（${g.attachments.length}）</h3>
    </div>
    <div class="att-list">
      ${
        g.attachments.length
          ? g.attachments
              .map(
                (a) => `<div class="att-item">
                  <span class="a-ico">${FILE_ICON(a.name)}</span>
                  <div>
                    <div class="a-name">${esc(a.name)}</div>
                    <div class="a-meta">${fmtSize(a.size)} · 上传于 ${fmtTime(a.uploadedAt)}</div>
                  </div>
                  <div class="a-actions">
                    <button class="btn btn-sm" data-download="${a.id}">下载</button>
                    ${canDo('edit') ? `<button class="btn btn-sm btn-danger" data-delatt="${a.id}">移除</button>` : ''}
                  </div>
                </div>`
              )
              .join('')
          : '<div class="muted" style="padding:6px 2px">暂无附件</div>'
      }
    </div>
    ${
      canDo('edit')
        ? `<div class="upload-drop" id="upload-drop" style="margin-top:12px">
             <div style="font-size:22px">⬆️</div>
             <div><b>点击选择</b> 或将文件拖拽到此处上传附件（单个 ≤ 20MB）</div>
             <input type="file" id="upload-input" style="display:none" multiple />
           </div>`
        : ''
    }`;
}

function bindAttachmentEvents(box, g, editable, refresh) {
  box.querySelectorAll('[data-download]').forEach((b) =>
    b.addEventListener('click', () => downloadAttachment(b.dataset.download))
  );
  if (!editable) return;
  box.querySelectorAll('[data-delatt]').forEach((b) =>
    b.addEventListener('click', async () => {
      const ok2 = await confirmDanger('移除附件', '确定从该器材档案中移除该附件吗？文件将被物理删除。');
      if (!ok2) return;
      try {
        await api(`/api/equipment/${g.id}/attachments/${b.dataset.delatt}`, { method: 'DELETE' });
        toast('附件已移除', 'success');
        refresh();
        loadGear();
      } catch (e) { toast(e.message, 'error'); }
    })
  );
  const drop = box.querySelector('#upload-drop');
  const input = box.querySelector('#upload-input');
  if (!drop) return;
  drop.addEventListener('click', () => input.click());
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('drag'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('drag');
    uploadFiles(g.id, Array.from(e.dataTransfer.files), refresh);
  });
  input.addEventListener('change', () => uploadFiles(g.id, Array.from(input.files), refresh));
}

async function uploadFiles(gearId, files, refresh) {
  if (!files.length) return;
  for (const file of files) {
    if (file.size > 20 * 1024 * 1024) { toast(`${file.name} 超过 20MB，已跳过`, 'error'); continue; }
    try {
      const dataBase64 = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result.split(',')[1]);
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      await api(`/api/equipment/${gearId}/attachments`, {
        method: 'POST',
        body: { name: file.name, mime: file.type || 'application/octet-stream', dataBase64 }
      });
      toast(`${file.name} 上传成功`, 'success');
    } catch (e) { toast(`${file.name} 上传失败：${e.message}`, 'error'); }
  }
  refresh();
  loadGear();
}

async function downloadAttachment(fileId) {
  try {
    const resp = await api(`/api/files/${fileId}`, { raw: true });
    if (!resp.ok) {
      const j = await resp.json().catch(() => null);
      throw new Error(j?.error || '下载失败');
    }
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '';
    // 从 Content-Disposition 取文件名
    const cd = resp.headers.get('Content-Disposition') || '';
    const m = cd.match(/filename\*=UTF-8''([^;]+)/i);
    if (m) a.download = decodeURIComponent(m[1]);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (e) { toast(e.message, 'error'); }
}

// ---------- 新增 / 编辑表单 ----------
function openGearForm(id = null) {
  const g = id ? state.gearList.find((x) => x.id === id) : null;
  const { box, close } = openModal(`
    <div class="modal-head">
      <h3>${id ? '✏️ 编辑器材档案' : '➕ 新增器材档案'}</h3>
      <button class="x-btn" data-close>×</button>
    </div>
    <form id="gear-form">
      <div class="modal-body">
        <div class="form-grid">
          <div class="field">
            <label>器材类别<span class="req">*</span></label>
            <select class="input" name="category" required>
              ${state.meta.categories.map((c) => `<option value="${c.value}" ${g?.category === c.value ? 'selected' : ''}>${CAT_ICON[c.value]} ${c.label}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>借用状态<span class="req">*</span></label>
            <select class="input" name="status" required>
              ${state.meta.statuses.map((s) => `<option value="${s.value}" ${(g?.status || 'in_stock') === s.value ? 'selected' : ''}>${s.label}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>器材编号<span class="req">*</span></label>
            <input class="input" name="code" required placeholder="如 CAM-4K-A03" value="${esc(g?.code || '')}" />
            <div class="field-error" data-err="code"></div>
          </div>
          <div class="field">
            <label>器材名称<span class="req">*</span></label>
            <input class="input" name="name" required placeholder="如 Sony PXW-Z280 4K 摄像机" value="${esc(g?.name || '')}" />
            <div class="field-error" data-err="name"></div>
          </div>
          <div class="field">
            <label>品牌</label>
            <input class="input" name="brand" placeholder="如 Sony" value="${esc(g?.brand || '')}" />
          </div>
          <div class="field">
            <label>型号</label>
            <input class="input" name="model" placeholder="如 PXW-Z280" value="${esc(g?.model || '')}" />
          </div>
          <div class="field">
            <label>存放位置<span class="req">*</span></label>
            <input class="input" name="location" required placeholder="如 A 区器材柜 1 层" value="${esc(g?.location || '')}" />
            <div class="field-error" data-err="location"></div>
          </div>
          <div class="field">
            <label>责任人<span class="req">*</span></label>
            <input class="input" name="owner" required placeholder="如 李器材" value="${esc(g?.owner || '')}" />
            <div class="field-error" data-err="owner"></div>
          </div>
          <div class="field">
            <label>责任人电话</label>
            <input class="input" name="ownerPhone" placeholder="如 138-0000-0002" value="${esc(g?.ownerPhone || '')}" />
          </div>
          <div class="field">
            <label>购置日期</label>
            <input class="input" type="date" name="purchaseDate" value="${esc(g?.purchaseDate || '')}" />
          </div>
          <div class="field full">
            <label>备注</label>
            <textarea class="input" name="remark" placeholder="配置清单、借用说明、维修记录等">${esc(g?.remark || '')}</textarea>
          </div>
        </div>
      </div>
      <div class="modal-foot">
        <button type="button" class="btn" data-close>取消</button>
        <button type="submit" class="btn btn-primary" id="form-submit">${id ? '保存修改' : '创建档案'}</button>
      </div>
    </form>`);

  const form = box.querySelector('#gear-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    box.querySelectorAll('[data-err]').forEach((el) => { el.textContent = ''; });
    const payload = Object.fromEntries(new FormData(form).entries());
    const btn = box.querySelector('#form-submit');
    btn.disabled = true;
    try {
      if (id) {
        await api(`/api/equipment/${id}`, { method: 'PUT', body: payload });
        toast('档案已更新', 'success');
      } else {
        await api('/api/equipment', { method: 'POST', body: payload });
        toast('档案已创建', 'success');
      }
      close();
      loadGear();
    } catch (err) {
      if (err.details) {
        for (const [k, v] of Object.entries(err.details)) {
          const el = box.querySelector(`[data-err="${k}"]`);
          if (el) el.textContent = v;
        }
      } else {
        toast(err.message, 'error');
      }
      btn.disabled = false;
    }
  });
}

// ============================================================
//  用户管理（仅管理员）
// ============================================================
async function renderUsersPage() {
  $app.querySelector('#page-title').textContent = '用户与权限';
  $app.querySelector('#page-crumb').textContent = '系统管理 / 用户与权限';
  const content = $app.querySelector('#content');
  content.innerHTML = `
    <div class="card panel">
      <div class="toolbar">
        <div>管理后台登录账号及其角色；角色决定查看 / 编辑 / 删除权限。</div>
        <span class="spacer"></span>
        <button class="btn btn-primary" id="btn-add-user">➕ 新建用户</button>
      </div>
      <div style="overflow-x:auto">
        <table class="grid">
          <thead><tr><th>用户</th><th>登录名</th><th>角色</th><th>电话</th><th>状态</th><th>创建时间</th><th class="right">操作</th></tr></thead>
          <tbody id="user-tbody"><tr><td colspan="7" class="empty">加载中…</td></tr></tbody>
        </table>
      </div>
    </div>`;
  content.querySelector('#btn-add-user').addEventListener('click', () => openUserForm());
  const users = await api('/api/users');
  const tbody = content.querySelector('#user-tbody');
  tbody.innerHTML = users
    .map(
      (u) => `<tr>
        <td>
          <div style="display:flex;align-items:center;gap:9px">
            <span class="avatar" style="width:28px;height:28px;font-size:12px">${initials(u.realName)}</span>
            <b>${esc(u.realName)}</b>${u.id === state.user.id ? '<span class="att-count">当前账号</span>' : ''}
          </div>
        </td>
        <td><span class="code">${esc(u.username)}</span></td>
        <td><span class="role-badge role-${u.role}">${esc(roleLabel(u.role))}</span></td>
        <td>${esc(u.phone || '—')}</td>
        <td>${u.active ? '<span class="tag st-in_stock">启用</span>' : '<span class="tag st-scrapped">停用</span>'}</td>
        <td>${fmtTime(u.createdAt)}</td>
        <td><div class="row-actions">
          <button class="btn btn-sm" data-uedit="${u.id}">编辑</button>
          ${u.id === state.user.id ? '' : `<button class="btn btn-sm btn-danger" data-udel="${u.id}">删除</button>`}
        </div></td>
      </tr>`
    )
    .join('');
  tbody.querySelectorAll('[data-uedit]').forEach((b) =>
    b.addEventListener('click', () => openUserForm(b.dataset.uedit, users))
  );
  tbody.querySelectorAll('[data-udel]').forEach((b) =>
    b.addEventListener('click', async () => {
      const u = users.find((x) => x.id === b.dataset.udel);
      const ok2 = await confirmDanger('删除用户', `确定删除用户「${u.realName}（${u.username}）」吗？`);
      if (!ok2) return;
      try {
        await api(`/api/users/${u.id}`, { method: 'DELETE' });
        toast('用户已删除', 'success');
        renderUsersPage();
      } catch (e) { toast(e.message, 'error'); }
    })
  );
}

function openUserForm(uid = null, users = []) {
  const u = uid ? users.find((x) => x.id === uid) : null;
  const { box, close } = openModal(`
    <div class="modal-head">
      <h3>${u ? '👥 编辑用户' : '➕ 新建用户'}</h3>
      <button class="x-btn" data-close>×</button>
    </div>
    <form id="user-form">
      <div class="modal-body">
        <div class="form-grid">
          <div class="field">
            <label>登录名${u ? '' : '<span class="req">*</span>'}</label>
            <input class="input" name="username" ${u ? 'disabled' : 'required'} pattern="[a-zA-Z0-9_]{3,20}"
              placeholder="3-20 位字母数字下划线" value="${esc(u?.username || '')}" />
            <div class="field-error" data-err="username"></div>
          </div>
          <div class="field">
            <label>姓名<span class="req">*</span></label>
            <input class="input" name="realName" required value="${esc(u?.realName || '')}" />
            <div class="field-error" data-err="realName"></div>
          </div>
          <div class="field">
            <label>角色<span class="req">*</span></label>
            <select class="input" name="role" required>
              ${state.meta.roles
                .map(
                  (r) => `<option value="${r.value}" ${u?.role === r.value ? 'selected' : ''}>${r.label}（查看${r.view ? '✓' : '✗'} / 编辑${r.edit ? '✓' : '✗'} / 删除${r['delete'] ? '✓' : '✗'}）</option>`
                )
                .join('')}
            </select>
            <div class="field-error" data-err="role"></div>
          </div>
          <div class="field">
            <label>电话</label>
            <input class="input" name="phone" value="${esc(u?.phone || '')}" />
          </div>
          <div class="field full">
            <label>${u ? '重置密码（留空则不修改）' : '初始密码<span class="req">*</span>'}</label>
            <input class="input" name="password" type="password" ${u ? '' : 'required'} minlength="6"
              placeholder="${u ? '留空保持原密码' : '至少 6 位'}" autocomplete="new-password" />
            <div class="field-error" data-err="password"></div>
          </div>
          ${u ? `<div class="field full"><label><input type="checkbox" name="active" ${u.active ? 'checked' : ''} /> 账号启用（取消勾选将停用登录）</label></div>` : ''}
        </div>
      </div>
      <div class="modal-foot">
        <button type="button" class="btn" data-close>取消</button>
        <button type="submit" class="btn btn-primary">${u ? '保存' : '创建用户'}</button>
      </div>
    </form>`, { small: true });

  box.querySelector('#user-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    box.querySelectorAll('[data-err]').forEach((el) => (el.textContent = ''));
    const fd = new FormData(box.querySelector('#user-form'));
    const payload = {
      realName: fd.get('realName'),
      role: fd.get('role'),
      phone: fd.get('phone')
    };
    const pw = String(fd.get('password') || '');
    if (pw) payload.password = pw;
    if (!u) { payload.username = fd.get('username'); payload.password = pw; }
    else payload.active = fd.has('active');
    try {
      if (u) await api(`/api/users/${u.id}`, { method: 'PUT', body: payload });
      else await api('/api/users', { method: 'POST', body: payload });
      toast(u ? '用户已更新' : '用户已创建', 'success');
      close();
      renderUsersPage();
    } catch (err) {
      if (err.details) {
        for (const [k, v] of Object.entries(err.details)) {
          const el = box.querySelector(`[data-err="${k}"]`);
          if (el) el.textContent = v;
        }
      } else toast(err.message, 'error');
    }
  });
}

// ============================================================
//  启动：恢复会话
// ============================================================
(async function init() {
  state.meta = await api('/api/meta');
  if (state.token) {
    try {
      state.user = await api('/api/auth/me');
    } catch {
      state.token = null;
      localStorage.removeItem('sga_token');
    }
  }
  render();
})();

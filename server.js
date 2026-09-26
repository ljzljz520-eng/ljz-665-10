/**
 * 演播室器材档案管理系统 - 后端服务
 * 纯 Node.js 实现，无外部依赖
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const PUBLIC_DIR = path.join(ROOT, 'public');

const CATEGORIES = ['摄像机', '灯光', '收音', '切换台'];
const STATUSES = ['在库', '借出', '维修'];

// ---------------- 用户与角色权限 ----------------
const USERS = {
  admin:  { password: 'admin123',  role: 'admin',  name: '系统管理员' },
  keeper: { password: 'keeper123', role: 'keeper', name: '器材管理员' },
  viewer: { password: 'viewer123', role: 'viewer', name: '普通员工' },
};
const ROLE_NAMES = { admin: '系统管理员', keeper: '器材管理员', viewer: '普通员工' };
const PERMS = {
  admin:  ['view', 'create', 'update', 'delete', 'attach'],
  keeper: ['view', 'create', 'update', 'attach'],
  viewer: ['view'],
};

// ---------------- 数据持久化 ----------------
function uuid() { return crypto.randomUUID(); }
function now() { return new Date().toISOString(); }

function seedDB() {
  const t = now();
  const mk = (code, name, category, location, status, owner, note) => ({
    id: uuid(), code, name, category, location, status, owner,
    note: note || '', attachments: [], createdAt: t, updatedAt: t,
  });
  const db = {
    equipment: [
      mk('CAM-001', '索尼 PXW-Z280 4K摄录一体机', '摄像机', '演播室A-1号器材柜', '在库', '张伟', '含电池×2、充电器'),
      mk('CAM-002', '索尼 HDC-3500 演播室摄像机', '摄像机', '演播室A-摄像机位2', '借出', '李娜', '借出至《晚间新闻》栏目组'),
      mk('CAM-003', '松下 AG-CX350 手持摄像机', '摄像机', '库房B-3层货架', '维修', '王强', '镜头对焦异常，已送修'),
      mk('LGT-001', 'Aputure 300d LED常亮灯', '灯光', '灯光间-灯架A', '在库', '赵敏', '含柔光箱、灯架'),
      mk('LGT-002', '2K 菲涅尔聚光灯', '灯光', '灯光间-灯架B', '借出', '赵敏', ''),
      mk('LGT-003', 'RGB全彩LED灯管套装(4支)', '灯光', '灯光间-配件柜', '在库', '陈晨', ''),
      mk('AUD-001', '森海塞尔 MKH416 枪式话筒', '收音', '录音间-话筒柜1', '在库', '刘洋', '含防风毛衣'),
      mk('AUD-002', '舒尔 SM7B 动圈话筒', '收音', '录音间-话筒柜2', '借出', '刘洋', '借出至广播剧录制'),
      mk('AUD-003', '罗德 Wireless Go II 无线领夹麦', '收音', '录音间-无线设备盒', '在库', '孙丽', '一拖二'),
      mk('SWC-001', 'Blackmagic ATEM Mini Pro 切换台', '切换台', '导播间-机柜1', '在库', '周杰', '4路HDMI输入'),
      mk('SWC-002', '索尼 MCX-500 多机位切换台', '切换台', '导播间-机柜2', '维修', '周杰', '第3路输入无信号'),
    ],
  };
  // 给 CAM-001 预置一个说明书附件，便于演示下载
  const attId = uuid();
  const attName = 'PXW-Z280使用说明.txt';
  fs.writeFileSync(path.join(UPLOAD_DIR, attId), '索尼 PXW-Z280 4K 摄录一体机\n快速使用说明（演示附件）\n1. 开机前确认电池电量\n2. 白平衡校准后开拍\n3. 归还前格式化存储卡\n');
  db.equipment[0].attachments.push({ id: attId, name: attName, size: fs.statSync(path.join(UPLOAD_DIR, attId)).size, uploadedBy: '系统初始化', uploadedAt: t });
  return db;
}

let db;
function loadDB() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) {
    db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } else {
    db = seedDB();
    saveDB();
  }
}
function saveDB() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// ---------------- 会话 ----------------
const sessions = new Map(); // token -> { username, role, name, expires }
function createSession(username) {
  const u = USERS[username];
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, { username, role: u.role, name: u.name, expires: Date.now() + 8 * 3600 * 1000 });
  return token;
}
function getSession(req) {
  const h = req.headers['authorization'] || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return null;
  const s = sessions.get(token);
  if (!s) return null;
  if (s.expires < Date.now()) { sessions.delete(token); return null; }
  return { ...s, token };
}

// ---------------- 工具函数 ----------------
function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('请求体过大')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
function hasPerm(session, perm) { return PERMS[session.role].includes(perm); }
function publicUser(s) {
  return { username: s.username, name: s.name, role: s.role, roleName: ROLE_NAMES[s.role], perms: PERMS[s.role] };
}
function validateEquipment(input, excludeId) {
  const errors = [];
  const code = String(input.code || '').trim();
  const name = String(input.name || '').trim();
  const category = String(input.category || '').trim();
  const location = String(input.location || '').trim();
  const status = String(input.status || '').trim();
  const owner = String(input.owner || '').trim();
  const note = String(input.note || '').trim();
  if (!code) errors.push('器材编号不能为空');
  if (!/^[A-Za-z0-9_-]{2,32}$/.test(code)) errors.push('器材编号仅支持 2-32 位字母/数字/中划线/下划线');
  if (db.equipment.some((e) => e.code === code && e.id !== excludeId)) errors.push('器材编号已存在');
  if (!name) errors.push('器材名称不能为空');
  if (!CATEGORIES.includes(category)) errors.push('器材分类无效');
  if (!location) errors.push('存放位置不能为空');
  if (!STATUSES.includes(status)) errors.push('借用状态无效');
  if (!owner) errors.push('责任人不能为空');
  return { errors, value: { code, name, category, location, status, owner, note } };
}

// ---------------- API 路由 ----------------
async function handleApi(req, res, url) {
  const seg = url.pathname.split('/').filter(Boolean); // ['api', ...]
  const method = req.method;

  // 登录 / 登出
  if (method === 'POST' && url.pathname === '/api/login') {
    const body = JSON.parse((await readBody(req, 1e6)).toString() || '{}');
    const u = USERS[body.username];
    if (!u || u.password !== body.password) return sendJSON(res, 401, { error: '用户名或密码错误' });
    const token = createSession(body.username);
    return sendJSON(res, 200, { token, user: publicUser({ username: body.username, role: u.role, name: u.name }) });
  }

  // 以下接口均需登录
  const session = getSession(req);
  if (!session) return sendJSON(res, 401, { error: '未登录或会话已过期' });

  if (method === 'POST' && url.pathname === '/api/logout') {
    sessions.delete(session.token);
    return sendJSON(res, 200, { ok: true });
  }
  if (method === 'GET' && url.pathname === '/api/me') {
    return sendJSON(res, 200, { user: publicUser(session) });
  }
  if (method === 'GET' && url.pathname === '/api/meta') {
    return sendJSON(res, 200, { categories: CATEGORIES, statuses: STATUSES });
  }

  // 器材列表（所有角色可查）
  if (method === 'GET' && url.pathname === '/api/equipment') {
    const category = url.searchParams.get('category') || '';
    const status = url.searchParams.get('status') || '';
    const q = (url.searchParams.get('q') || '').trim().toLowerCase();
    let list = db.equipment;
    if (category) list = list.filter((e) => e.category === category);
    if (status) list = list.filter((e) => e.status === status);
    if (q) list = list.filter((e) =>
      [e.code, e.name, e.location, e.owner].some((f) => f.toLowerCase().includes(q)));
    const stats = {};
    for (const c of CATEGORIES) stats[c] = db.equipment.filter((e) => e.category === c).length;
    return sendJSON(res, 200, { list, total: db.equipment.length, stats });
  }

  // 新增器材
  if (method === 'POST' && url.pathname === '/api/equipment') {
    if (!hasPerm(session, 'create')) return sendJSON(res, 403, { error: '当前角色无新增权限' });
    const body = JSON.parse((await readBody(req, 1e6)).toString() || '{}');
    const { errors, value } = validateEquipment(body);
    if (errors.length) return sendJSON(res, 400, { error: errors.join('；') });
    const item = { id: uuid(), ...value, attachments: [], createdAt: now(), updatedAt: now() };
    db.equipment.push(item);
    saveDB();
    return sendJSON(res, 201, { item });
  }

  // /api/equipment/:id ...
  if (seg[1] === 'equipment' && seg[2]) {
    const item = db.equipment.find((e) => e.id === seg[2]);
    if (!item) return sendJSON(res, 404, { error: '器材不存在' });

    // 附件上传 POST /api/equipment/:id/attachments?filename=xxx
    if (method === 'POST' && seg[3] === 'attachments' && !seg[4]) {
      if (!hasPerm(session, 'attach')) return sendJSON(res, 403, { error: '当前角色无附件上传权限' });
      let filename = decodeURIComponent(url.searchParams.get('filename') || 'attachment.bin');
      filename = path.basename(filename).replace(/[\\/:*?"<>|]/g, '_').slice(0, 120) || 'attachment.bin';
      const buf = await readBody(req, 20 * 1024 * 1024);
      if (!buf.length) return sendJSON(res, 400, { error: '附件内容为空' });
      const att = { id: uuid(), name: filename, size: buf.length, uploadedBy: session.name, uploadedAt: now() };
      fs.writeFileSync(path.join(UPLOAD_DIR, att.id), buf);
      item.attachments.push(att);
      item.updatedAt = now();
      saveDB();
      return sendJSON(res, 201, { attachment: att });
    }

    // 附件下载 / 删除
    if (seg[3] === 'attachments' && seg[4]) {
      const att = item.attachments.find((a) => a.id === seg[4]);
      if (!att) return sendJSON(res, 404, { error: '附件不存在' });
      if (method === 'GET') {
        const file = path.join(UPLOAD_DIR, att.id);
        if (!fs.existsSync(file)) return sendJSON(res, 404, { error: '附件文件已丢失' });
        res.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Content-Length': fs.statSync(file).size,
          'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(att.name)}`,
        });
        return fs.createReadStream(file).pipe(res);
      }
      if (method === 'DELETE') {
        if (!hasPerm(session, 'attach')) return sendJSON(res, 403, { error: '当前角色无附件删除权限' });
        item.attachments = item.attachments.filter((a) => a.id !== att.id);
        const file = path.join(UPLOAD_DIR, att.id);
        if (fs.existsSync(file)) fs.unlinkSync(file);
        item.updatedAt = now();
        saveDB();
        return sendJSON(res, 200, { ok: true });
      }
    }

    if (method === 'GET' && !seg[3]) return sendJSON(res, 200, { item });

    if (method === 'PUT' && !seg[3]) {
      if (!hasPerm(session, 'update')) return sendJSON(res, 403, { error: '当前角色无编辑权限' });
      const body = JSON.parse((await readBody(req, 1e6)).toString() || '{}');
      const { errors, value } = validateEquipment(body, item.id);
      if (errors.length) return sendJSON(res, 400, { error: errors.join('；') });
      Object.assign(item, value, { updatedAt: now() });
      saveDB();
      return sendJSON(res, 200, { item });
    }

    if (method === 'DELETE' && !seg[3]) {
      if (!hasPerm(session, 'delete')) return sendJSON(res, 403, { error: '当前角色无删除权限（仅系统管理员可删除）' });
      for (const att of item.attachments) {
        const file = path.join(UPLOAD_DIR, att.id);
        if (fs.existsSync(file)) fs.unlinkSync(file);
      }
      db.equipment = db.equipment.filter((e) => e.id !== item.id);
      saveDB();
      return sendJSON(res, 200, { ok: true });
    }
  }

  return sendJSON(res, 404, { error: '接口不存在' });
}

// ---------------- 静态文件 ----------------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};
function serveStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, p));
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('Forbidden'); }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end('Not Found'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

// ---------------- 启动 ----------------
loadDB();
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
    else serveStatic(req, res, url);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) sendJSON(res, 500, { error: '服务器内部错误: ' + err.message });
  }
});
server.listen(PORT, () => console.log(`演播室器材档案管理系统已启动: http://localhost:${PORT}`));

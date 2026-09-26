// 演播室器材档案平台 —— HTTP 服务入口（零第三方依赖）
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  FILES_DIR,
  CATEGORIES,
  CATEGORY_LABELS,
  STATUSES,
  STATUS_LABELS,
  readDB,
  writeDB,
  mutateDB,
  nextId,
  publicUser
} from './db.js';
import { ROLES, hashPassword, verifyPassword, issueToken, verifyToken, can } from './auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const PORT = Number(process.env.PORT) || 3000;
const MAX_BODY = 25 * 1024 * 1024; // 25MB（附件 base64 上传）

// 首次启动自动写入种子数据
if (!fs.existsSync(path.join(__dirname, '..', 'data', 'gear.json'))) {
  const { spawnSync } = await import('node:child_process');
  spawnSync(process.execPath, [path.join(__dirname, 'seed.js')], { stdio: 'inherit' });
}

const SECRET_FILE = path.join(__dirname, '..', 'data', '.secret');
function loadSecret() {
  if (fs.existsSync(SECRET_FILE)) return fs.readFileSync(SECRET_FILE, 'utf8');
  const s = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(SECRET_FILE, s, { mode: 0o600 });
  return s;
}
const SECRET = loadSecret();

// ---------- 工具 ----------
function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}
const ok = (res, data) => sendJson(res, 200, { ok: true, data });
const fail = (res, status, message, details) =>
  sendJson(res, status, { ok: false, error: message, ...(details ? { details } : {}) });

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('请求体过大（上限 25MB）'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(Object.assign(new Error('JSON 格式错误'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function authenticate(req) {
  const h = req.headers.authorization || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const payload = verifyToken(m[1], SECRET);
  if (!payload) return null;
  const db = readDB();
  const user = db.users.find((u) => u.id === payload.sub && u.active);
  return user || null;
}

function requireAuth(req, res) {
  const user = authenticate(req);
  if (!user) {
    fail(res, 401, '未登录或登录已过期');
    return null;
  }
  return user;
}

function requirePerm(req, res, action) {
  const user = requireAuth(req, res);
  if (!user) return null;
  if (!can(user.role, action)) {
    fail(res, 403, `权限不足：${ROLES[user.role].label} 不能执行该操作`);
    return null;
  }
  return user;
}

const VALIDATORS = {
  category: (v) => (CATEGORIES.includes(v) ? '' : '器材类别非法'),
  status: (v) => (STATUSES.includes(v) ? '' : '借用状态非法'),
  code: (v) => (String(v || '').trim() ? '' : '器材编号必填'),
  name: (v) => (String(v || '').trim() ? '' : '器材名称必填'),
  location: (v) => (String(v || '').trim() ? '' : '存放位置必填'),
  owner: (v) => (String(v || '').trim() ? '' : '责任人必填')
};

function validateGear(payload) {
  const errors = {};
  for (const [field, fn] of Object.entries(VALIDATORS)) {
    const msg = fn(payload[field]);
    if (msg) errors[field] = msg;
  }
  return errors;
}

function sanitizeGearPayload(body) {
  const fields = [
    'category', 'code', 'name', 'brand', 'model', 'location',
    'status', 'owner', 'ownerPhone', 'purchaseDate', 'remark'
  ];
  const out = {};
  for (const f of fields) out[f] = body[f] == null ? '' : String(body[f]).trim();
  if (!out.status) out.status = 'in_stock';
  return out;
}

// ---------- 业务处理 ----------
async function handleApi(req, res, url) {
  const p = url.pathname;

  // 公开元信息
  if (req.method === 'GET' && p === '/api/meta') {
    const db = readDB();
    return ok(res, {
      platform: db.meta,
      categories: CATEGORIES.map((v) => ({ value: v, label: CATEGORY_LABELS[v] })),
      statuses: STATUSES.map((v) => ({ value: v, label: STATUS_LABELS[v] })),
      roles: Object.entries(ROLES).map(([value, r]) => ({ value, label: r.label, ...r }))
    });
  }

  // 登录 / 当前用户
  if (req.method === 'POST' && p === '/api/auth/login') {
    const body = await readBody(req);
    const db = readDB();
    const user = db.users.find((u) => u.username === String(body.username || '').trim());
    if (!user || !user.active || !verifyPassword(String(body.password || ''), user.salt, user.passwordHash)) {
      return fail(res, 401, '用户名或密码错误');
    }
    return ok(res, {
      token: issueToken(user, SECRET),
      user: { ...publicUser(user), permissions: ROLES[user.role] }
    });
  }

  if (req.method === 'GET' && p === '/api/auth/me') {
    const user = requireAuth(req, res);
    if (!user) return;
    return ok(res, { ...publicUser(user), permissions: ROLES[user.role] });
  }

  // 器材列表 / 新增
  if (p === '/api/equipment') {
    if (req.method === 'GET') {
      if (!requirePerm(req, res, 'view')) return;
      const db = readDB();
      const q = (url.searchParams.get('q') || '').trim().toLowerCase();
      const category = url.searchParams.get('category') || '';
      const status = url.searchParams.get('status') || '';
      let list = db.equipment;
      if (category) list = list.filter((e) => e.category === category);
      if (status) list = list.filter((e) => e.status === status);
      if (q) {
        list = list.filter((e) =>
          [e.code, e.name, e.brand, e.model, e.location, e.owner, e.remark]
            .join(' ')
            .toLowerCase()
            .includes(q)
        );
      }
      list = [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      return ok(res, list);
    }
    if (req.method === 'POST') {
      if (!requirePerm(req, res, 'edit')) return;
      const body = await readBody(req);
      const payload = sanitizeGearPayload(body);
      const errors = validateGear(payload);
      const db = readDB();
      if (db.equipment.some((e) => e.code.toLowerCase() === payload.code.toLowerCase())) {
        errors.code = '器材编号已存在';
      }
      if (Object.keys(errors).length) return fail(res, 422, '校验失败', errors);
      const ts = new Date().toISOString();
      const gear = {
        id: nextId(db, 'gear', 'G'),
        ...payload,
        attachments: [],
        createdAt: ts,
        updatedAt: ts
      };
      db.equipment.push(gear);
      writeDB(db);
      return ok(res, gear);
    }
  }

  // 单条器材
  const one = p.match(/^\/api\/equipment\/(G\d+)$/);
  if (one) {
    const id = one[1];
    const db = readDB();
    const gear = db.equipment.find((e) => e.id === id);
    if (!gear) return fail(res, 404, '器材不存在或已被删除');

    if (req.method === 'GET') {
      if (!requirePerm(req, res, 'view')) return;
      return ok(res, gear);
    }
    if (req.method === 'PUT') {
      if (!requirePerm(req, res, 'edit')) return;
      const body = await readBody(req);
      const payload = sanitizeGearPayload(body);
      const errors = validateGear(payload);
      const db2 = readDB();
      if (db2.equipment.some((e) => e.id !== id && e.code.toLowerCase() === payload.code.toLowerCase())) {
        errors.code = '器材编号已存在';
      }
      if (Object.keys(errors).length) return fail(res, 422, '校验失败', errors);
      const updated = mutateDB((d) => {
        const g = d.equipment.find((x) => x.id === id);
        Object.assign(g, payload, { updatedAt: new Date().toISOString() });
        return g;
      });
      return ok(res, updated);
    }
    if (req.method === 'DELETE') {
      if (!requirePerm(req, res, 'delete')) return;
      mutateDB((d) => {
        const g = d.equipment.find((x) => x.id === id);
        for (const a of g.attachments || []) {
          fs.rmSync(path.join(FILES_DIR, a.id), { force: true });
        }
        d.equipment = d.equipment.filter((x) => x.id !== id);
      });
      return ok(res, { id });
    }
  }

  // 附件上传 / 删除
  const upMatch = p.match(/^\/api\/equipment\/(G\d+)\/attachments$/);
  if (upMatch && req.method === 'POST') {
    if (!requirePerm(req, res, 'edit')) return;
    const id = upMatch[1];
    const body = await readBody(req);
    const name = String(body.name || '').trim();
    const dataB64 = String(body.dataBase64 || '').replace(/^data:[^,]+,/, '');
    if (!name) return fail(res, 422, '附件名称必填');
    if (!dataB64) return fail(res, 422, '附件内容为空');
    let buf;
    try {
      buf = Buffer.from(dataB64, 'base64');
    } catch {
      return fail(res, 400, '附件数据无法解析');
    }
    if (buf.length > 20 * 1024 * 1024) return fail(res, 413, '单个附件上限 20MB');

    const updated = mutateDB((d) => {
      const g = d.equipment.find((x) => x.id === id);
      if (!g) return null;
      const fileId = nextId(d, 'file', 'F');
      fs.writeFileSync(path.join(FILES_DIR, fileId), buf);
      const att = {
        id: fileId,
        name,
        mime: String(body.mime || 'application/octet-stream').slice(0, 100),
        size: buf.length,
        uploadedAt: new Date().toISOString()
      };
      g.attachments.push(att);
      g.updatedAt = att.uploadedAt;
      return { gear: g, attachment: att };
    });
    if (!updated) return fail(res, 404, '器材不存在或已被删除');
    return ok(res, updated);
  }

  const delAtt = p.match(/^\/api\/equipment\/(G\d+)\/attachments\/(F\d+)$/);
  if (delAtt && req.method === 'DELETE') {
    if (!requirePerm(req, res, 'edit')) return;
    const [, gearId, fileId] = delAtt;
    const result = mutateDB((d) => {
      const g = d.equipment.find((x) => x.id === gearId);
      if (!g) return 0;
      const before = g.attachments.length;
      g.attachments = g.attachments.filter((a) => a.id !== fileId);
      if (g.attachments.length !== before) {
        fs.rmSync(path.join(FILES_DIR, fileId), { force: true });
        g.updatedAt = new Date().toISOString();
      }
      return before - g.attachments.length;
    });
    if (!result) return fail(res, 404, '附件不存在');
    return ok(res, { gearId, fileId });
  }

  // 附件下载（需查看权限）
  const getFile = p.match(/^\/api\/files\/(F\d+)$/);
  if (getFile && req.method === 'GET') {
    if (!requirePerm(req, res, 'view')) return;
    const fileId = getFile[1];
    const db = readDB();
    let meta = null;
    for (const g of db.equipment) {
      const a = (g.attachments || []).find((x) => x.id === fileId);
      if (a) meta = a;
    }
    if (!meta) return fail(res, 404, '附件不存在');
    const fp = path.join(FILES_DIR, fileId);
    if (!fs.existsSync(fp)) return fail(res, 404, '附件文件缺失');
    const safe = meta.name.replace(/[\r\n"]/g, '_');
    const ascii = safe.replace(/[^\x20-\x7e]/g, '_') || 'attachment';
    res.writeHead(200, {
      'Content-Type': `${meta.mime || 'application/octet-stream'}; charset=utf-8`,
      'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safe)}`,
      'Content-Length': fs.statSync(fp).size,
      'Cache-Control': 'no-store'
    });
    return fs.createReadStream(fp).pipe(res);
  }

  // 统计
  if (req.method === 'GET' && p === '/api/stats') {
    if (!requirePerm(req, res, 'view')) return;
    const db = readDB();
    const byCategory = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
    const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0]));
    for (const e of db.equipment) {
      byCategory[e.category] = (byCategory[e.category] || 0) + 1;
      byStatus[e.status] = (byStatus[e.status] || 0) + 1;
    }
    return ok(res, {
      total: db.equipment.length,
      byCategory,
      byStatus,
      attachmentCount: db.equipment.reduce((n, e) => n + (e.attachments?.length || 0), 0),
      userCount: db.users.length
    });
  }

  // 用户管理（仅管理员）
  if (p === '/api/users' && req.method === 'GET') {
    if (!requirePerm(req, res, 'userAdmin')) return;
    const db = readDB();
    return ok(res, db.users.map(publicUser));
  }
  if (p === '/api/users' && req.method === 'POST') {
    if (!requirePerm(req, res, 'userAdmin')) return;
    const body = await readBody(req);
    const username = String(body.username || '').trim();
    const realName = String(body.realName || '').trim();
    const password = String(body.password || '');
    const role = body.role;
    const errors = {};
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) errors.username = '用户名为 3-20 位字母数字下划线';
    if (!realName) errors.realName = '姓名必填';
    if (password.length < 6) errors.password = '密码至少 6 位';
    if (!ROLES[role]) errors.role = '角色非法';
    const db = readDB();
    if (db.users.some((u) => u.username === username)) errors.username = '用户名已存在';
    if (Object.keys(errors).length) return fail(res, 422, '校验失败', errors);
    const user = {
      id: nextId(db, 'user', 'U'),
      username,
      realName,
      role,
      phone: String(body.phone || '').trim(),
      active: true,
      createdAt: new Date().toISOString(),
      ...hashPassword(password)
    };
    db.users.push(user);
    writeDB(db);
    return ok(res, publicUser(user));
  }
  const oneUser = p.match(/^\/api\/users\/(U\d+)$/);
  if (oneUser) {
    const uid = oneUser[1];
    if (req.method === 'PUT') {
      const me = requirePerm(req, res, 'userAdmin');
      if (!me) return;
      const body = await readBody(req);
      const errors = {};
      if (body.role && !ROLES[body.role]) errors.role = '角色非法';
      if (body.password != null && String(body.password).length < 6) errors.password = '密码至少 6 位';
      if (Object.keys(errors).length) return fail(res, 422, '校验失败', errors);
      const updated = mutateDB((d) => {
        const u = d.users.find((x) => x.id === uid);
        if (!u) return null;
        if (body.realName != null) u.realName = String(body.realName).trim();
        if (body.phone != null) u.phone = String(body.phone).trim();
        if (body.role) u.role = body.role;
        if (body.active != null) u.active = Boolean(body.active);
        if (body.password) Object.assign(u, hashPassword(String(body.password)));
        return publicUser(u);
      });
      if (!updated) return fail(res, 404, '用户不存在');
      return ok(res, updated);
    }
    if (req.method === 'DELETE') {
      const me = requirePerm(req, res, 'userAdmin');
      if (!me) return;
      if (me.id === uid) return fail(res, 400, '不能删除当前登录账号');
      const removed = mutateDB((d) => {
        const exists = d.users.some((x) => x.id === uid);
        d.users = d.users.filter((x) => x.id !== uid);
        return exists;
      });
      if (!removed) return fail(res, 404, '用户不存在');
      return ok(res, { id: uid });
    }
  }

  return fail(res, 404, '接口不存在');
}

// ---------- 静态资源 ----------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};
function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  const fp = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!fp.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.stat(fp, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 页面不存在');
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream',
      'Content-Length': st.size
    });
    fs.createReadStream(fp).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        return res.end();
      }
      return await handleApi(req, res, url);
    }
    return serveStatic(req, res, url);
  } catch (e) {
    return fail(res, e.status || 500, e.message || '服务器内部错误');
  }
});

server.listen(PORT, () => {
  console.log('');
  console.log('  🎬 演播室器材档案平台已启动');
  console.log(`  ➜  访问地址  http://localhost:${PORT}`);
  console.log('  ➜  演示账号  admin/admin123 · editor/edit123 · viewer/view123');
  console.log('');
});

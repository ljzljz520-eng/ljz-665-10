// 认证与权限：scrypt 口令哈希 + HMAC 签名令牌（零依赖）
import crypto from 'node:crypto';

// 角色权限：view 查看，edit 新增/修改，delete 删除，admin 用户管理
export const ROLES = {
  admin: { label: '系统管理员', view: true, edit: true, delete: true, userAdmin: true },
  editor: { label: '器材管理员', view: true, edit: true, delete: false, userAdmin: false },
  viewer: { label: '普通查看员', view: true, edit: false, delete: false, userAdmin: false }
};

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, passwordHash: hash };
}

export function verifyPassword(password, salt, passwordHash) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(passwordHash || '', 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// --- 轻量 JWT（HS256） ---
function b64url(input) {
  return Buffer.from(input).toString('base64url');
}

export function issueToken(user, secret, ttlSeconds = 8 * 3600) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(
    JSON.stringify({ sub: user.id, username: user.username, role: user.role, iat: now, exp: now + ttlSeconds })
  );
  const sig = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

export function verifyToken(token, secret) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, sig] = parts;
  const expected = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.exp || data.exp < Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch {
    return null;
  }
}

export function can(role, action) {
  return Boolean(ROLES[role]?.[action]);
}

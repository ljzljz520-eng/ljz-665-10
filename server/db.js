// 极简 JSON 文件数据库（零依赖）：data/gear.json 存元数据，data/files/ 存附件
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.join(__dirname, '..', 'data');
export const FILES_DIR = path.join(DATA_DIR, 'files');
export const DB_FILE = path.join(DATA_DIR, 'gear.json');

export const CATEGORIES = ['camera', 'light', 'audio', 'switcher'];
export const CATEGORY_LABELS = {
  camera: '摄像机',
  light: '灯光',
  audio: '收音',
  switcher: '切换台'
};
export const STATUSES = ['in_stock', 'borrowed', 'repair', 'scrapped'];
export const STATUS_LABELS = {
  in_stock: '在库',
  borrowed: '借用中',
  repair: '维修中',
  scrapped: '已报废'
};

const DEFAULT_DB = { meta: {}, users: [], equipment: [], seq: { user: 0, gear: 0, file: 0 } };

export function ensureStorage() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(FILES_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    writeDB(structuredClone(DEFAULT_DB));
  }
}

export function readDB() {
  ensureStorage();
  try {
    const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    return {
      meta: db.meta || {},
      users: db.users || [],
      equipment: db.equipment || [],
      seq: db.seq || { user: 0, gear: 0, file: 0 }
    };
  } catch {
    return structuredClone(DEFAULT_DB);
  }
}

export function writeDB(db) {
  const snapshot = JSON.stringify(db, null, 2);
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, snapshot);
  fs.renameSync(tmp, DB_FILE);
}

export function mutateDB(mutator) {
  const db = readDB();
  const result = mutator(db);
  writeDB(db);
  return result;
}

export function nextId(db, kind, prefix) {
  db.seq[kind] = (db.seq[kind] || 0) + 1;
  return `${prefix}${String(db.seq[kind]).padStart(4, '0')}`;
}

export function publicUser(u) {
  if (!u) return null;
  const { passwordHash, salt, ...rest } = u;
  return rest;
}

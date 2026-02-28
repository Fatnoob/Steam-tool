import fs from 'node:fs/promises';
import path from 'node:path';

const DB_DIR = path.join(process.cwd(), 'data', 'db');
const DB_PATH = path.join(DB_DIR, 'reviews-db.json');

const EMPTY_DB = {
  updatedAt: null,
  games: {},
  crawler: {
    running: false,
    startedAt: null,
    finishedAt: null,
    scanned: 0,
    stored: 0,
    failed: 0,
    message: 'idle',
  },
};

async function ensureDbFile() {
  await fs.mkdir(DB_DIR, { recursive: true });
  try {
    await fs.access(DB_PATH);
  } catch {
    await fs.writeFile(DB_PATH, JSON.stringify(EMPTY_DB, null, 2), 'utf8');
  }
}

export async function readDb() {
  await ensureDbFile();
  const raw = await fs.readFile(DB_PATH, 'utf8');
  try {
    return JSON.parse(raw);
  } catch {
    return structuredClone(EMPTY_DB);
  }
}

export async function writeDb(db) {
  const payload = { ...db, updatedAt: new Date().toISOString() };
  await ensureDbFile();
  await fs.writeFile(DB_PATH, JSON.stringify(payload, null, 2), 'utf8');
}

export async function upsertGameAnalysis(record) {
  const db = await readDb();
  db.games[String(record.appId)] = {
    ...record,
    storedAt: new Date().toISOString(),
  };
  await writeDb(db);
  return db.games[String(record.appId)];
}

export async function getGameAnalysis(appId) {
  const db = await readDb();
  return db.games[String(appId)] || null;
}

export async function getCrawlerStatus() {
  const db = await readDb();
  return db.crawler;
}

export async function updateCrawlerStatus(statusPatch) {
  const db = await readDb();
  db.crawler = {
    ...db.crawler,
    ...statusPatch,
  };
  await writeDb(db);
  return db.crawler;
}

export async function listStoredGames(limit = 50) {
  const db = await readDb();
  return Object.values(db.games)
    .sort((a, b) => new Date(b.storedAt || 0) - new Date(a.storedAt || 0))
    .slice(0, limit);
}

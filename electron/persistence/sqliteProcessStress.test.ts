import Database from 'better-sqlite3';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const nativeModule = require.resolve('better-sqlite3');
let dir: string;
let file: string;
let db: InstanceType<typeof Database>;
const children = new Set<ChildProcess>();

// Cada hijo carga el mismo módulo nativo que Vitest, pero tiene su propio
// proceso, handle SQLite y journal. No usa datos ni rutas de producción.
const worker = [
  "const Database = require(process.argv[1]);",
  "const db = new Database(process.argv[2]);",
  "const mode = process.argv[3];",
  "const owner = process.argv[4];",
  "db.pragma('busy_timeout = 5000');",
  "db.pragma('synchronous = FULL');",
  "if (mode === 'stress') {",
  "  const write = db.transaction((i) => {",
  "    db.prepare('INSERT INTO operations(owner, seq) VALUES (?, ?)').run(owner, i);",
  "    db.prepare('UPDATE counter SET value = value + 1 WHERE id = 1').run();",
  "  });",
  "  process.send('ready');",
  "  process.once('message', () => {",
  "    for (let i = 0; i < 100; i++) write.immediate(i);",
  "    db.close(); process.disconnect();",
  "  });",
  "} else if (mode === 'crash') {",
  "  db.exec('BEGIN IMMEDIATE');",
  "  db.prepare('UPDATE counter SET value = 999 WHERE id = 1').run();",
  "  db.prepare('INSERT INTO operations(owner, seq) VALUES (?, ?)').run(owner, 0);",
  "  process.send('ready');",
  "  setInterval(() => {}, 1000);",
  "} else {",
  "  db.exec('BEGIN EXCLUSIVE');",
  "  process.send('ready');",
  "  process.once('message', () => { db.exec('ROLLBACK'); db.close(); process.disconnect(); });",
  "}",
].join('\n');

function start(mode: string, owner: string) {
  const child = spawn(process.execPath, ['-e', worker, nativeModule, file, mode, owner], {
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    windowsHide: true,
  });
  children.add(child);
  let stderr = '';
  child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null; stderr: string }>((resolve) => {
    child.once('close', (code, signal) => { children.delete(child); resolve({ code, signal, stderr }); });
  });
  const ready = new Promise<void>((resolve, reject) => {
    child.once('message', message => {
      if (message === 'ready') resolve();
      else reject(new Error('Mensaje de proceso inesperado'));
    });
    child.once('error', reject);
    void exited.then(result => reject(new Error('Proceso finalizado antes de ready: ' + result.stderr)));
  });
  return { child, ready, exited };
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'traccion-process-stress-'));
  file = path.join(dir, 'stress.sqlite');
  db = new Database(file);
  db.pragma('journal_mode = DELETE');
  db.pragma('busy_timeout = 5000');
  db.exec('CREATE TABLE counter (id INTEGER PRIMARY KEY, value INTEGER NOT NULL); INSERT INTO counter VALUES (1, 0); CREATE TABLE operations (owner TEXT, seq INTEGER, PRIMARY KEY(owner, seq))');
});
afterEach(async () => {
  await Promise.all([...children].map(child => new Promise<void>(resolve => {
    child.once('close', () => resolve());
    child.kill('SIGKILL');
  })));
  db?.close();
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}, 20_000);

function counter() {
  return db.prepare('SELECT value FROM counter WHERE id = 1').get() as { value: number };
}
function integrity() {
  expect(db.pragma('quick_check')).toEqual([{ quick_check: 'ok' }]);
  expect(db.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }]);
}

describe('SQLite nativa · procesos independientes', () => {
  it('tres procesos realizan 300 transacciones sin perder ni duplicar operaciones', async () => {
    const peers = ['a', 'b', 'c'].map(owner => start('stress', owner));
    await Promise.all(peers.map(peer => peer.ready));
    for (const peer of peers) peer.child.send('start');
    const results = await Promise.all(peers.map(peer => peer.exited));
    for (const result of results) expect(result.code, result.stderr).toBe(0);
    expect(counter().value).toBe(300);
    expect(db.prepare('SELECT owner, COUNT(*) AS total FROM operations GROUP BY owner ORDER BY owner').all()).toEqual([
      { owner: 'a', total: 100 }, { owner: 'b', total: 100 }, { owner: 'c', total: 100 },
    ]);
    integrity();
  }, 45_000);

  it('recupera el rollback de una transacción no confirmada tras terminar abruptamente un proceso', async () => {
    db.exec('UPDATE counter SET value = 10 WHERE id = 1');
    const peer = start('crash', 'interrupted');
    await peer.ready;
    peer.child.kill('SIGKILL');
    expect(await peer.exited).toMatchObject({ code: null });
    expect(counter().value).toBe(10);
    expect(db.prepare("SELECT COUNT(*) AS total FROM operations WHERE owner = 'interrupted'").get()).toEqual({ total: 0 });
    integrity();
    db.exec('UPDATE counter SET value = value + 1 WHERE id = 1');
    expect(counter().value).toBe(11);
  }, 30_000);

  it('una reserva exclusiva de otro proceso no permite escribir hasta que se libera', async () => {
    const peer = start('exclusive', 'holder');
    await peer.ready;
    db.pragma('busy_timeout = 100');
    expect(() => db.exec('UPDATE counter SET value = 42 WHERE id = 1')).toThrow(/locked|busy/i);
    peer.child.send('release');
    expect(await peer.exited).toMatchObject({ code: 0 });
    expect(counter().value).toBe(0);
    db.exec('UPDATE counter SET value = 42 WHERE id = 1');
    expect(counter().value).toBe(42);
    integrity();
  }, 30_000);
});

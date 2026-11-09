import { DatabaseSync } from 'node:sqlite';
import { closeSync, fsyncSync, lstatSync, openSync, unlinkSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { approve, emptySnapshot, MemoryError, parseSnapshot, transactionResult } from './memory.ts';
import type { Approval, Snapshot, Store } from './memory.ts';

export const BUSY_TIMEOUT_MS = 250;
export const MAX_SNAPSHOT_BYTES = 1_048_576;
const SCHEMA_VERSION = 1;

function storageError(): MemoryError { return new MemoryError('STORAGE'); }
function pathCheck(path: string): void {
  if (typeof path !== 'string' || !isAbsolute(path) || path.includes('\0')) throw storageError();
}
function existingFile(path: string): void {
  pathCheck(path);
  if (!lstatSync(path).isFile()) throw storageError(); // rejects symlinks as well
}
function reserveFile(path: string): void {
  pathCheck(path);
  closeSync(openSync(path, 'wx', 0o600)); // never overwrite an existing file
}
function encode(snapshot: Snapshot): string {
  const payload = JSON.stringify(parseSnapshot(snapshot));
  if (Buffer.byteLength(payload) > MAX_SNAPSHOT_BYTES) throw new MemoryError('INVALID');
  return payload;
}

/** File paths and callbacks are trusted host configuration, never model/client input.
 * Use an owner-only directory on a local filesystem. No network filesystem support. */
export class SqliteStore implements Store {
  private db: DatabaseSync;
  private writing = false;
  private constructor(db: DatabaseSync) { this.db = db; }

  private static connect(path: string, readOnly: boolean): DatabaseSync {
    existingFile(path);
    const db = new DatabaseSync(path, { readOnly, timeout: BUSY_TIMEOUT_MS, allowExtension: false });
    try {
      db.exec('PRAGMA trusted_schema = OFF; PRAGMA synchronous = FULL;');
      return db;
    } catch { db.close(); throw storageError(); }
  }

  /** Explicit initialization only; ordinary open never creates or repairs a database. */
  static create(path: string, approval?: Approval): SqliteStore {
    approve(approval);
    let db: DatabaseSync | undefined;
    try {
      reserveFile(path);
      db = SqliteStore.connect(path, false);
      db.exec(`BEGIN IMMEDIATE;
        CREATE TABLE memory_state (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          schema_version INTEGER NOT NULL CHECK (schema_version = 1),
          revision INTEGER NOT NULL CHECK (revision >= 0 AND revision <= 9007199254740991),
          payload TEXT NOT NULL
        ) STRICT;`);
      db.prepare('INSERT INTO memory_state VALUES (1, ?, 0, ?)').run(SCHEMA_VERSION, encode(emptySnapshot()));
      db.exec('PRAGMA user_version = 1; COMMIT;');
      return new SqliteStore(db);
    } catch {
      try { db?.close(); } catch { /* keep the original sanitized failure */ }
      // Leave an interrupted initialization in place for explicit inspection, never reset it.
      throw storageError();
    }
  }

  static open(path: string, options: { readOnly?: boolean } = {}): SqliteStore {
    let db: DatabaseSync | undefined;
    try {
      if (!options || typeof options !== 'object' || Array.isArray(options) ||
          ![Object.prototype, null].includes(Object.getPrototypeOf(options)) ||
          Reflect.ownKeys(options).some(key => key !== 'readOnly')) throw storageError();
      const flag = Object.getOwnPropertyDescriptor(options, 'readOnly');
      if (flag && (!Object.hasOwn(flag, 'value') || typeof flag.value !== 'boolean')) throw storageError();
      db = SqliteStore.connect(path, flag?.value === true);
      const store = new SqliteStore(db);
      store.inspect();
      return store;
    } catch {
      try { db?.close(); } catch { /* sanitized below */ }
      throw storageError();
    }
  }

  private inspect(): { snapshot: Snapshot; revision: number } {
    const version = this.db.prepare('PRAGMA user_version').get();
    if (version?.user_version !== SCHEMA_VERSION) throw storageError();
    const rows = this.db.prepare('SELECT id, schema_version, revision, payload FROM memory_state LIMIT 2').all();
    const row = rows[0];
    if (rows.length !== 1 || row.id !== 1 || row.schema_version !== SCHEMA_VERSION ||
        typeof row.revision !== 'number' || !Number.isSafeInteger(row.revision) || row.revision < 0 ||
        typeof row.payload !== 'string' || Buffer.byteLength(row.payload) > MAX_SNAPSHOT_BYTES) throw storageError();
    return { snapshot: parseSnapshot(JSON.parse(row.payload)), revision: row.revision };
  }

  load(): Snapshot {
    try { return this.inspect().snapshot; } catch { throw storageError(); }
  }

  transact<T>(change: (snapshot: Snapshot) => T): T {
    if (this.writing) throw storageError();
    this.writing = true;
    let began = false;
    try {
      this.db.exec('BEGIN IMMEDIATE'); // reserve writer BEFORE reading the current state
      began = true;
      let current: { snapshot: Snapshot; revision: number };
      try { current = this.inspect(); } catch { throw storageError(); }
      if (current.revision === Number.MAX_SAFE_INTEGER) throw storageError();
      // Clone the result before commit: a Promise or non-cloneable result aborts the write.
      const result = transactionResult(change(current.snapshot));
      const payload = encode(current.snapshot);
      const update = this.db.prepare('UPDATE memory_state SET payload = ?, revision = revision + 1 WHERE id = 1 AND revision = ?')
        .run(payload, current.revision);
      if (update.changes !== 1) throw storageError();
      this.db.exec('COMMIT');
      return result;
    } catch (e) {
      if (began) {
        try { this.db.exec('ROLLBACK'); }
        catch { try { this.db.close(); } catch { /* unusable connection stays failed */ } }
      }
      throw e instanceof MemoryError ? e : storageError();
    } finally { this.writing = false; }
  }

  /** Consistent SQLite-supported backup; fails rather than overwriting a destination. */
  backupTo(destination: string, approval?: Approval): void {
    approve(approval);
    let reserved = false;
    try {
      if (this.writing) throw storageError();
      this.inspect();
      reserveFile(destination); reserved = true;
      this.db.prepare('VACUUM INTO ?').run(destination);
      const verified = SqliteStore.open(destination, { readOnly: true });
      try { verified.load(); } finally { verified.close(); }
      const fd = openSync(destination, 'r');
      try { fsyncSync(fd); } finally { closeSync(fd); }
    } catch {
      if (reserved) { try { unlinkSync(destination); } catch { /* incomplete backup is not reported as success */ } }
      throw storageError();
    }
  }

  /** Restore to a NEW path, never replace an active database. Returned handle is read-only.
   * Live delivery must remain paused until an operator reconciles the restored ledger. */
  static restore(source: string, destination: string, approval?: Approval): SqliteStore {
    approve(approval);
    const original = SqliteStore.open(source, { readOnly: true });
    try { original.backupTo(destination, approval); }
    finally { original.close(); }
    return SqliteStore.open(destination, { readOnly: true });
  }

  close(): void {
    try {
      if (this.writing) throw storageError();
      if (this.db.isOpen) this.db.close();
    } catch { throw storageError(); }
  }
}

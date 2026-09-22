'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { EXPECTED_LOAN_IDS, loadSeed, runSeed, validateSeed, parseArgs } = require('./setup-firebase.cjs');

class FakeSnapshot {
  constructor(id, data) { this.id = id; this._data = data; this.exists = data !== undefined; }
  data() { return this._data; }
}
class FakeCollection {
  constructor(store, name) { this.store = store; this.name = name; }
  doc(id) { return { collection: this.name, id: id || `audit-${++this.store.sequence}` }; }
  async get() {
    const entries = [...(this.store.data.get(this.name) || new Map()).entries()];
    return { docs: entries.map(([id, data]) => new FakeSnapshot(id, structuredClone(data))) };
  }
}
class FakeDb {
  constructor(initial = {}) {
    this.data = new Map(Object.entries(initial).map(([name, values]) => [name, new Map(Object.entries(values))]));
    this.sequence = 0;
  }
  collection(name) { return new FakeCollection(this, name); }
  async runTransaction(callback) {
    const staged = new Map([...this.data.entries()].map(([name, docs]) => [name, new Map(docs)]));
    const transaction = {
      get: async (ref) => {
        if (!ref.id) {
          const entries = [...(staged.get(ref.name) || new Map()).entries()];
          return { docs: entries.map(([id, data]) => new FakeSnapshot(id, structuredClone(data))) };
        }
        return new FakeSnapshot(ref.id, structuredClone(staged.get(ref.collection)?.get(ref.id)));
      },
      set: (ref, value) => {
        if (!staged.has(ref.collection)) staged.set(ref.collection, new Map());
        staged.get(ref.collection).set(ref.id, structuredClone(value));
      },
      delete: (ref) => {
        staged.get(ref.collection)?.delete(ref.id);
      }
    };
    const result = await callback(transaction);
    this.data = staged;
    return result;
  }
}

const seedPath = path.join(__dirname, 'PRIVATE-loan-seed.json');
function tempDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'family-finance-admin-')); }
function fixedNow() { return new Date('2026-09-22T12:34:56.789Z'); }

test('private seed has exactly the six required, internally consistent loans', () => {
  const loans = loadSeed(seedPath);
  assert.deepEqual(loans.map((loan) => loan.id), EXPECTED_LOAN_IDS);
});

test('invalid seed is rejected before any database operation', () => {
  const source = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  const raw = Array.isArray(source) ? source : source.loans;
  raw[0].totalRemaining += 1;
  assert.throws(() => validateSeed(raw), /totalRemaining/);
});

test('dry run lists six loans and does not create a backup or write Firestore', async () => {
  const dir = tempDir();
  const db = new FakeDb({ loans: { old: { totalRemaining: 42 } } });
  const result = await runSeed({ apply: false, replace: true, date: '2026-09-22', seedPath, backupDir: dir, db, now: fixedNow });
  assert.equal(result.mode, 'dry-run');
  assert.equal(result.loans.length, 6);
  assert.equal((await db.collection('loans').get()).docs.length, 1);
  assert.equal(fs.readdirSync(dir).length, 0);
});

test('replace backs up current data and atomically writes six loans plus six audit records', async () => {
  const dir = tempDir();
  const db = new FakeDb({
    loans: { 'sber-1': { revision: 7, totalRemaining: 1 }, stale: { revision: 3 } },
    loanReconciliations: { prior: { loanId: 'sber-1' } }
  });
  const result = await runSeed({ apply: true, replace: true, date: '2026-09-22', seedPath, backupDir: dir, db, now: fixedNow });
  assert.equal(result.mode, 'applied');
  assert.equal((await db.collection('loans').get()).docs.length, 6);
  assert.equal((await db.collection('loanReconciliations').get()).docs.length, 7);
  const first = (await db.collection('loans').get()).docs.find((doc) => doc.id === 'sber-1').data();
  assert.equal(first.revision, 8);
  assert.equal(first.asOfDate, '2026-09-22');
  assert.equal(first.breakdownVerified, false);
  const backup = JSON.parse(fs.readFileSync(result.backupPath, 'utf8'));
  assert.equal(backup.loans.length, 2);
  assert.equal(backup.loanReconciliations.length, 1);
});

test('a backup failure leaves Firestore untouched', async () => {
  const dir = tempDir();
  const blocked = path.join(dir, 'backup-file');
  fs.writeFileSync(blocked, 'not a directory');
  const db = new FakeDb({ loans: { old: { totalRemaining: 42 } } });
  await assert.rejects(() => runSeed({ apply: true, replace: true, date: '2026-09-22', seedPath, backupDir: blocked, db, now: fixedNow }));
  assert.equal((await db.collection('loans').get()).docs.length, 1);
});

test('seed refuses a missing replace flag or invalid date', async () => {
  await assert.rejects(() => runSeed({ apply: false, replace: false, date: '2026-09-22', seedPath }), /--replace/);
  await assert.rejects(() => runSeed({ apply: false, replace: true, date: '22-09-2026', seedPath }), /YYYY-MM-DD/);
});

test('role parsing accepts one account email', () => {
  const options = parseArgs(['role', '--email', 'lera@example.test', '--role', 'lera', '--apply']);
  assert.equal(options.email, 'lera@example.test');
  assert.equal(options.role, 'lera');
  assert.equal(options.apply, true);
});


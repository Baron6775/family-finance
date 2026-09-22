#!/usr/bin/env node
'use strict';

// Local-only Firebase administration helper. Never commit a service-account key,
// backup, or PRIVATE-loan-seed.json.
const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ID = 'family-finance-72604';
const EXPECTED_LOAN_IDS = ['sber-1', 'sber-2', 'sber-3', 'sber-4', 'artem-5', 'tetya-tanya'];
const MONEY_FIELDS = ['initialAmount', 'bodyDebt', 'interestRemaining', 'penalty', 'monthlyPayment', 'totalRemaining'];

function usage() {
  return [
    'Usage:',
    '  node setup-firebase.cjs seed --replace --date 2026-09-22          # dry run',
    '  node setup-firebase.cjs seed --replace --date 2026-09-22 --apply  # writes Firestore',
    '  node setup-firebase.cjs role --email <account email> --role andrey|lera --apply',
    '',
    'For operations that contact Firebase, set FIREBASE_SERVICE_ACCOUNT_PATH to a local Service Account JSON file.'
  ].join('\n');
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = { command, apply: false, replace: false };
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === '--apply') options.apply = true;
    else if (token === '--replace') options.replace = true;
    else if (token === '--date' || token === '--uid' || token === '--email' || token === '--role') {
      options[token.slice(2)] = rest[++index];
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }
  return options;
}

function isIsoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function asMoney(value, field, loanId) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`Loan ${loanId}: ${field} must be a non-negative number.`);
  }
  return Math.round(value * 100) / 100;
}

function validateSeed(rawLoans) {
  if (!Array.isArray(rawLoans) || rawLoans.length !== EXPECTED_LOAN_IDS.length) {
    throw new Error(`Seed must contain exactly ${EXPECTED_LOAN_IDS.length} loans.`);
  }

  const seen = new Set();
  const byId = new Map();
  for (const raw of rawLoans) {
    if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !raw.id.trim()) {
      throw new Error('Every loan must have a non-empty ID.');
    }
    if (seen.has(raw.id)) throw new Error(`Duplicate loan ID: ${raw.id}`);
    seen.add(raw.id);
    if (typeof raw.name !== 'string' || !raw.name.trim() || typeof raw.bank !== 'string' || !raw.bank.trim()) {
      throw new Error(`Loan ${raw.id}: name and bank are required.`);
    }
    if (typeof raw.rate !== 'number' || !Number.isFinite(raw.rate) || raw.rate < 0) {
      throw new Error(`Loan ${raw.id}: rate must be a non-negative number.`);
    }

    const loan = { ...raw, id: raw.id, rate: Math.round(raw.rate * 10000) / 10000 };
    for (const field of MONEY_FIELDS) loan[field] = asMoney(raw[field], field, raw.id);
    if (loan.initialAmount <= 0) throw new Error(`Loan ${raw.id}: initialAmount must be greater than zero.`);
    if (loan.bodyDebt > loan.initialAmount) throw new Error(`Loan ${raw.id}: bodyDebt cannot exceed initialAmount.`);

    const calculatedTotal = Math.round((loan.bodyDebt + loan.interestRemaining + loan.penalty) * 100) / 100;
    if (calculatedTotal !== loan.totalRemaining) {
      throw new Error(`Loan ${raw.id}: totalRemaining must equal bodyDebt + interestRemaining + penalty.`);
    }

    if (raw.isPersonalDebt) {
      if (raw.nextPaymentDate !== null || loan.monthlyPayment !== 0) {
        throw new Error(`Loan ${raw.id}: personal loans must have no scheduled payment.`);
      }
    } else {
      if (!isIsoDate(raw.nextPaymentDate)) throw new Error(`Loan ${raw.id}: nextPaymentDate is required.`);
      if (!isIsoDate(raw.closeDate)) throw new Error(`Loan ${raw.id}: closeDate is required.`);
      if (!raw.nextPaymentBreakdown || typeof raw.nextPaymentBreakdown !== 'object') {
        throw new Error(`Loan ${raw.id}: nextPaymentBreakdown is required.`);
      }
      for (const field of ['body', 'interest', 'penalty']) asMoney(raw.nextPaymentBreakdown[field], `nextPaymentBreakdown.${field}`, raw.id);
    }
    byId.set(loan.id, loan);
  }

  for (const id of EXPECTED_LOAN_IDS) if (!byId.has(id)) throw new Error(`Seed is missing loan ${id}.`);
  return EXPECTED_LOAN_IDS.map((id) => byId.get(id));
}

function loadSeed(seedPath) {
  let source;
  try {
    source = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  } catch (error) {
    throw new Error(`Cannot read local seed ${seedPath}: ${error.message}`);
  }
  return validateSeed(Array.isArray(source) ? source : source.loans);
}

function cloneForJson(value) {
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(cloneForJson);
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneForJson(entry)]));
}

async function snapshotCollections(db) {
  const [loans, reconciliations] = await Promise.all([
    db.collection('loans').get(),
    db.collection('loanReconciliations').get()
  ]);
  return {
    loans: loans.docs.map((doc) => ({ id: doc.id, data: cloneForJson(doc.data()) })),
    loanReconciliations: reconciliations.docs.map((doc) => ({ id: doc.id, data: cloneForJson(doc.data()) }))
  };
}

function writeBackup(backupDir, snapshot, now = () => new Date()) {
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = now().toISOString().replace(/[:.]/g, '-');
  const file = path.join(backupDir, `firestore-loans-before-replace-${stamp}.json`);
  const backup = {
    createdAt: now().toISOString(),
    projectId: PROJECT_ID,
    purpose: 'before-loan-seed-replacement',
    ...snapshot
  };
  fs.writeFileSync(file, `${JSON.stringify(backup, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  return file;
}

async function replaceLoans({ db, loans, date, backupPath, now = () => new Date() }) {
  return db.runTransaction(async (transaction) => {
    const existingLoans = await transaction.get(db.collection('loans'));
    const references = loans.map((loan) => db.collection('loans').doc(loan.id));
    const previous = await Promise.all(references.map((reference) => transaction.get(reference)));
    const createdAt = now();
    const results = [];

    loans.forEach((loan, index) => {
      const before = previous[index].exists ? cloneForJson(previous[index].data()) : null;
      const revision = (Number.isInteger(before?.revision) && before.revision >= 0 ? before.revision : 0) + 1;
      const after = { ...loan, asOfDate: date, revision, breakdownVerified: false };
      transaction.set(references[index], after);
      transaction.set(db.collection('loanReconciliations').doc(), {
        loanId: loan.id,
        date,
        source: 'restored-from-original',
        backupFile: path.basename(backupPath),
        before,
        after: cloneForJson(after),
        createdAt
      });
      results.push({ id: loan.id, revision });
    });
    for (const document of existingLoans.docs) {
      if (!EXPECTED_LOAN_IDS.includes(document.id)) transaction.delete(db.collection('loans').doc(document.id));
    }
    return results;
  });
}

function createAdmin() {
  const keyPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (!keyPath) throw new Error('Set FIREBASE_SERVICE_ACCOUNT_PATH to a local Service Account JSON file.');
  const resolvedKeyPath = path.resolve(keyPath);
  if (!fs.existsSync(resolvedKeyPath)) throw new Error(`Service Account file was not found: ${resolvedKeyPath}`);
  let credentials;
  try {
    credentials = JSON.parse(fs.readFileSync(resolvedKeyPath, 'utf8'));
  } catch (error) {
    throw new Error(`Cannot read Service Account JSON: ${error.message}`);
  }
  if (!credentials.project_id || !credentials.client_email || !credentials.private_key) {
    throw new Error('Service Account JSON is missing project_id, client_email, or private_key.');
  }
  let admin;
  try {
    admin = require('firebase-admin');
  } catch {
    throw new Error('firebase-admin is not installed. Run npm install in this folder first.');
  }
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(credentials), projectId: credentials.project_id });
  return admin;
}

async function runSeed({ apply, replace, date, seedPath, backupDir, db, now }) {
  if (!replace) throw new Error('For safety, seed requires --replace.');
  if (!isIsoDate(date)) throw new Error('seed requires --date in YYYY-MM-DD format.');
  const loans = loadSeed(seedPath);
  if (!apply) return { mode: 'dry-run', date, loans: loans.map((loan) => ({ id: loan.id, name: loan.name, totalRemaining: loan.totalRemaining })) };
  if (!db) throw new Error('Firestore database connection is required for --apply.');

  const snapshot = await snapshotCollections(db);
  const backupPath = writeBackup(backupDir, snapshot, now);
  const written = await replaceLoans({ db, loans, date, backupPath, now });
  return { mode: 'applied', date, backupPath, written };
}

async function runRole(options) {
  if (!options.apply) throw new Error('role requires --apply.');
  if ((!options.uid && !options.email) || (options.uid && options.email) || !['andrey', 'lera'].includes(options.role)) {
    throw new Error('role requires exactly one of --uid or --email, plus --role andrey|lera.');
  }
  const admin = createAdmin();
  const user = options.uid ? await admin.auth().getUser(options.uid) : await admin.auth().getUserByEmail(options.email);
  await admin.auth().setCustomUserClaims(user.uid, { ...(user.customClaims || {}), familyRole: options.role });
  return { uid: user.uid, email: user.email, familyRole: options.role };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.command === 'seed') {
    const seedPath = path.join(__dirname, 'PRIVATE-loan-seed.json');
    const result = await runSeed({
      ...options,
      seedPath,
      backupDir: path.join(__dirname, 'backups'),
      db: options.apply ? createAdmin().firestore() : null
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (options.command === 'role') {
    console.log(JSON.stringify(await runRole(options), null, 2));
    return;
  }
  console.log(usage());
  process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { EXPECTED_LOAN_IDS, validateSeed, loadSeed, snapshotCollections, writeBackup, replaceLoans, runSeed, parseArgs, isIsoDate };


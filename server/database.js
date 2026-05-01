/**
 * Database module — JSON file persistence.
 *
 * Design decisions:
 *  - Amounts stored as INTEGER (paise / smallest currency unit) to avoid
 *    floating-point rounding errors.  The API layer converts between
 *    rupees (float) ↔ paise (int) at the boundary.
 *  - An `idempotency_keys` dictionary prevents duplicate expense creation
 *    when the client retries a POST request.
 *  - Data is saved to a JSON file on disk.
 */

import path from 'node:path';
import fs from 'node:fs';

const DB_PATH = process.env.DB_PATH || './data/db.json';

let dbState = {
  expenses: [],
  idempotency_keys: {} // key -> { expense_id, response_body, created_at }
};

export function createDatabase(dbPath = DB_PATH) {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (fs.existsSync(dbPath)) {
    try {
      const data = fs.readFileSync(dbPath, 'utf8');
      dbState = JSON.parse(data);
    } catch (err) {
      console.error('Failed to read db file, starting fresh', err);
    }
  } else {
    saveDatabase(dbPath);
  }

  // We'll return an object that holds the path, so functions can save it.
  return { path: dbPath };
}

function saveDatabase(dbPath) {
  try {
    fs.writeFileSync(dbPath, JSON.stringify(dbState, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to write db file', err);
  }
}

export function insertExpense(db, { id, amount, category, description, date }) {
  const newExpense = {
    id,
    amount,
    category,
    description,
    date,
    created_at: new Date().toISOString()
  };
  dbState.expenses.push(newExpense);
  saveDatabase(db.path);
}

export function getExpenses(db, { category, sort } = {}) {
  let results = [...dbState.expenses];

  if (category) {
    results = results.filter(e => e.category === category);
  }

  if (sort === 'date_desc' || !sort) {
    results.sort((a, b) => {
      const cmp = new Date(b.date).getTime() - new Date(a.date).getTime();
      if (cmp !== 0) return cmp;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  } else if (sort === 'date_asc') {
    results.sort((a, b) => {
      const cmp = new Date(a.date).getTime() - new Date(b.date).getTime();
      if (cmp !== 0) return cmp;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  }

  return results;
}

export function getSummary(db) {
  const summaryMap = {};
  for (const exp of dbState.expenses) {
    if (!summaryMap[exp.category]) {
      summaryMap[exp.category] = { category: exp.category, count: 0, total_paise: 0 };
    }
    summaryMap[exp.category].count++;
    summaryMap[exp.category].total_paise += exp.amount;
  }
  return Object.values(summaryMap).sort((a, b) => b.total_paise - a.total_paise);
}

export function findIdempotencyKey(db, key) {
  return dbState.idempotency_keys[key];
}

export function saveIdempotencyKey(db, { key, expenseId, responseBody }) {
  dbState.idempotency_keys[key] = {
    key,
    expense_id: expenseId,
    response_body: responseBody,
    created_at: new Date().toISOString()
  };
  saveDatabase(db.path);
}

export function purgeOldIdempotencyKeys(db, olderThanHours = 24) {
  const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000).toISOString();
  let changed = false;
  for (const key in dbState.idempotency_keys) {
    if (dbState.idempotency_keys[key].created_at < cutoff) {
      delete dbState.idempotency_keys[key];
      changed = true;
    }
  }
  if (changed) {
    saveDatabase(db.path);
  }
}

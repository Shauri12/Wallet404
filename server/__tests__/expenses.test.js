/**
 * Integration tests for the Expense Tracker API.
 *
 * Uses supertest to make HTTP requests against the Express app
 * with an in-memory SQLite database (via :memory: path).
 */

import { jest } from '@jest/globals';

import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const testDbPath = path.join(os.tmpdir(), `test-db-${Date.now()}.json`);
process.env.DB_PATH = testDbPath;
process.env.NODE_ENV = 'test';

const { default: request } = await import('supertest');
const { app, db } = await import('../index.js');

afterAll(() => {
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
});

describe('POST /api/expenses', () => {
  const validExpense = {
    amount: 150.50,
    category: 'Food',
    description: 'Lunch',
    date: '2026-04-20',
  };

  test('creates a new expense and returns 201', async () => {
    const res = await request(app)
      .post('/api/expenses')
      .send(validExpense)
      .set('Idempotency-Key', 'test-key-1');

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.amount).toBe(150.50);
    expect(res.body.category).toBe('Food');
    expect(res.body.description).toBe('Lunch');
    expect(res.body.date).toBe('2026-04-20');
  });

  test('idempotency: duplicate key returns same response without creating duplicate', async () => {
    const key = 'idempotent-key-unique';
    const res1 = await request(app)
      .post('/api/expenses')
      .send(validExpense)
      .set('Idempotency-Key', key);

    const res2 = await request(app)
      .post('/api/expenses')
      .send(validExpense)
      .set('Idempotency-Key', key);

    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);
    expect(res1.body.id).toBe(res2.body.id);
  });

  test('validation: rejects missing amount', async () => {
    const res = await request(app)
      .post('/api/expenses')
      .send({ category: 'Food', date: '2026-04-20' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  test('validation: rejects negative amount', async () => {
    const res = await request(app)
      .post('/api/expenses')
      .send({ ...validExpense, amount: -50 });

    expect(res.status).toBe(400);
  });

  test('validation: rejects missing category', async () => {
    const res = await request(app)
      .post('/api/expenses')
      .send({ amount: 100, date: '2026-04-20' });

    expect(res.status).toBe(400);
  });

  test('validation: rejects missing date', async () => {
    const res = await request(app)
      .post('/api/expenses')
      .send({ amount: 100, category: 'Food' });

    expect(res.status).toBe(400);
  });

  test('validation: rejects invalid date format', async () => {
    const res = await request(app)
      .post('/api/expenses')
      .send({ ...validExpense, date: '20-04-2026' });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/expenses', () => {
  test('returns a list of expenses', async () => {
    const res = await request(app).get('/api/expenses');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('expenses');
    expect(Array.isArray(res.body.expenses)).toBe(true);
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('count');
  });

  test('filters by category', async () => {
    // Add a Transport expense
    await request(app)
      .post('/api/expenses')
      .send({ amount: 75, category: 'Transport', description: 'Cab', date: '2026-04-21' })
      .set('Idempotency-Key', 'filter-test-1');

    const res = await request(app).get('/api/expenses?category=Transport');

    expect(res.status).toBe(200);
    res.body.expenses.forEach(exp => {
      expect(exp.category).toBe('Transport');
    });
  });

  test('sorts by date descending by default', async () => {
    const res = await request(app).get('/api/expenses');

    expect(res.status).toBe(200);
    const dates = res.body.expenses.map(e => e.date);
    const sorted = [...dates].sort((a, b) => b.localeCompare(a));
    expect(dates).toEqual(sorted);
  });
});

describe('GET /api/expenses/summary', () => {
  test('returns category-wise summary', async () => {
    const res = await request(app).get('/api/expenses/summary');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('summary');
    expect(Array.isArray(res.body.summary)).toBe(true);
    expect(res.body).toHaveProperty('grandTotal');

    if (res.body.summary.length > 0) {
      expect(res.body.summary[0]).toHaveProperty('category');
      expect(res.body.summary[0]).toHaveProperty('count');
      expect(res.body.summary[0]).toHaveProperty('total');
    }
  });
});

describe('GET /api/health', () => {
  test('returns ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

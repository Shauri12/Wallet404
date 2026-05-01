/**
 * Expense API routes.
 *
 * POST /api/expenses   — Create an expense (idempotent via Idempotency-Key header)
 * GET  /api/expenses   — List expenses (optional: ?category=...&sort=date_desc)
 * GET  /api/expenses/summary — Category-wise summary
 */

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
  insertExpense,
  getExpenses,
  getSummary,
  findIdempotencyKey,
  saveIdempotencyKey,
} from '../database.js';
import { validateExpense } from '../middleware/validation.js';

/**
 * Convert rupees (float) → paise (integer).
 * Uses Math.round to avoid floating-point drift (e.g. 19.99 * 100 = 1998.9999…).
 */
function toPaise(rupees) {
  return Math.round(rupees * 100);
}

/** Convert paise (integer) → rupees (float, 2 decimal places). */
function toRupees(paise) {
  return Number((paise / 100).toFixed(2));
}

/** Format an expense row from DB format → API format. */
function formatExpense(row) {
  return {
    id: row.id,
    amount: toRupees(row.amount),
    category: row.category,
    description: row.description,
    date: row.date,
    created_at: row.created_at,
  };
}

export default function expenseRoutes(db) {
  const router = Router();

  // ── POST /api/expenses ───────────────────────────────────────────
  router.post('/', validateExpense, (req, res) => {
    try {
      const idempotencyKey = req.headers['idempotency-key'];

      // If the client supplied an idempotency key, check for a prior response
      if (idempotencyKey) {
        const existing = findIdempotencyKey(db, idempotencyKey);
        if (existing) {
          // Return the original response — do NOT create a duplicate
          console.warn(`[IDEMPOTENCY] Duplicate request blocked for key: ${idempotencyKey}`);
          const cached = JSON.parse(existing.response_body);
          return res.status(409).json(cached); // 409 Conflict logic applied conceptually, returning cached
        }
      }

      const { amount, category, description, date } = req.validatedExpense;
      const id = uuidv4();
      const amountPaise = toPaise(amount);

      insertExpense(db, { id, amount: amountPaise, category, description, date });

      const response = formatExpense({
        id,
        amount: amountPaise,
        category,
        description,
        date,
        created_at: new Date().toISOString(),
      });

      const responseBody = {
        success: true,
        data: response,
        error: null
      };

      // Cache the response under the idempotency key
      if (idempotencyKey) {
        saveIdempotencyKey(db, {
          key: idempotencyKey,
          expenseId: id,
          responseBody: JSON.stringify(responseBody),
        });
      }

      return res.status(201).json(responseBody);
    } catch (err) {
      console.error('[POST /expenses] Error:', err);
      return res.status(500).json({ success: false, data: null, error: 'Internal server error' });
    }
  });

  // ── GET /api/expenses ────────────────────────────────────────────
  router.get('/', (req, res) => {
    try {
      const { category, sort, page = 1, limit = 100 } = req.query;
      
      // Pagination logic
      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.max(1, parseInt(limit, 10) || 100);

      const rows = getExpenses(db, { category: category || undefined, sort: sort || 'date_desc' });
      const expenses = rows.map(formatExpense);
      
      const startIndex = (pageNum - 1) * limitNum;
      const paginatedExpenses = expenses.slice(startIndex, startIndex + limitNum);

      return res.json({
        success: true,
        data: {
          expenses: paginatedExpenses,
          total: expenses.reduce((sum, e) => sum + e.amount, 0),
          count: expenses.length,
          page: pageNum,
          totalPages: Math.ceil(expenses.length / limitNum)
        },
        error: null
      });
    } catch (err) {
      console.error('[GET /expenses] Error:', err);
      return res.status(500).json({ success: false, data: null, error: 'Internal server error' });
    }
  });

  // ── GET /api/expenses/summary ────────────────────────────────────
  router.get('/summary', (req, res) => {
    try {
      const rows = getSummary(db);

      const summary = rows.map((r) => ({
        category: r.category,
        count: r.count,
        total: toRupees(r.total_paise),
      }));

      const grandTotal = summary.reduce((s, r) => s + r.total, 0);

      return res.json({ 
        success: true, 
        data: { summary, grandTotal: Number(grandTotal.toFixed(2)) },
        error: null 
      });
    } catch (err) {
      console.error('[GET /expenses/summary] Error:', err);
      return res.status(500).json({ success: false, data: null, error: 'Internal server error' });
    }
  });

  return router;
}

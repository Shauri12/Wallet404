/**
 * Expense Tracker — main server entry point.
 *
 * Serves:
 *  - REST API at /api/expenses
 *  - Static frontend from ../public
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase, purgeOldIdempotencyKeys } from './database.js';
import expenseRoutes from './routes/expenses.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// ── Database ───────────────────────────────────────────────────────
const db = createDatabase();

// Periodically clean up stale idempotency keys (every 1 hour)
setInterval(() => {
  try {
    purgeOldIdempotencyKeys(db, 24);
  } catch (err) {
    console.error('Idempotency key purge failed:', err);
  }
}, 60 * 60 * 1000);

// ── Express app ────────────────────────────────────────────────────
const app = express();

// Security headers
app.use(helmet({
  contentSecurityPolicy: false,   // relaxed for the embedded frontend
}));

// CORS — allow all origins in dev; lock down in production
app.use(cors());

// Custom Request Logger with Performance Measurement
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} - Status: ${res.statusCode} - ${ms}ms`);
  });
  next();
});

// Body parsing
app.use(express.json());

// ── API routes ─────────────────────────────────────────────────────
app.use('/api/expenses', expenseRoutes(db));

// Health check
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

// ── Static frontend ───────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '..', 'public')));

// SPA fallback — serve index.html for any non-API route
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ── Global error handler ──────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start server ──────────────────────────────────────────────────
if (NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`\n  🚀 Expense Tracker running at http://localhost:${PORT}\n`);
  });
}

// Export for testing
export { app, db };

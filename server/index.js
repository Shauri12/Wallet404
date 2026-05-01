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

// ── Static frontend ───────────────────────────────────────────────
const publicPath = path.resolve('public');
app.use(express.static(publicPath));

// Health check
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

// API routes — defined AFTER static so they don't get shadowed
app.use('/api/expenses', expenseRoutes(db));

// SPA fallback — serve index.html for any non-API route
app.get('*', (req, res) => {
  const indexPath = path.join(publicPath, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      console.error(`Failed to send index.html: ${err.message}`);
      res.status(404).send('Frontend not found. Please ensure the public directory exists.');
    }
  });
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

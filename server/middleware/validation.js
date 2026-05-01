/**
 * Request validation middleware for expense endpoints.
 *
 * Validates:
 *  - amount: required, positive number
 *  - category: required, non-empty string
 *  - description: optional string (defaults to '')
 *  - date: required, valid ISO 8601 date string (YYYY-MM-DD)
 */

const VALID_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validate the body of a POST /expenses request.
 * Returns { valid: true, data } or { valid: false, errors }.
 */
export function validateExpenseBody(body) {
  const errors = [];

  // ── amount ───────────────────────────────────────────────────────
  if (body.amount === undefined || body.amount === null) {
    errors.push({ field: 'amount', message: 'Amount is required.' });
  } else {
    const amount = Number(body.amount);
    if (Number.isNaN(amount)) {
      errors.push({ field: 'amount', message: 'Amount must be a valid number.' });
    } else if (amount <= 0) {
      errors.push({ field: 'amount', message: 'Amount must be a positive number.' });
    } else if (amount > 10_000_000) {
      errors.push({ field: 'amount', message: 'Amount exceeds maximum allowed value (₹1,00,00,000).' });
    }
  }

  // ── category ─────────────────────────────────────────────────────
  if (!body.category || typeof body.category !== 'string' || body.category.trim() === '') {
    errors.push({ field: 'category', message: 'Category is required.' });
  }

  // ── description ──────────────────────────────────────────────────
  if (!body.description || typeof body.description !== 'string' || body.description.trim() === '') {
    errors.push({ field: 'description', message: 'Description is required.' });
  }

  // ── date ─────────────────────────────────────────────────────────
  if (!body.date) {
    errors.push({ field: 'date', message: 'Date is required.' });
  } else if (!VALID_DATE_RE.test(body.date)) {
    errors.push({ field: 'date', message: 'Date must be in YYYY-MM-DD format.' });
  } else {
    const parsed = new Date(body.date + 'T00:00:00');
    if (Number.isNaN(parsed.getTime())) {
      errors.push({ field: 'date', message: 'Date is not a valid calendar date.' });
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    data: {
      amount: Number(body.amount),
      category: body.category.trim(),
      description: (body.description || '').trim(),
      date: body.date,
    },
  };
}

/**
 * Express middleware that validates POST /expenses body.
 */
export function validateExpense(req, res, next) {
  const result = validateExpenseBody(req.body);
  if (!result.valid) {
    return res.status(400).json({ 
      success: false, 
      data: null, 
      error: 'Validation failed', 
      details: result.errors 
    });
  }
  req.validatedExpense = result.data;
  next();
}

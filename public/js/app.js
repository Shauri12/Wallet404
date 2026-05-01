/**
 * Wallet404 — Frontend Application
 */

const API = '/api/expenses';

// ── DOM references ─────────────────────────────────────────────────
const form          = document.getElementById('expense-form');
const btnSubmit     = document.getElementById('btn-submit');
const formStatus    = document.getElementById('form-status');

const inputAmount   = document.getElementById('input-amount');
const inputCategory = document.getElementById('input-category');
const inputDesc     = document.getElementById('input-description');
const inputDate     = document.getElementById('input-date');

const errorAmount   = document.getElementById('error-amount');
const errorCategory = document.getElementById('error-category');
const errorDate     = document.getElementById('error-date');
const errorDesc     = document.getElementById('error-description');

const filterCat     = document.getElementById('filter-category');
const filterSort    = document.getElementById('filter-sort');
const filterTotal   = document.getElementById('filter-total');

const tableLoader   = document.getElementById('table-loader');
const tableError    = document.getElementById('table-error');
const tableErrorTxt = document.getElementById('table-error-text');
const tableEmpty    = document.getElementById('table-empty');
const tableWrapper  = document.getElementById('table-wrapper');
const tbody         = document.getElementById('expense-tbody');
const expenseCount  = document.getElementById('expense-count');
const btnRetry      = document.getElementById('btn-retry');
const summaryGrid   = document.getElementById('summary-grid');
const btnExportCsv  = document.getElementById('btn-export-csv');

// Modal Elements
const modal         = document.getElementById('expense-modal');
const btnOpenModal  = document.getElementById('btn-open-modal');
const btnCloseModal = document.getElementById('btn-close-modal');
const btnCancelModal= document.getElementById('btn-cancel-modal');
const btnEmptyAdd   = document.getElementById('btn-empty-add');

// Navigation & Views
const navDashboard  = document.getElementById('nav-dashboard');
const navAnalytics  = document.getElementById('nav-analytics');
const viewDashboard = document.getElementById('view-dashboard');
const viewAnalytics = document.getElementById('view-analytics');

// ── State ──────────────────────────────────────────────────────────
let isSubmitting = false;
let currentView = 'dashboard';
let expensesData = []; // Cache for charts

// Chart instances
let categoryChart = null;
let timelineChart = null;
let dowChart = null;

// Color mapping for categories
const categoryColors = {
  Food: '#f43f5e',
  Transport: '#3b82f6',
  Shopping: '#ec4899',
  Bills: '#f59e0b',
  Entertainment: '#8b5cf6',
  Health: '#10b981',
  Education: '#0ea5e9',
  Other: '#71717a'
};

const categoryIcons = {
  Food: 'bx-restaurant',
  Transport: 'bx-car',
  Shopping: 'bx-shopping-bag',
  Bills: 'bx-receipt',
  Entertainment: 'bx-movie-play',
  Health: 'bx-plus-medical',
  Education: 'bx-book',
  Other: 'bx-box'
};

// ── Initialise ─────────────────────────────────────────────────────
function init() {
  inputDate.value = new Date().toISOString().slice(0, 10);

  // Events
  form.addEventListener('submit', handleSubmit);
  filterCat.addEventListener('change', fetchExpenses);
  filterSort.addEventListener('change', fetchExpenses);
  btnRetry.addEventListener('click', fetchExpenses);
  btnExportCsv.addEventListener('click', exportToCsv);

  // Modal Events
  btnOpenModal.addEventListener('click', openModal);
  btnEmptyAdd.addEventListener('click', openModal);
  btnCloseModal.addEventListener('click', closeModal);
  btnCancelModal.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

  // Navigation Events
  navDashboard.addEventListener('click', (e) => { e.preventDefault(); switchView('dashboard'); });
  navAnalytics.addEventListener('click', (e) => { e.preventDefault(); switchView('analytics'); });

  // Chart.js global defaults
  if (window.Chart) {
    Chart.defaults.color = '#a1a1aa';
    Chart.defaults.font.family = "'Inter', sans-serif";
    Chart.defaults.plugins.tooltip.backgroundColor = '#18181b';
    Chart.defaults.plugins.tooltip.titleColor = '#fff';
    Chart.defaults.plugins.tooltip.bodyColor = '#a1a1aa';
    Chart.defaults.plugins.tooltip.borderColor = 'rgba(255,255,255,0.1)';
    Chart.defaults.plugins.tooltip.borderWidth = 1;
    Chart.defaults.plugins.tooltip.padding = 12;
    Chart.defaults.plugins.tooltip.cornerRadius = 8;
  }

  fetchExpenses();
  fetchSummary();
}

// ── Navigation ─────────────────────────────────────────────────────
function switchView(view) {
  if (currentView === view) return;
  currentView = view;

  navDashboard.classList.toggle('active', view === 'dashboard');
  navAnalytics.classList.toggle('active', view === 'analytics');

  if (view === 'dashboard') {
    viewDashboard.hidden = false;
    viewAnalytics.hidden = true;
  } else if (view === 'analytics') {
    viewDashboard.hidden = true;
    viewAnalytics.hidden = false;
    // Render charts
    renderCharts();
  }
}

// ── Modal Handlers ─────────────────────────────────────────────────
function openModal() {
  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
  setTimeout(() => inputAmount.focus(), 100);
}

function closeModal() {
  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
  form.reset();
  inputDate.value = new Date().toISOString().slice(0, 10);
  clearErrors();
  clearFormStatus();
}

// ── Validation ─────────────────────────────────────────────────────
function validateForm() {
  clearErrors();
  let valid = true;

  if (!inputAmount.value || parseFloat(inputAmount.value) <= 0) {
    showFieldError(inputAmount, errorAmount, 'Please enter a valid amount.');
    valid = false;
  }
  
  if (!inputCategory.value) {
    showFieldError(inputCategory, errorCategory, 'Please select a category.');
    valid = false;
  }
  
  if (!inputDesc.value || inputDesc.value.trim() === '') {
    showFieldError(inputDesc, errorDesc, 'Description is required.');
    valid = false;
  }
  
  if (!inputDate.value) {
    showFieldError(inputDate, errorDate, 'Please select a date.');
    valid = false;
  }

  return valid;
}

function showFieldError(input, errorEl, msg) {
  input.classList.add('is-invalid');
  errorEl.textContent = msg;
}

function clearErrors() {
  [inputAmount, inputCategory, inputDate, inputDesc].forEach(el => el.classList.remove('is-invalid'));
  [errorAmount, errorCategory, errorDate, errorDesc].forEach(el => el.textContent = '');
}

function generateIdempotencyKey() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}

// ── Submit expense ─────────────────────────────────────────────────
async function handleSubmit(e) {
  e.preventDefault();

  if (isSubmitting) return;
  if (!validateForm()) return;

  isSubmitting = true;
  setSubmitLoading(true);
  clearFormStatus();

  const payload = {
    amount: parseFloat(inputAmount.value),
    category: inputCategory.value,
    description: inputDesc.value.trim(),
    date: inputDate.value,
  };

  try {
    const res = await fetchWithRetry(API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': generateIdempotencyKey(),
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      const msg = json.details ? json.details.map(d => d.message).join(' ') : json.error || 'Failed to add expense.';
      throw new Error(msg);
    }

    showFormStatus('Transaction saved!', 'success');
    
    setTimeout(() => {
      closeModal();
      fetchExpenses();
      fetchSummary();
    }, 1000);

  } catch (err) {
    showFormStatus(err.message || 'Something went wrong.', 'error');
  } finally {
    isSubmitting = false;
    setSubmitLoading(false);
  }
}

// ── Fetch wrapper ──────────────────────────────────────────────────
async function fetchWithRetry(url, options = {}, retries = 2, delay = 1000) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (res.status >= 400 && res.status < 500) return res;
      if (res.ok) return res;
      if (attempt < retries) { await sleep(delay * (attempt + 1)); continue; }
      return res;
    } catch (err) {
      if (attempt === retries) throw err;
      await sleep(delay * (attempt + 1));
    }
  }
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

// ── Fetch & Render ─────────────────────────────────────────────────
async function fetchExpenses() {
  showTableState('loading');
  const params = new URLSearchParams();
  if (filterCat.value) params.set('category', filterCat.value);
  params.set('sort', filterSort.value);

  try {
    const res = await fetchWithRetry(`${API}?${params}`);
    if (!res.ok) throw new Error('Connection failed');

    const json = await res.json();
    const data = json.data;
    
    // Store full unfiltered dataset for charts if no filters are applied
    if (!filterCat.value) {
      expensesData = data.expenses;
      if (currentView === 'analytics') renderCharts();
    }

    renderExpenses(data.expenses);
    updateTotal(data.total, data.count);
  } catch (err) {
    showTableState('error', err.message);
  }
}

async function fetchSummary() {
  try {
    const res = await fetchWithRetry(`${API}/summary`);
    if (!res.ok) return;
    const json = await res.json();
    renderSummary(json.data);
  } catch {}
}

function renderExpenses(expenses) {
  if (!expenses || expenses.length === 0) {
    showTableState('empty');
    return;
  }
  showTableState('table');
  tbody.innerHTML = '';

  expenses.forEach((exp, i) => {
    const tr = document.createElement('tr');
    tr.className = 'fade-in';
    tr.style.animationDelay = `${i * 0.04}s`;

    const iconClass = categoryIcons[exp.category] || 'bx-wallet';
    const catColor = categoryColors[exp.category] || categoryColors['Other'];

    tr.innerHTML = `
      <td>
        <div class="tx-cell">
          <div class="tx-icon" style="color: ${catColor}; background: ${catColor}20;">
            <i class='bx ${iconClass}'></i>
          </div>
          <div class="tx-details">
            <span class="tx-title">${escapeHtml(exp.description) || exp.category}</span>
          </div>
        </div>
      </td>
      <td>
        <span class="cat-pill" style="color: ${catColor}; border-color: ${catColor}40;">
          ${escapeHtml(exp.category)}
        </span>
      </td>
      <td><span class="tx-date">${formatDate(exp.date)}</span></td>
      <td class="text-right">
        <span class="tx-amount">- ${formatCurrency(exp.amount)}</span>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderSummary(data) {
  if (!data || !data.summary || data.summary.length === 0) {
    summaryGrid.innerHTML = '';
    return;
  }

  let html = `
    <div class="summary-card summary-card--total fade-in">
      <div class="summary-card__top">
        <span class="summary-card__label">Total Spent</span>
        <div class="summary-card__icon"><i class='bx bx-trending-down'></i></div>
      </div>
      <div class="summary-card__value">${formatCurrency(data.grandTotal)}</div>
    </div>
  `;

  data.summary.slice(0, 3).forEach((s, i) => {
    const catColor = categoryColors[s.category] || categoryColors['Other'];
    const iconClass = categoryIcons[s.category] || 'bx-wallet';
    html += `
      <div class="summary-card fade-in" style="--card-color: ${catColor}; animation-delay:${(i + 1) * 0.05}s">
        <div class="summary-card__top">
          <span class="summary-card__label">${escapeHtml(s.category)}</span>
          <div class="summary-card__icon"><i class='bx ${iconClass}'></i></div>
        </div>
        <div class="summary-card__value">${formatCurrency(s.total)}</div>
      </div>
    `;
  });

  summaryGrid.innerHTML = html;
}

// ── Analytics / Charts ─────────────────────────────────────────────
function renderCharts() {
  if (!window.Chart || expensesData.length === 0) return;

  // Prepare Category Data
  const catTotals = {};
  expensesData.forEach(exp => {
    catTotals[exp.category] = (catTotals[exp.category] || 0) + exp.amount;
  });
  
  const catLabels = Object.keys(catTotals);
  const catData = Object.values(catTotals);
  const catBgColors = catLabels.map(cat => categoryColors[cat] || categoryColors['Other']);

  // Prepare Timeline Data (Last 7 days logic for simplicity, or just aggregate by date)
  const dateTotals = {};
  expensesData.forEach(exp => {
    dateTotals[exp.date] = (dateTotals[exp.date] || 0) + exp.amount;
  });
  
  // Sort dates
  const sortedDates = Object.keys(dateTotals).sort();
  const timelineData = sortedDates.map(date => dateTotals[date]);
  const timelineLabels = sortedDates.map(date => {
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });

  // Render Category Doughnut Chart
  const ctxCat = document.getElementById('chart-category').getContext('2d');
  if (categoryChart) categoryChart.destroy();
  categoryChart = new Chart(ctxCat, {
    type: 'doughnut',
    data: {
      labels: catLabels,
      datasets: [{
        data: catData,
        backgroundColor: catBgColors,
        borderWidth: 0,
        hoverOffset: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '75%',
      plugins: {
        legend: { position: 'right', labels: { usePointStyle: true, padding: 20 } }
      }
    }
  });

  // Render Timeline Bar Chart
  const ctxTime = document.getElementById('chart-timeline').getContext('2d');
  if (timelineChart) timelineChart.destroy();
  
  // Create gradient
  const gradient = ctxTime.createLinearGradient(0, 0, 0, 400);
  gradient.addColorStop(0, 'rgba(139, 92, 246, 0.8)');
  gradient.addColorStop(1, 'rgba(139, 92, 246, 0.1)');

  timelineChart = new Chart(ctxTime, {
    type: 'bar',
    data: {
      labels: timelineLabels,
      datasets: [{
        label: 'Daily Spending',
        data: timelineData,
        backgroundColor: gradient,
        borderRadius: 6,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: { 
          beginAtZero: true, 
          grid: { color: 'rgba(255,255,255,0.05)', drawBorder: false },
          ticks: { callback: function(value) { return '₹' + value; } }
        },
        x: { 
          grid: { display: false, drawBorder: false }
        }
      }
    }
  });

  // Prepare Day of Week Data
  const dowTotals = [0, 0, 0, 0, 0, 0, 0]; // Sun to Sat
  const dowLabels = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  expensesData.forEach(exp => {
    // Parse date safely to get correct day
    const d = new Date(exp.date + 'T12:00:00');
    dowTotals[d.getDay()] += exp.amount;
  });

  const ctxDow = document.getElementById('chart-dow').getContext('2d');
  if (dowChart) dowChart.destroy();
  
  dowChart = new Chart(ctxDow, {
    type: 'polarArea',
    data: {
      labels: dowLabels,
      datasets: [{
        label: 'Spending by Day',
        data: dowTotals,
        backgroundColor: [
          'rgba(244, 63, 94, 0.7)',
          'rgba(59, 130, 246, 0.7)',
          'rgba(236, 72, 153, 0.7)',
          'rgba(245, 158, 11, 0.7)',
          'rgba(139, 92, 246, 0.7)',
          'rgba(16, 185, 129, 0.7)',
          'rgba(14, 165, 233, 0.7)'
        ],
        borderWidth: 1,
        borderColor: '#18181b'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        r: { ticks: { display: false }, grid: { color: 'rgba(255,255,255,0.05)' } }
      },
      plugins: { legend: { position: 'right', labels: { usePointStyle: true, padding: 20 } } }
    }
  });
}

// ── UI States ──────────────────────────────────────────────────────
function showTableState(state, message) {
  tableLoader.hidden  = state !== 'loading';
  tableError.hidden   = state !== 'error';
  tableEmpty.hidden   = state !== 'empty';
  tableWrapper.hidden = state !== 'table';
  if (state === 'error' && message) tableErrorTxt.textContent = message;
}

function updateTotal(total, count) {
  expenseCount.textContent = `${count} txns`;
  filterTotal.textContent = formatCurrency(total);
}

function showFormStatus(msg, type) {
  formStatus.textContent = msg;
  formStatus.className = `form-status is-${type}`;
}

function clearFormStatus() {
  formStatus.textContent = '';
  formStatus.className = 'form-status';
}

function setSubmitLoading(loading) {
  btnSubmit.disabled = loading;
  btnSubmit.classList.toggle('is-loading', loading);
}

// ── Export to CSV ──────────────────────────────────────────────────
function exportToCsv() {
  if (expensesData.length === 0) return alert('No data to export. Please add an expense first.');
  
  const headers = ['Date', 'Category', 'Description', 'Amount'];
  const rows = expensesData.map(exp => [
    exp.date, 
    exp.category, 
    `"${(exp.description || '').replace(/"/g, '""')}"`, 
    Number(exp.amount).toFixed(2)
  ]);
  
  const csvContent = [
    headers.join(','),
    ...rows.map(e => e.join(','))
  ].join('\n');
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', 'wallet404_export.csv');
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ── Formatters ─────────────────────────────────────────────────────
function formatCurrency(amount) {
  return '₹' + Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

init();

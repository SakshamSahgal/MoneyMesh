/**
 * main.js
 * Entry point. Wires together the file loader, data processor, and chart renderer.
 */
const App = (() => {

  let allTransactions = [];
  let allBankStats    = [];
  let sliderMinDate   = null;   // earliest transaction date (Date object)

  // ── Init ────────────────────────────────────────────────────────────────────
  function init() {
    Modal.init();

    document.getElementById('rulesInput')
      .addEventListener('change', handleRules);

    document.getElementById('searchBtn')
      .addEventListener('click', openSearch);

    document.getElementById('search-close')
      .addEventListener('click', closeSearch);

    document.getElementById('search-modal')
      .addEventListener('click', (e) => { if (e.target === e.currentTarget) closeSearch(); });

    document.getElementById('search-input')
      .addEventListener('input', (e) => renderSearchResults(e.target.value));

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeSearch();
    });

    document.getElementById('fileInput')
      .addEventListener('change', handleFiles);

    document.getElementById('startRange')
      .addEventListener('input', handleSliderChange);

    document.getElementById('endRange')
      .addEventListener('input', handleSliderChange);

    document.getElementById('bankFilter')
      .addEventListener('change', refresh);

    window.addEventListener('resize', debounce(refresh, 300));
  }

  // ── Rules Upload Handler ─────────────────────────────────────────────────────
  function handleRules(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        Categorizer.loadRules(data);
        const expCount = (data.expenseRules || []).length;
        const incCount = (data.incomeRules  || []).length;
        document.getElementById('rulesStatus').textContent =
          `✓ ${expCount} expense + ${incCount} income rules loaded`;
        document.getElementById('rulesStatus').className = 'rules-status ok';
        // Re-render if transactions are already loaded
        if (allTransactions.length) refresh();
      } catch (err) {
        document.getElementById('rulesStatus').textContent = 'Invalid JSON: ' + err.message;
        document.getElementById('rulesStatus').className = 'rules-status error';
      }
    };
    reader.readAsText(file);
  }

  // ── File Input Handler ───────────────────────────────────────────────────────
  async function handleFiles(event) {
    const files = event.target.files;
    if (!files.length) return;

    setStatus('Loading files...');

    try {
      const loaded    = await FileLoader.loadFiles(files);
      allTransactions = loaded.transactions;
      allBankStats    = loaded.bankStats;

      document.getElementById('fileCount').textContent =
        `${allTransactions.length} transactions loaded from ${countFiles(files)} file(s)`;

      populateFilters();
      document.getElementById('filters').style.display = 'flex';

      document.getElementById('searchBtn').style.display = 'inline-flex';
      refresh();
      setStatus('');
    } catch (err) {
      setStatus('Error: ' + err.message, true);
    }
  }

  function countFiles(fileList) {
    return Array.from(fileList).filter(f => f.name.match(/\.(xlsx|xls)$/i)).length;
  }

  // ── Populate Slider + Bank Dropdown ─────────────────────────────────────────
  function populateFilters() {
    const { min, max } = FileLoader.getDateRange(allTransactions);
    sliderMinDate = min;

    const totalDays = (min && max) ? Math.round((max - min) / 86400000) : 0;

    const startRange = document.getElementById('startRange');
    const endRange   = document.getElementById('endRange');

    startRange.min   = 0;  startRange.max = totalDays;  startRange.value = 0;
    endRange.min     = 0;  endRange.max   = totalDays;  endRange.value   = totalDays;

    updateSliderUI();

    const banks   = FileLoader.getAvailableBanks(allTransactions);
    const bankSel = document.getElementById('bankFilter');
    bankSel.innerHTML = '<option value="all">All Banks</option>';
    banks.forEach(b => { bankSel.innerHTML += `<option value="${b}">${b}</option>`; });
  }

  // ── Slider helpers ───────────────────────────────────────────────────────────
  function handleSliderChange() {
    const startRange = document.getElementById('startRange');
    const endRange   = document.getElementById('endRange');

    // Prevent handles from crossing
    if (parseInt(startRange.value) > parseInt(endRange.value)) {
      const tmp = startRange.value;
      startRange.value = endRange.value;
      endRange.value   = tmp;
    }

    updateSliderUI();
    refresh();
  }

  function updateSliderUI() {
    const startRange = document.getElementById('startRange');
    const endRange   = document.getElementById('endRange');
    const fill       = document.getElementById('rangeFill');

    const max = parseInt(startRange.max) || 1;
    const s   = parseInt(startRange.value);
    const e   = parseInt(endRange.value);

    fill.style.left  = (s / max * 100) + '%';
    fill.style.right = ((max - e) / max * 100) + '%';

    if (sliderMinDate) {
      document.getElementById('startDateLabel').textContent =
        fmtSliderDate(new Date(sliderMinDate.getTime() + s * 86400000));
      document.getElementById('endDateLabel').textContent =
        fmtSliderDate(new Date(sliderMinDate.getTime() + e * 86400000));
    }
  }

  function fmtSliderDate(date) {
    return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function getSliderDates() {
    if (!sliderMinDate) return { startDate: null, endDate: null };
    const s = parseInt(document.getElementById('startRange').value);
    const e = parseInt(document.getElementById('endRange').value);
    const startDate = new Date(sliderMinDate.getTime() + s * 86400000);
    const endDate   = new Date(sliderMinDate.getTime() + e * 86400000);
    // Set endDate to end of day so it's inclusive
    endDate.setHours(23, 59, 59, 999);
    return { startDate, endDate };
  }

  // ── Refresh Chart ────────────────────────────────────────────────────────────
  function refresh() {
    if (!allTransactions.length) return;

    const bank = document.getElementById('bankFilter').value;
    const { startDate, endDate } = getSliderDates();

    const { transactions: filtered, bankStats: filteredStats } =
      FileLoader.filterTransactions(allTransactions, allBankStats, { startDate, endDate, bank });

    if (!filtered.length) {
      setStatus('No transactions found for the selected filters.', true);
      return;
    }

    const sankeyData = DataProcessor.buildSankeyData(filtered, filteredStats);

    document.getElementById('emptyState').style.display = 'none';

    renderSummary(sankeyData, filteredStats);
    ChartRenderer.render('chart-container', sankeyData, sankeyData.transactionsByNode);

    setStatus('');
  }

  // ── Summary Cards ────────────────────────────────────────────────────────────
  function renderSummary(data, bankStats) {
    const fmt      = ChartRenderer.formatCurrency;
    const net      = data.totalIncome - data.totalExpenses;
    const netClass = net >= 0 ? 'positive' : 'negative';

    const summary = document.getElementById('summary');
    summary.style.display = 'flex';
    summary.innerHTML = `
      <div class="summary-card income clickable" data-card="opening">
        <div class="summary-label">Opening Balance</div>
        <div class="summary-value">${fmt(data.openingBalance)}</div>
      </div>
      <div class="summary-card income clickable" data-card="income">
        <div class="summary-label">Total Income</div>
        <div class="summary-value">${fmt(data.totalIncome)}</div>
      </div>
      <div class="summary-card expense clickable" data-card="expenses">
        <div class="summary-label">Total Expenses</div>
        <div class="summary-value">${fmt(data.totalExpenses)}</div>
      </div>
      <div class="summary-card net ${net < 0 ? 'negative' : ''} clickable" data-card="net">
        <div class="summary-label">Net Savings</div>
        <div class="summary-value ${netClass}">${fmt(net)}</div>
      </div>
      <div class="summary-card income clickable" data-card="closing">
        <div class="summary-label">Closing Balance</div>
        <div class="summary-value">${fmt(data.closingBalance)}</div>
      </div>
    `;

    // Per-bank boundaries for opening/closing modals
    const byBank = {};
    for (const s of bankStats) {
      if (!byBank[s.bank]) byBank[s.bank] = [];
      byBank[s.bank].push(s);
    }
    const bankBoundaries = Object.entries(byBank).map(([bank, stats]) => {
      const sorted = stats.slice().sort((a, b) => new Date('1 ' + a.month) - new Date('1 ' + b.month));
      return { bank, first: sorted[0], last: sorted[sorted.length - 1] };
    });

    const incomeSorted  = Object.entries(data.incomeBySource).sort((a, b) => b[1] - a[1]);
    const expenseSorted = Object.entries(data.expenseByCategory).sort((a, b) => b[1] - a[1]);

    const cardHandlers = {
      opening: () => Modal.openInfo(
        'Opening Balance', fmt(data.openingBalance),
        'Balance just before the first transaction of the period. Per bank: closing balance of the first transaction + debit − credit on that transaction.',
        ['Bank', 'Month', 'Opening Balance'],
        bankBoundaries.map(b => [b.bank, b.first.month, fmt(b.first.openingBalance)])
      ),
      income: () => Modal.openInfo(
        'Total Income', fmt(data.totalIncome),
        'Sum of all credit (money received) transactions in the selected period, grouped by income source.',
        ['Source', 'Amount'],
        incomeSorted.map(([src, amt]) => [src, fmt(amt)])
      ),
      expenses: () => Modal.openInfo(
        'Total Expenses', fmt(data.totalExpenses),
        'Sum of all debit (money spent) transactions in the selected period, grouped by category.',
        ['Category', 'Amount'],
        expenseSorted.map(([cat, amt]) => [cat, fmt(amt)])
      ),
      net: () => Modal.openInfo(
        'Net Savings', fmt(net),
        'Total Income minus Total Expenses. Positive means you saved money; negative means you spent more than you earned.',
        ['', 'Amount'],
        [
          ['Total Income',   fmt(data.totalIncome)],
          ['Total Expenses', fmt(data.totalExpenses)],
          ['Net Savings',    fmt(net)],
        ]
      ),
      closing: () => Modal.openInfo(
        'Closing Balance', fmt(data.closingBalance),
        'Actual account balance after the last transaction of the period, summed across all banks.',
        ['Bank', 'Month', 'Closing Balance'],
        bankBoundaries.map(b => [b.bank, b.last.month, fmt(b.last.closingBalance)])
      ),
    };

    summary.querySelectorAll('[data-card]').forEach(card => {
      card.addEventListener('click', () => cardHandlers[card.dataset.card]());
    });
  }

  // ── Search ───────────────────────────────────────────────────────────────────
  function openSearch() {
    document.getElementById('search-modal').classList.add('open');
    const input = document.getElementById('search-input');
    input.value = '';
    renderSearchResults('');
    setTimeout(() => input.focus(), 50);
  }

  function closeSearch() {
    document.getElementById('search-modal').classList.remove('open');
  }

  function renderSearchResults(query) {
    const fmt     = ChartRenderer.formatCurrency;
    const { startDate, endDate } = getSliderDates();
    const bank    = document.getElementById('bankFilter').value;

    const { transactions } =
      FileLoader.filterTransactions(allTransactions, allBankStats, { startDate, endDate, bank });

    const q = query.trim().toLowerCase();
    const matched = q
      ? transactions.filter(t =>
          (t.description || '').toLowerCase().includes(q) ||
          (t.bank        || '').toLowerCase().includes(q) ||
          (t.date        || '').toString().toLowerCase().includes(q) ||
          (t.debit  > 0 && String(t.debit).includes(q))  ||
          (t.credit > 0 && String(t.credit).includes(q))
        )
      : transactions;

    const sorted = [...matched].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

    document.getElementById('search-results-info').textContent =
      q ? `${sorted.length} result(s) for "${query}"` : `${sorted.length} transactions in selected range`;

    const fmtDate = d => d ? String(d).split('T')[0].split(' ')[0] : '—';

    document.getElementById('search-tbody').innerHTML = sorted.length
      ? sorted.map(t => {
          const isCredit = t.credit > 0;
          const amount   = isCredit ? t.credit : t.debit;
          const cls      = isCredit ? 'credit' : 'debit';
          const sign     = isCredit ? '+' : '-';
          const desc     = (t.description || '').substring(0, 60) +
                           (t.description && t.description.length > 60 ? '…' : '');
          return `<tr>
            <td>${fmtDate(t.date)}</td>
            <td class="desc" title="${t.description || ''}">${desc}</td>
            <td>${t.bank || '—'}</td>
            <td class="amount ${cls}">${sign}${fmt(amount)}</td>
          </tr>`;
        }).join('')
      : `<tr><td colspan="4" style="text-align:center;color:#aaa;padding:24px">No results found</td></tr>`;
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function setStatus(message, isError = false) {
    const el = document.getElementById('status');
    el.textContent = message;
    el.className   = 'status' + (isError ? ' error' : '');
  }

  function debounce(fn, delay) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  return { init };

})();

document.addEventListener('DOMContentLoaded', App.init);

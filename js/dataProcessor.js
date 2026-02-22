/**
 * dataProcessor.js
 * Converts raw transactions into the node/link structure required by the Sankey chart.
 *
 * Sankey structure:
 *   [Opening Balance]  ──┐
 *   [Income Sources]   ──►  [Total Budget]  ──►  [Expense Categories]
 *                                            ──►  [Carry Forward]
 *
 * Opening Balance + Income = Expenses + Carry Forward  (always balances perfectly)
 */
const DataProcessor = (() => {

  const BUDGET_NODE      = 'Total Budget';
  const CARRY_FWD_NODE   = 'Saved';
  const OPENING_BAL_NODE = 'Balance B/F';

  function buildSankeyData(transactions, bankStats = []) {
    const incomeBySource    = {};
    const expenseByCategory = {};
    let totalIncome   = 0;
    let totalExpenses = 0;

    // transactionsByNode: node name → transactions[] (for modal drill-down)
    const transactionsByNode = { [BUDGET_NODE]: [] };

    for (const t of transactions) {
      transactionsByNode[BUDGET_NODE].push(t);

      if (t.credit > 0) {
        const source = Categorizer.getIncomeSource(t.description);
        incomeBySource[source] = (incomeBySource[source] || 0) + t.credit;
        totalIncome += t.credit;
        if (!transactionsByNode[source]) transactionsByNode[source] = [];
        transactionsByNode[source].push(t);
      }
      if (t.debit > 0) {
        const category = Categorizer.categorize(t.description);
        expenseByCategory[category] = (expenseByCategory[category] || 0) + t.debit;
        totalExpenses += t.debit;
        if (!transactionsByNode[category]) transactionsByNode[category] = [];
        transactionsByNode[category].push(t);
      }
    }

    // ── Opening & Closing Balance from bank stats ──────────────────────────────
    // Group by bank, then take the earliest month's opening and latest month's closing.
    // This prevents summing balances across months (which inflates the numbers).
    const byBank = {};
    for (const s of bankStats) {
      if (!byBank[s.bank]) byBank[s.bank] = [];
      byBank[s.bank].push(s);
    }
    let totalOpening = 0;
    let totalClosing = 0;
    for (const stats of Object.values(byBank)) {
      const sorted = stats.slice().sort((a, b) => new Date('1 ' + a.month) - new Date('1 ' + b.month));
      totalOpening += sorted[0].openingBalance;
      totalClosing += sorted[sorted.length - 1].closingBalance;
    }

    // Opening Balance flows IN as an income source
    if (totalOpening > 0) {
      incomeBySource[OPENING_BAL_NODE] = totalOpening;
    }

    // Closing Balance (Carry Forward) flows OUT as an expense category
    if (totalClosing > 0) {
      expenseByCategory[CARRY_FWD_NODE] = totalClosing;
    }

    // ── Safety balance (handles rounding differences) ──────────────────────────
    const totalIn  = Object.values(incomeBySource).reduce((s, v) => s + v, 0);
    const totalOut = Object.values(expenseByCategory).reduce((s, v) => s + v, 0);
    const diff     = Math.round(totalIn - totalOut);

    if (diff > 0) {
      expenseByCategory[CARRY_FWD_NODE] = (expenseByCategory[CARRY_FWD_NODE] || 0) + diff;
    } else if (diff < 0) {
      incomeBySource[OPENING_BAL_NODE] = (incomeBySource[OPENING_BAL_NODE] || 0) + Math.abs(diff);
    }

    // ── Build nodes and links (using names, not indices) ───────────────────────
    const nodes = [];
    const links = [];
    const seen  = new Set();

    function addNode(name) {
      if (!seen.has(name)) { seen.add(name); nodes.push({ name }); }
    }

    addNode(BUDGET_NODE);

    for (const [source, amount] of Object.entries(incomeBySource)) {
      const value = Math.round(amount);
      if (value <= 0) continue;
      addNode(source);
      links.push({ source: source, target: BUDGET_NODE, value });
    }

    for (const [category, amount] of Object.entries(expenseByCategory)) {
      const value = Math.round(amount);
      if (value <= 0) continue;
      addNode(category);
      links.push({ source: BUDGET_NODE, target: category, value });
    }

    return {
      nodes,
      links,
      totalIncome:        Math.round(totalIncome),
      totalExpenses:      Math.round(totalExpenses),
      netSavings:         Math.round(totalIncome - totalExpenses),
      openingBalance:     Math.round(totalOpening),
      closingBalance:     Math.round(totalClosing),
      incomeBySource,
      expenseByCategory,
      transactionsByNode,
    };
  }

  return { buildSankeyData };

})();

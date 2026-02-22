/**
 * categorizer.js
 * Maps transaction descriptions to expense categories and income sources.
 * Rules are loaded from a user-uploaded rules.json file.
 * Edit rules.json to add/change keywords — no code changes needed.
 */
const Categorizer = (() => {

  let EXPENSE_RULES = [];
  let INCOME_RULES  = [];

  // ── Load rules from parsed JSON object ──────────────────────────────────────
  function loadRules(data) {
    EXPENSE_RULES = data.expenseRules || [];
    INCOME_RULES  = data.incomeRules  || [];
  }

  // ── Normalize description ────────────────────────────────────────────────────
  function normalize(description) {
    return description.toLowerCase().replace(/\s+/g, ' ').trim();
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  function categorize(description) {
    if (!description) return 'Others';
    const desc = normalize(description);
    for (const rule of EXPENSE_RULES) {
      for (const kw of rule.keywords) {
        if (desc.includes(kw)) return rule.category;
      }
    }
    return 'Others';
  }

  function getIncomeSource(description) {
    if (!description) return 'Other Income';
    const desc = normalize(description);
    for (const rule of INCOME_RULES) {
      for (const kw of rule.keywords) {
        if (desc.includes(kw)) return rule.source;
      }
    }
    return 'Other Income';
  }

  function getKeywords(name) {
    const expenseRule = EXPENSE_RULES.find(r => r.category === name);
    if (expenseRule) return expenseRule.keywords;
    const incomeRule  = INCOME_RULES.find(r => r.source === name);
    if (incomeRule)  return incomeRule.keywords;
    return [];
  }

  function isLoaded() {
    return EXPENSE_RULES.length > 0 || INCOME_RULES.length > 0;
  }

  return { loadRules, categorize, getIncomeSource, getKeywords, isLoaded };

})();

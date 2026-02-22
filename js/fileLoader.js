/**
 * fileLoader.js
 * Reads Excel (.xlsx/.xls) files selected via the folder picker.
 * Month is derived from each transaction's date — not the filename.
 * Folder structure: Statements/<BankName>/Transactions.xlsx
 */
const FileLoader = (() => {

  // ── Column Name Aliases ─────────────────────────────────────────────────────
  const COLUMN_ALIASES = {
    date:        ['Txn Date', 'Date', 'Transaction Date', 'Trans Date', 'Value Date'],
    description: ['Description', 'Details', 'Narration', 'Particulars', 'Remarks', 'Transaction Remarks'],
    debit:       ['Debit', 'Withdrawal', 'Withdrawal Amount', 'Debit Amount', 'Dr'],
    credit:      ['Credit', 'Deposit', 'Deposit Amount', 'Credit Amount', 'Cr'],
    balance:     ['Balance', 'Running Balance', 'Closing Balance', 'Available Balance'],
  };

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function getField(row, aliases) {
    for (const alias of aliases) {
      const val = row[alias];
      if (val !== undefined && val !== null && val !== '') return val;
    }
    return null;
  }

  function parseAmount(val) {
    if (val === null || val === undefined || val === '') return 0;
    const num = parseFloat(String(val).replace(/[^0-9.-]/g, ''));
    return isNaN(num) ? 0 : Math.abs(num);
  }

  // Extract bank name from folder path: "Statements/CanaraBank/Transactions.xlsx" → "CanaraBank"
  function extractBank(file) {
    const parts = file.webkitRelativePath.split('/');
    return parts.length >= 2 ? parts[parts.length - 2] : 'Unknown';
  }

  // Parse a date string handling multiple formats used by Indian banks
  function parseDate(dateVal) {
    if (!dateVal) return null;
    const s = String(dateVal).trim();

    // Format: DD/MM/YYYY (SBI and many Indian banks)
    const ddmmyyyy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (ddmmyyyy) {
      const [, dd, mm, yyyy] = ddmmyyyy;
      return new Date(`${yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`);
    }

    // Format: DD-MM-YYYY or DD-MM-YYYY HH:MM:SS (with optional timestamp)
    const ddmmyyyy2 = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
    if (ddmmyyyy2) {
      const [, dd, mm, yyyy] = ddmmyyyy2;
      return new Date(`${yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`);
    }

    // Format: DD MON YYYY (e.g. "06 Jan 2025" — CanaraBank)
    const ddMonyyyy = s.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
    if (ddMonyyyy) return new Date(s);

    // Fallback: let JavaScript try
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  // Extract "Jan 2026" from a date value
  function extractMonth(dateVal) {
    const d = parseDate(dateVal);
    if (!d) {
      console.warn('[Finance] Unknown date value:', JSON.stringify(dateVal), '| type:', typeof dateVal);
      return 'Unknown';
    }
    return d.toLocaleString('en-IN', { month: 'short', year: 'numeric' }); // "Jan 2026"
  }

  // ── Parse a Single Excel File ───────────────────────────────────────────────

  function parseExcelFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const workbook = XLSX.read(e.target.result, {
            type: 'binary',
            cellDates: true,
            cellNF: false,
          });

          const sheetName = workbook.SheetNames[0];
          const sheet     = workbook.Sheets[sheetName];
          const rows      = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false });

          const transactions = rows
            .map(row => {
              const date = getField(row, COLUMN_ALIASES.date);
              return {
                date,
                month:       extractMonth(date),   // ← derived from date, not filename
                description: getField(row, COLUMN_ALIASES.description),
                debit:       parseAmount(getField(row, COLUMN_ALIASES.debit)),
                credit:      parseAmount(getField(row, COLUMN_ALIASES.credit)),
                balance:     parseAmount(getField(row, COLUMN_ALIASES.balance)),
                bank:        null,   // filled in loadFiles
              };
            })
            .filter(t => t.description && (t.debit > 0 || t.credit > 0));

          resolve(transactions);
        } catch (err) {
          reject(new Error(`Failed to parse ${file.name}: ${err.message}`));
        }
      };

      reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
      reader.readAsBinaryString(file);
    });
  }

  // ── Opening & Closing Balance — per bank per month ──────────────────────────
  // Groups transactions by month and calculates opening/closing for each.

  function extractBalancesByMonth(transactions, bank) {
    const byMonth = {};
    for (const t of transactions) {
      if (!byMonth[t.month]) byMonth[t.month] = [];
      byMonth[t.month].push(t);
    }

    return Object.entries(byMonth).map(([month, txns]) => {
      const withBalance = txns
        .filter(t => t.balance > 0)
        .sort((a, b) => parseDate(a.date) - parseDate(b.date));

      if (!withBalance.length) return { bank, month, openingBalance: 0, closingBalance: 0 };

      const first = withBalance[0];
      const last  = withBalance[withBalance.length - 1];

      // balance_before = balance_after + debit - credit
      return {
        bank,
        month,
        openingBalance: first.balance + first.debit - first.credit,
        closingBalance: last.balance,
      };
    });
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  async function loadFiles(fileList) {
    const xlsxFiles = Array.from(fileList)
      .filter(f => f.name.match(/\.(xlsx|xls)$/i));

    if (!xlsxFiles.length) throw new Error('No Excel files found in the selected folder.');

    const allTransactions = [];
    const allBankStats    = [];

    for (const file of xlsxFiles) {
      const bank         = extractBank(file);
      const transactions = await parseExcelFile(file);
      transactions.forEach(t => { t.bank = bank; });
      allTransactions.push(...transactions);
      allBankStats.push(...extractBalancesByMonth(transactions, bank));
    }

    return { transactions: allTransactions, bankStats: allBankStats };
  }

  // Sort months chronologically: "Jan 2026" < "Feb 2026" < "Mar 2026"
  function getAvailableMonths(transactions) {
    const unique = [...new Set(transactions.map(t => t.month))];
    return unique.sort((a, b) => new Date(`1 ${a}`) - new Date(`1 ${b}`));
  }

  function getAvailableBanks(transactions) {
    return [...new Set(transactions.map(t => t.bank))].sort();
  }

  function getDateRange(transactions) {
    let min = null, max = null;
    for (const t of transactions) {
      const d = parseDate(t.date);
      if (!d) continue;
      if (!min || d < min) min = d;
      if (!max || d > max) max = d;
    }
    return { min, max };
  }

  function filterTransactions(transactions, bankStats, { startDate, endDate, bank }) {
    const filteredTxns = transactions.filter(t => {
      const d = parseDate(t.date);
      return (!startDate || !d || d >= startDate) &&
             (!endDate   || !d || d <= endDate)   &&
             (!bank || bank === 'all' || t.bank === bank);
    });

    // For bankStats, compare at month granularity
    const startMonth = startDate
      ? new Date(startDate.getFullYear(), startDate.getMonth(), 1) : null;
    const endMonth   = endDate
      ? new Date(endDate.getFullYear(),   endDate.getMonth(),   1) : null;

    const filteredStats = bankStats.filter(s => {
      const m = new Date('1 ' + s.month);
      return (!startMonth || m >= startMonth) &&
             (!endMonth   || m <= endMonth)   &&
             (!bank || bank === 'all' || s.bank === bank);
    });

    return { transactions: filteredTxns, bankStats: filteredStats };
  }

  return { loadFiles, getAvailableMonths, getAvailableBanks, getDateRange, filterTransactions };

})();

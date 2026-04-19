/**
 * modal.js
 * Shows a transaction drill-down modal when a Sankey node is clicked.
 * Transactions are grouped into tabs by the keyword that matched them.
 */
const Modal = (() => {

  const currencyFmt = new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', maximumFractionDigits: 0,
  });

  function fmt(n)       { return currencyFmt.format(n); }
  function fmtSigned(n) { return (n > 0 ? '+' : '') + fmt(n); }
  function fmtDate(d)   { return d ? String(d).split('T')[0].split(' ')[0] : '—'; }
  function sumOf(rows)  { return rows.reduce((s, t) => s + (t.credit || 0) - (t.debit || 0), 0); }

  // Sort state is preserved across modal opens so user preference sticks
  const sortState = { col: 'date', dir: 'desc' };
  let currentRows = [];

  // ── Render table rows ────────────────────────────────────────────────────────
  function renderRows(transactions) {
    if (!transactions.length) {
      return `<tr><td colspan="4" style="text-align:center;color:#aaa;padding:24px">No transactions</td></tr>`;
    }
    return transactions.map(t => {
      const isCredit = t.credit > 0;
      const amount   = isCredit ? t.credit : t.debit;
      const amtClass = isCredit ? 'credit' : 'debit';
      const amtSign  = isCredit ? '+' : '-';
      const desc     = (t.description || '').substring(0, 60) +
                       (t.description && t.description.length > 60 ? '…' : '');
      return `
        <tr>
          <td>${fmtDate(t.date)}</td>
          <td class="desc" title="${t.description || ''}">${desc}</td>
          <td>${t.bank || '—'}</td>
          <td class="amount ${amtClass}">${amtSign}${fmt(amount)}</td>
        </tr>`;
    }).join('');
  }

  function paintTable(rows) {
    currentRows = rows;
    document.getElementById('modal-tbody').innerHTML =
      renderRows(TableSort.sort(rows, sortState.col, sortState.dir));
  }

  // ── Mode helpers ─────────────────────────────────────────────────────────────
  function showTxnMode() {
    document.getElementById('modal-explain-section').style.display = 'none';
    document.getElementById('modal-txn-section').style.display     = 'block';
  }

  function showInfoMode() {
    document.getElementById('modal-explain-section').style.display = 'block';
    document.getElementById('modal-txn-section').style.display     = 'none';
    document.getElementById('modal-tabs').style.display            = 'none';
    document.getElementById('modal-tabs').innerHTML                = '';
  }

  // ── Open Info (summary card explanation) ─────────────────────────────────────
  function openInfo(title, subtitle, explanation, headers, rows) {
    document.getElementById('modal-title').textContent    = title;
    document.getElementById('modal-subtitle').textContent = subtitle;
    showInfoMode();

    document.getElementById('modal-explain-text').textContent = explanation;

    if (headers && rows && rows.length) {
      document.getElementById('modal-breakdown-head').innerHTML =
        `<tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>`;
      document.getElementById('modal-breakdown-body').innerHTML =
        rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('');
      document.getElementById('modal-breakdown-table').style.display = 'table';
    } else {
      document.getElementById('modal-breakdown-table').style.display = 'none';
    }

    document.getElementById('txn-modal').classList.add('open');
  }

  // ── Open ─────────────────────────────────────────────────────────────────────
  function open(nodeName, nodeTotal, transactions) {
    const modal    = document.getElementById('txn-modal');
    const title    = document.getElementById('modal-title');
    const subtitle = document.getElementById('modal-subtitle');
    const tabs     = document.getElementById('modal-tabs');

    title.textContent    = nodeName;
    subtitle.textContent = `${transactions.length} transaction(s) · Total: ${fmt(nodeTotal)}`;

    const kws = Categorizer.getKeywords(nodeName);

    if (kws.length === 0) {
      // No keywords (e.g. Total Budget, Balance B/F) — flat list, no tabs
      tabs.innerHTML    = '';
      tabs.style.display = 'none';
      paintTable(transactions);
    } else {
      // Group each transaction by the first keyword that matches
      const groups = {}; // kw → Transaction[]
      for (const t of transactions) {
        const desc = (t.description || '').toLowerCase();
        for (const kw of kws) {
          if (desc.includes(kw)) {
            if (!groups[kw]) groups[kw] = [];
            groups[kw].push(t);
            break;
          }
        }
      }

      // Only tabs for keywords that actually matched something
      const matchedKws = kws.filter(kw => groups[kw]?.length);

      const tabPill = (label, count, sum, data) => {
        const sumCls = sum >= 0 ? 'credit' : 'debit';
        return `<button class="modal-tab${data === '__all__' ? ' active' : ''}" data-kw="${escapeAttr(data)}">`
             + `${label} <span class="tab-count">${count}</span>`
             + `<span class="tab-sum ${sumCls}">${fmtSigned(sum)}</span>`
             + `</button>`;
      };

      // Build tab bar: "All" first, then one per matched keyword
      tabs.style.display = 'flex';
      tabs.innerHTML = [
        tabPill('All', transactions.length, sumOf(transactions), '__all__'),
        ...matchedKws.map(kw => tabPill(kw, groups[kw].length, sumOf(groups[kw]), kw)),
      ].join('');

      paintTable(transactions);

      tabs.querySelectorAll('.modal-tab').forEach(btn => {
        btn.addEventListener('click', () => {
          tabs.querySelectorAll('.modal-tab').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          const kw    = btn.dataset.kw;
          const shown = kw === '__all__' ? transactions : (groups[kw] || []);
          paintTable(shown);
        });
      });
    }

    showTxnMode();
    modal.classList.add('open');
  }

  function escapeAttr(s) {
    return s.replace(/"/g, '&quot;');
  }

  // ── Close ────────────────────────────────────────────────────────────────────
  function close() {
    document.getElementById('txn-modal').classList.remove('open');
  }

  // ── Init event listeners ─────────────────────────────────────────────────────
  function init() {
    document.getElementById('modal-close').addEventListener('click', close);

    document.getElementById('txn-modal').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) close();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
    });

    const thead = document.querySelector('#modal-txn-section thead');
    TableSort.wire(thead, sortState, () => paintTable(currentRows));
  }

  return { open, openInfo, close, init };

})();

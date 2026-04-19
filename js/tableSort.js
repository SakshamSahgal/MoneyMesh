/**
 * tableSort.js
 * Tiny helper for making transaction tables sortable by column.
 * Callers pass a mutable `state` object { col, dir } and a re-render callback.
 */
const TableSort = (() => {

  const keys = {
    date:        t => new Date(t.date || 0).getTime(),
    description: t => (t.description || '').toLowerCase(),
    bank:        t => (t.bank || '').toLowerCase(),
    amount:      t => (t.credit || 0) - (t.debit || 0),
  };

  function sort(rows, col, dir) {
    const key = keys[col];
    if (!key) return rows;
    const sign = dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = key(a), bv = key(b);
      return av < bv ? -sign : av > bv ? sign : 0;
    });
  }

  // Wire a <thead>'s [data-sort] columns. Mutates `state` and invokes `onSort`
  // after each click so the caller can re-render with the new ordering.
  function wire(thead, state, onSort) {
    const ths = thead.querySelectorAll('th[data-sort]');
    ths.forEach(th => {
      th.classList.add('sortable');
      th.addEventListener('click', () => {
        const col = th.dataset.sort;
        if (state.col === col) state.dir = state.dir === 'asc' ? 'desc' : 'asc';
        else { state.col = col; state.dir = 'desc'; }
        paint(ths, state);
        onSort();
      });
    });
    paint(ths, state);
  }

  function paint(ths, state) {
    ths.forEach(th => {
      th.classList.remove('sorted-asc', 'sorted-desc');
      if (th.dataset.sort === state.col) {
        th.classList.add(state.dir === 'asc' ? 'sorted-asc' : 'sorted-desc');
      }
    });
  }

  return { sort, wire };

})();

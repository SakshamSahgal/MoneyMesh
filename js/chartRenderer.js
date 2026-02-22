/**
 * chartRenderer.js
 * Renders the Sankey diagram using D3 + d3-sankey.
 * Handles node coloring, gradient links, labels, and tooltips.
 */
const ChartRenderer = (() => {

  // ── Color Palette ───────────────────────────────────────────────────────────
  const NODE_COLORS = {
    // Balance nodes
    'Balance B/F': '#5dade2',
    'Saved':       '#2ecc71',

    // Income
    'Income':         '#2ecc71',
    'Interest':       '#f1c40f',
    'Cash Deposit':   '#e67e22',
    'Freelance':      '#1abc9c',
    'Bank Transfer':  '#16a085',
    'Refund':         '#27ae60',
    'Other Income':   '#52be80',
    'Prior Savings':  '#a9cce3',

    // Center
    'Total Budget':   '#2980b9',

    // Expenses
    'Food & Dining':  '#3498db',
    'Shopping':       '#f39c12',
    'Entertainment':  '#9b59b6',
    'Investments':    '#1abc9c',
    'Subscriptions':  '#8e44ad',
    'Transport':      '#e67e22',
    'Health':         '#e74c3c',
    'Transfers':      '#95a5a6',
    'Savings':        '#2ecc71',
    'Others':         '#7f8c8d',
  };

  const DEFAULT_COLOR = '#4a90d9';

  function getColor(name) {
    return NODE_COLORS[name] || DEFAULT_COLOR;
  }

  // ── Currency Formatter (Indian Rupees) ──────────────────────────────────────
  const currencyFmt = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  });

  function formatCurrency(amount) {
    return currencyFmt.format(amount);
  }

  // ── Tooltip ─────────────────────────────────────────────────────────────────
  function showTooltip(event, html) {
    const tip = document.getElementById('tooltip');
    tip.innerHTML = html;
    tip.style.display = 'block';
    positionTooltip(event);
  }

  function positionTooltip(event) {
    const tip = document.getElementById('tooltip');
    tip.style.left = (event.clientX + 16) + 'px';
    tip.style.top  = (event.clientY - 10) + 'px';
  }

  function hideTooltip() {
    document.getElementById('tooltip').style.display = 'none';
  }

  // ── Main Render ─────────────────────────────────────────────────────────────
  function render(containerId, data, transactionsByNode) {
    const container = document.getElementById(containerId);
    const svg       = d3.select('#sankey-svg');
    svg.selectAll('*').remove();

    const width   = container.clientWidth  || 1200;
    const height  = Math.max(680, data.nodes.length * 38);
    const margin  = { top: 24, right: 210, bottom: 24, left: 190 };

    svg.attr('width', width).attr('height', height);

    // ── Sankey Layout ─────────────────────────────────────────────────────────
    const sankeyGen = d3.sankey()
      .nodeId(d => d.name)
      .nodeAlign(d3.sankeyLeft)
      .nodeWidth(22)
      .nodePadding(14)
      .extent([
        [margin.left, margin.top],
        [width - margin.right, height - margin.bottom],
      ]);

    const { nodes, links } = sankeyGen({
      nodes: data.nodes.map(d => ({ ...d })),
      links: data.links.map(d => ({ ...d })),
    });

    const g = svg.append('g');

    // ── Gradient Definitions (link colors blend source → target) ──────────────
    const defs = svg.append('defs');
    links.forEach((d, i) => {
      const grad = defs.append('linearGradient')
        .attr('id', `grad-${i}`)
        .attr('gradientUnits', 'userSpaceOnUse')
        .attr('x1', d.source.x1)
        .attr('x2', d.target.x0);
      grad.append('stop')
        .attr('offset', '0%')
        .attr('stop-color', getColor(d.source.name))
        .attr('stop-opacity', 0.5);
      grad.append('stop')
        .attr('offset', '100%')
        .attr('stop-color', getColor(d.target.name))
        .attr('stop-opacity', 0.5);
    });

    // ── Links ─────────────────────────────────────────────────────────────────
    g.append('g')
      .attr('fill', 'none')
      .selectAll('path')
      .data(links)
      .join('path')
        .attr('d', d3.sankeyLinkHorizontal())
        .attr('stroke',       (d, i) => `url(#grad-${i})`)
        .attr('stroke-width', d => Math.max(1, d.width))
        .style('cursor', 'pointer')
        .on('mouseover', function (event, d) {
          d3.select(this).attr('stroke-opacity', 0.9);
          showTooltip(event,
            `<strong>${d.source.name}</strong> &rarr; <strong>${d.target.name}</strong><br>
             ${formatCurrency(d.value)}`
          );
        })
        .on('mousemove', (event) => positionTooltip(event))
        .on('mouseout', function () {
          d3.select(this).attr('stroke-opacity', null);
          hideTooltip();
        });

    // ── Nodes ─────────────────────────────────────────────────────────────────
    g.append('g')
      .selectAll('rect')
      .data(nodes)
      .join('rect')
        .attr('x',      d => d.x0)
        .attr('y',      d => d.y0)
        .attr('width',  d => d.x1 - d.x0)
        .attr('height', d => Math.max(1, d.y1 - d.y0))
        .attr('fill',   d => getColor(d.name))
        .attr('rx', 3)
        .style('cursor', 'pointer')
        .on('mouseover', function (event, d) {
          d3.select(this).attr('opacity', 0.8);
          showTooltip(event,
            `<strong>${d.name}</strong><br>${formatCurrency(d.value)}<br>
             <small style="color:#aaa">Click to see transactions</small>`
          );
        })
        .on('mousemove', (event) => positionTooltip(event))
        .on('mouseout',  function () {
          d3.select(this).attr('opacity', 1);
          hideTooltip();
        })
        .on('click', function (event, d) {
          hideTooltip();
          const txns = (transactionsByNode && transactionsByNode[d.name]) || [];
          Modal.open(d.name, d.value, txns);
        });

    // ── Node Labels — Name (Amount) ───────────────────────────────────────────
    g.append('g')
      .selectAll('text.node-label')
      .data(nodes)
      .join('text')
        .attr('class', 'node-label')
        .attr('x',           d => d.x0 < width / 2 ? d.x0 - 8 : d.x1 + 8)
        .attr('y',           d => (d.y0 + d.y1) / 2 + 5)
        .attr('text-anchor', d => d.x0 < width / 2 ? 'end' : 'start')
        .attr('font-size', '13px')
        .attr('font-family', 'Inter, sans-serif')
        .attr('fill', '#2c3e50')
        .style('cursor', 'pointer')
        .text(d => `${d.name} (${formatCurrency(d.value)})`)
        .on('click', function (event, d) {
          const txns = (transactionsByNode && transactionsByNode[d.name]) || [];
          Modal.open(d.name, d.value, txns);
        });
  }

  return { render, formatCurrency };

})();

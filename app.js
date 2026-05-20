// ============================================================
// CHART & RENDER HELPERS
// ============================================================
Chart.defaults.color = '#6a7b8a';
Chart.defaults.borderColor = '#1f2e3c';
Chart.defaults.font.family = "'JetBrains Mono', monospace";
Chart.defaults.font.size = 10;

const fmt = v => '₹' + (v >= 100000 ? (v/100000).toFixed(1)+'L' : v >= 1000 ? (v/1000).toFixed(0)+'K' : v.toFixed(0));
const fmtFull = v => '₹' + v.toLocaleString('en-IN');
const chartInstances = {};

function destroyChart(id) { if(chartInstances[id]) { chartInstances[id].destroy(); delete chartInstances[id]; } }

function makeLineChart(id, labels, datasets, color) {
  destroyChart(id);
  const el = document.getElementById(id); if(!el) return;
  const ctx = el.getContext('2d');
  const grad = ctx.createLinearGradient(0,0,0,220);
  grad.addColorStop(0, color+'33'); grad.addColorStop(1, color+'00');
  chartInstances[id] = new Chart(ctx, {
    type:'line', data:{ labels, datasets: datasets.map((d,i)=>({
      label:d.label, data:d.data, borderColor:d.color||color,
      backgroundColor:i===0?grad:'transparent', borderWidth:1.8,
      fill:i===0, tension:0.3, pointRadius:0, pointHoverRadius:4
    }))},
    options:{ responsive:true, interaction:{mode:'index',intersect:false},
      plugins:{ legend:{display:datasets.length>1,position:'top',labels:{boxWidth:10,padding:16,font:{size:10}}},
        tooltip:{backgroundColor:'#111922',borderColor:'#1f2e3c',borderWidth:1,padding:10,
          callbacks:{label:ctx=>' '+ctx.dataset.label+': '+fmt(ctx.parsed.y)}}},
      scales:{ x:{grid:{color:'#1f2e3c20'},ticks:{maxTicksLimit:8,maxRotation:0}},
        y:{grid:{color:'#1f2e3c40'},ticks:{callback:fmt}}}}
  });
}

function makeBarChart(id, labels, data, color) {
  destroyChart(id);
  const el = document.getElementById(id); if(!el) return;
  chartInstances[id] = new Chart(el.getContext('2d'), {
    type:'bar', data:{ labels, datasets:[{data,backgroundColor:color+'aa',borderColor:color,borderWidth:1,borderRadius:3}]},
    options:{ responsive:true, plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>' '+fmt(ctx.parsed.y)}}},
      scales:{ x:{grid:{display:false},ticks:{maxRotation:0,font:{size:9}}}, y:{grid:{color:'#1f2e3c40'},ticks:{callback:fmt}}}}
  });
}

function makeDonutChart(id, labels, data, colors) {
  destroyChart(id);
  const el = document.getElementById(id); if(!el) return;
  chartInstances[id] = new Chart(el.getContext('2d'), {
    type:'doughnut', data:{ labels, datasets:[{data,backgroundColor:colors,borderColor:'#0b1118',borderWidth:3}]},
    options:{ responsive:true, cutout:'65%',
      plugins:{ legend:{position:'bottom',labels:{padding:16,boxWidth:10}},
        tooltip:{callbacks:{label:ctx=>' '+fmt(ctx.parsed)+' ('+ ((ctx.parsed/(data.reduce((a,b)=>a+b,0)))*100).toFixed(1)+'%)'}}}}
  });
}

// ============================================================
// AGGREGATION HELPERS
// ============================================================
function aggDaily(rows) {
  const map = {};
  rows.forEach(r => {
    if(r.type === 'Purchase Return') return;
    const key = r.date.toISOString().slice(0,10);
    map[key] = (map[key]||0) + r.purchase;
  });
  const sorted = Object.entries(map).sort((a,b)=>a[0].localeCompare(b[0]));
  return { labels: sorted.map(s=>s[0].slice(5)), data: sorted.map(s=>s[1]) };
}

function aggWeekly(rows) {
  const map = {};
  rows.forEach(r => {
    if(r.type === 'Purchase Return') return;
    const d = new Date(r.date);
    const day = d.getDay();
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((day+6)%7));
    const key = monday.toISOString().slice(0,10);
    map[key] = (map[key]||0) + r.purchase;
  });
  const sorted = Object.entries(map).sort((a,b)=>a[0].localeCompare(b[0]));
  return { labels: sorted.map(s=>s[0].slice(5)), data: sorted.map(s=>s[1]) };
}

function aggSuppliers(rows, top=8) {
  const map = {};
  rows.forEach(r => {
    if(!r.vendor || r.type === 'Purchase Return') return;
    map[r.vendor] = (map[r.vendor]||0) + r.purchase;
  });
  return Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0, top);
}

function totalPurchase(rows) { return rows.filter(r=>r.type!=='Purchase Return').reduce((s,r)=>s+r.purchase,0); }
function totalReturns(rows) { return rows.filter(r=>r.type==='Purchase Return').reduce((s,r)=>s+r.purchaseReturn,0); }
function totalPaid(rows) { return rows.filter(r=>r.payment&&r.payment.toLowerCase()==='paid').reduce((s,r)=>s+r.purchase,0); }
function totalUnpaid(rows) { return rows.filter(r=>!r.payment||r.payment.toLowerCase()!=='paid').reduce((s,r)=>s+Math.abs(r.balance),0); }
function invoiceCount(rows) { return rows.length; }

// ============================================================
// SUPPLIER BARS RENDERER
// ============================================================
function renderSupplierBars(containerId, rows, color) {
  const el = document.getElementById(containerId); if(!el) return;
  const suppliers = aggSuppliers(rows);
  if(!suppliers.length) { el.innerHTML='<div class="empty-state"><p>No supplier data</p></div>'; return; }
  const max = Math.max(...suppliers.map(s=>s[1]));
  el.innerHTML = suppliers.map(([name,val]) => `
    <div class="supplier-row" onclick="openVendorLedger('${name.replace(/'/g,"\\'")}')">
      <div class="supplier-name" title="${name}">${name}</div>
      <div class="bar-outer"><div class="bar-inner" style="width:${(val/max*100).toFixed(1)}%;background:${color};"></div></div>
      <div class="supplier-val">${fmt(val)}</div>
    </div>`).join('');
}

// ============================================================
// RENDER PANELS
// ============================================================
function renderLoading() {
  if(!document.getElementById('panel-ALL')) {
    const main = document.querySelector('.main');
    if(main) main.innerHTML = `<div class="loading-overlay" id="loading"><div class="spinner"></div><div class="loading-text">Loading data from Google Sheets...</div></div>`;
  }
}

function renderAll() {
  renderFilters();
  renderOverview();
  renderBranch('COK', '#f0b847', 'accent1');
  renderBranch('CK', '#5b9cf5', 'accent2');
  renderBranch('CLT', '#34d399', 'accent3');
  renderPvt();
  renderLedger();
}

function renderFilters() {
  const vendorSelect = document.getElementById('vendorFilter');
  const cur = STATE.filters.vendor;
  const opts = '<option value="">All Vendors</option>' +
    STATE.vendors.map(v=>`<option value="${v}" ${v===cur?'selected':''}>${v}</option>`).join('');
  if(vendorSelect) vendorSelect.innerHTML = opts;
}

function renderOverview() {
  const cok = STATE.filtered.COK, ck = STATE.filtered.CK, clt = STATE.filtered.CLT;
  const all = [...cok,...ck,...clt];
  const tp = totalPurchase;

  document.getElementById('allTotal').innerHTML = `<span class="rupee">₹</span>${fmtFull(tp(all)).slice(1)}`;
  document.getElementById('allTotalSub').textContent = `${invoiceCount(all)} invoices`;
  document.getElementById('cokTotal').innerHTML = `<span class="rupee">₹</span>${fmtFull(tp(cok)).slice(1)}`;
  document.getElementById('ckTotal').innerHTML = `<span class="rupee">₹</span>${fmtFull(tp(ck)).slice(1)}`;
  document.getElementById('cltTotal').innerHTML = `<span class="rupee">₹</span>${fmtFull(tp(clt)).slice(1)}`;

  // Branch compare cards
  ['COK','CK','CLT'].forEach(b => {
    const rows = STATE.filtered[b];
    const net = tp(rows) - totalReturns(rows);
    const ret = totalReturns(rows);
    const suppliers = aggSuppliers(rows, 1);
    document.getElementById(`bc${b}Val`).textContent = fmtFull(net);
    document.getElementById(`bc${b}Ret`).textContent = ret > 0 ? `Net (after ${fmtFull(ret)} returns)` : 'No returns recorded';
    document.getElementById(`bc${b}Top`).textContent = suppliers.length ? suppliers[0][0] : 'N/A';
    document.getElementById(`bc${b}TopVal`).textContent = suppliers.length ? `${fmtFull(suppliers[0][1])} → ${((suppliers[0][1]/tp(rows))*100||0).toFixed(0)}% of total` : '';
  });

  // Weekly trend - all branches
  const cokW = aggWeekly(cok), ckW = aggWeekly(ck), cltW = aggWeekly(clt);
  const allWeeks = [...new Set([...cokW.labels,...ckW.labels,...cltW.labels])].sort();
  const weekMap = (w, labels, data) => { const i=labels.indexOf(w); return i>=0?data[i]:0; };
  makeLineChart('allWeeklyChart', allWeeks,
    [{ label:'COK', data:allWeeks.map(w=>weekMap(w,cokW.labels,cokW.data)), color:'#f0b847' },
     { label:'CK',  data:allWeeks.map(w=>weekMap(w,ckW.labels,ckW.data)),  color:'#5b9cf5' },
     { label:'CLT', data:allWeeks.map(w=>weekMap(w,cltW.labels,cltW.data)), color:'#34d399' }], '#f0b847');

  // Donut
  makeDonutChart('allDonutChart', ['COK','CK','CLT'], [tp(cok),tp(ck),tp(clt)], ['#f0b847','#5b9cf5','#34d399']);

  // Combined daily
  const allDaily = aggDaily(all);
  makeLineChart('allDailyChart', allDaily.labels, [{label:'All Branches',data:allDaily.data,color:'#0a9e56'}], '#0a9e56');
}

function renderBranch(branch, color, accentClass) {
  const rows = STATE.filtered[branch];
  const pre = branch.toLowerCase();
  const tp = totalPurchase(rows), tr = totalReturns(rows), net = tp - tr;
  const paid = totalPaid(rows), unpaid = totalUnpaid(rows);

  document.getElementById(`${pre}Total2`).innerHTML = `<span class="rupee">₹</span>${fmtFull(tp).slice(1)}`;
  document.getElementById(`${pre}TotalSub`).textContent = `${invoiceCount(rows)} invoices`;
  document.getElementById(`${pre}Net`).innerHTML = `<span class="rupee">₹</span>${fmtFull(net).slice(1)}`;
  document.getElementById(`${pre}NetSub`).innerHTML = tr > 0 ? `<span class="good">After ${fmtFull(tr)} returns</span>` : 'No returns';

  const kpi3El = document.getElementById(`${pre}Kpi3`);
  const kpi3Sub = document.getElementById(`${pre}Kpi3Sub`);
  if(paid > 0) {
    kpi3El.innerHTML = `<span class="rupee">₹</span>${fmtFull(paid).slice(1)}`;
    kpi3Sub.innerHTML = `<span class="good">${((paid/tp)*100).toFixed(1)}% settled</span>`;
  } else {
    kpi3El.innerHTML = `<span class="rupee">₹</span>${fmtFull(tr).slice(1)}`;
    kpi3Sub.textContent = `${((tr/tp)*100).toFixed(1)}% of gross`;
  }

  const kpi4El = document.getElementById(`${pre}Kpi4`);
  const kpi4Sub = document.getElementById(`${pre}Kpi4Sub`);
  const unpaidPct = tp > 0 ? ((unpaid/tp)*100).toFixed(0) : 0;
  if(unpaidPct >= 100) {
    kpi4El.innerHTML = `<span style="color:var(--accent4)">100%</span>`;
    kpi4Sub.innerHTML = `<span class="warn">All Outstanding</span>`;
  } else {
    kpi4El.innerHTML = `<span class="rupee">₹</span>${fmtFull(unpaid).slice(1)}`;
    kpi4Sub.innerHTML = `<span class="warn">${unpaidPct}% unpaid</span>`;
  }

  // Charts
  const daily = aggDaily(rows);
  makeLineChart(`${pre}DailyChart`, daily.labels, [{label:`${branch} Purchase`, data:daily.data, color}], color);
  renderSupplierBars(`${pre}Suppliers`, rows, color);
  const weekly = aggWeekly(rows);
  makeBarChart(`${pre}WeeklyChart`, weekly.labels, weekly.data, color);

  // Payment chart for CK
  if(branch === 'CK') {
    document.getElementById('ckPaidVal').textContent = fmtFull(paid);
    document.getElementById('ckUnpaidVal').textContent = fmtFull(unpaid);
    document.getElementById('ckPctVal').textContent = tp>0?((paid/tp)*100).toFixed(1)+'%':'0%';
    makeDonutChart('ckPayChart', ['Paid','Unpaid'], [paid||1, unpaid||1], ['#34d399aa','#ef6461aa']);
  }
}

function renderPvt() {
  const rows = STATE.filtered.PVT;
  const total = rows.reduce((s,r)=>s+r.purchase,0);
  const paid = rows.reduce((s,r)=>s+(r.paidAmount||0),0);
  const unpaid = total - paid;

  document.getElementById('pvtTotal').innerHTML = `<span class="rupee">₹</span>${fmtFull(total).slice(1)}`;
  document.getElementById('pvtTotalSub').textContent = `${rows.length} invoices`;
  document.getElementById('pvtPaid').innerHTML = `<span class="rupee" style="color:var(--muted2)">₹</span><span style="color:var(--accent3)">${fmtFull(paid).slice(1)}</span>`;
  document.getElementById('pvtPaidSub').innerHTML = paid>0?`<span class="good">${fmtFull(paid)} recovered</span>`:'<span class="warn">₹0 recovered</span>';
  document.getElementById('pvtOutstanding').innerHTML = `<span class="rupee">₹</span>${fmtFull(unpaid).slice(1)}`;
  document.getElementById('pvtOutstandingSub').innerHTML = `<span class="warn">${total>0?((unpaid/total)*100).toFixed(0):0}% unpaid</span>`;
  document.getElementById('pvtAvg').innerHTML = `<span class="rupee">₹</span>${rows.length>0?fmtFull(total/rows.length).slice(1):'0'}`;
  document.getElementById('pvtAvgSub').textContent = `Across ${rows.length} bills`;

  // By restaurant
  const restMap = {};
  rows.forEach(r => { restMap[r.vendor] = (restMap[r.vendor]||0)+r.purchase; });
  const rests = Object.entries(restMap).sort((a,b)=>b[1]-a[1]);
  makeBarChart('pvtRestChart', rests.map(r=>r[0].length>20?r[0].slice(0,20)+'…':r[0]), rests.map(r=>r[1]),
    rests.length>1?'#ef6461':'#f0b847');

  // By month
  const monthMap = {};
  rows.forEach(r => {
    const key = r.date.toLocaleString('en-IN',{month:'short',year:'numeric'});
    monthMap[key] = (monthMap[key]||0)+r.purchase;
  });
  const months = Object.entries(monthMap);
  makeBarChart('pvtMonthChart', months.map(m=>m[0]), months.map(m=>m[1]), '#ef6461');

  // Breakdown
  const breakdownEl = document.getElementById('pvtBreakdown');
  if(breakdownEl) {
    breakdownEl.innerHTML = rests.map(([name,val])=>`
      <div class="payment-pill">
        <span class="pill-label">${name}</span>
        <span class="pill-val unpaid">${fmtFull(val)}</span>
      </div>`).join('') + `
      <div style="padding:14px 16px;background:var(--surface2);border-radius:8px;margin-top:8px;">
        <div style="font-size:0.7rem;color:var(--muted);font-family:'JetBrains Mono',monospace;margin-bottom:6px;">NOTE</div>
        <div style="font-size:0.78rem;color:var(--muted2);">All Pvt Ltd bills are marked <span style="color:var(--accent4)">Unpaid</span>. ${fmtFull(unpaid)} in receivables pending.</div>
      </div>`;
  }
}

// ============================================================
// VENDOR LEDGER
// ============================================================
let ledgerSort = { col: 'date', asc: true };

function openVendorLedger(vendor) {
  STATE.filters.vendor = vendor;
  document.getElementById('vendorFilter').value = vendor;
  applyFilters();
  // Switch to ledger tab
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
  document.querySelector('[data-branch="LEDGER"]').classList.add('active');
  document.getElementById('panel-LEDGER').classList.add('active');
  renderAll();
}

function renderLedger() {
  const vendor = STATE.filters.vendor;
  const outlet = document.getElementById('ledgerOutlet')?.value || '';
  if(!vendor) {
    document.getElementById('ledgerContent').innerHTML = '<div class="empty-state"><div class="icon">📋</div><p>Select a vendor from the filter bar to view their ledger</p></div>';
    document.getElementById('ledgerSummary').innerHTML = '';
    return;
  }

  // Gather all transactions for this vendor, filtered by outlet if selected
  let txns = [];
  const branches = outlet ? [outlet] : ['COK','CK','CLT'];
  branches.forEach(branch => {
    STATE.filtered[branch].filter(r=>r.vendor===vendor).forEach(r=>{
      txns.push({...r, branch});
    });
  });

  // Sort
  txns.sort((a,b) => {
    let va, vb;
    switch(ledgerSort.col) {
      case 'date': va=a.date; vb=b.date; break;
      case 'branch': va=a.branch; vb=b.branch; break;
      case 'purchase': va=a.purchase; vb=b.purchase; break;
      case 'balance': va=a.balance; vb=b.balance; break;
      default: va=a.date; vb=b.date;
    }
    if(va < vb) return ledgerSort.asc ? -1 : 1;
    if(va > vb) return ledgerSort.asc ? 1 : -1;
    return 0;
  });

  // Summary
  const totalP = txns.filter(t=>t.type!=='Purchase Return').reduce((s,t)=>s+t.purchase,0);
  const totalR = txns.filter(t=>t.type==='Purchase Return').reduce((s,t)=>s+t.purchaseReturn,0);
  const net = totalP - totalR;
  const paidCount = txns.filter(t=>t.payment&&t.payment.toLowerCase()==='paid').length;

  document.getElementById('ledgerSummary').innerHTML = `
    <div class="kpi accentB"><div class="kpi-label">Total Purchased</div><div class="kpi-value"><span class="rupee">₹</span>${fmtFull(totalP).slice(1)}</div><div class="kpi-sub">${txns.length} transactions</div></div>
    <div class="kpi accent4"><div class="kpi-label">Returns</div><div class="kpi-value"><span class="rupee">₹</span>${fmtFull(totalR).slice(1)}</div><div class="kpi-sub">${txns.filter(t=>t.type==='Purchase Return').length} returns</div></div>
    <div class="kpi accent3"><div class="kpi-label">Net Balance</div><div class="kpi-value"><span class="rupee">₹</span>${fmtFull(net).slice(1)}</div><div class="kpi-sub">After returns</div></div>
    <div class="kpi accent5"><div class="kpi-label">Payment Status</div><div class="kpi-value">${paidCount}/${txns.length}</div><div class="kpi-sub">${paidCount>0?'<span class="good">'+((paidCount/txns.length)*100).toFixed(0)+'% paid</span>':'<span class="warn">All unpaid</span>'}</div></div>`;

  // Table
  const arrow = col => ledgerSort.col===col ? (ledgerSort.asc?'↑':'↓') : '';
  let html = `<div class="ledger-table-wrap"><table class="ledger-table"><thead><tr>
    <th onclick="sortLedger('date')">Date <span class="sort-arrow">${arrow('date')}</span></th>
    <th onclick="sortLedger('branch')">Branch <span class="sort-arrow">${arrow('branch')}</span></th>
    <th>Invoice No.</th><th>Type</th>
    <th onclick="sortLedger('purchase')" style="text-align:right">Purchase <span class="sort-arrow">${arrow('purchase')}</span></th>
    <th style="text-align:right">Return</th>
    <th onclick="sortLedger('balance')" style="text-align:right">Balance <span class="sort-arrow">${arrow('balance')}</span></th>
    <th>Status</th></tr></thead><tbody>`;

  txns.forEach(t => {
    const brClass = t.branch.toLowerCase();
    const typeTag = t.type==='Purchase Return'?'tag-return':'tag-normal';
    const payTag = t.payment&&t.payment.toLowerCase()==='paid'?'tag-paid':'tag-unpaid';
    html += `<tr>
      <td>${t.date.toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}</td>
      <td class="branch-tag"><span class="tag tag-${brClass}">${t.branch}</span></td>
      <td>${t.invoiceNo||'—'}</td>
      <td><span class="tag ${typeTag}">${t.type}</span></td>
      <td class="amount">${t.purchase?fmtFull(t.purchase):'—'}</td>
      <td class="amount ${t.purchaseReturn?'negative':''}">${t.purchaseReturn?fmtFull(t.purchaseReturn):'—'}</td>
      <td class="amount ${t.balance<0?'negative':'positive'}">${fmtFull(t.balance)}</td>
      <td><span class="tag ${payTag}">${t.payment||'Unknown'}</span></td></tr>`;
  });
  html += '</tbody></table></div>';
  document.getElementById('ledgerContent').innerHTML = html;
}

function sortLedger(col) {
  if(ledgerSort.col===col) ledgerSort.asc=!ledgerSort.asc;
  else { ledgerSort.col=col; ledgerSort.asc=true; }
  renderLedger();
}

// ============================================================
// EVENT HANDLERS
// ============================================================
function initEvents() {
  // Tab switching
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('panel-'+tab.dataset.branch).classList.add('active');
    });
  });

  // Date filters
  document.getElementById('dateFrom')?.addEventListener('change', e => { STATE.filters.dateFrom=e.target.value; applyFilters(); renderAll(); });
  document.getElementById('dateTo')?.addEventListener('change', e => { STATE.filters.dateTo=e.target.value; applyFilters(); renderAll(); });

  // Vendor filter
  document.getElementById('vendorFilter')?.addEventListener('change', e => { STATE.filters.vendor=e.target.value; applyFilters(); renderAll(); });

  // Ledger outlet select
  document.getElementById('ledgerOutlet')?.addEventListener('change', e => { renderLedger(); });

  // Presets
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const preset = btn.dataset.preset;
      const now = new Date();
      let from = '', to = '';
      if(preset==='7d') { from = new Date(now-7*86400000).toISOString().slice(0,10); to = now.toISOString().slice(0,10); }
      else if(preset==='month') { from = new Date(now.getFullYear(),now.getMonth(),1).toISOString().slice(0,10); to = now.toISOString().slice(0,10); }
      else if(preset==='all') { from=''; to=''; }
      document.getElementById('dateFrom').value = from;
      document.getElementById('dateTo').value = to;
      STATE.filters.dateFrom = from; STATE.filters.dateTo = to;
      document.querySelectorAll('.preset-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      applyFilters(); renderAll();
    });
  });

  // Clear filters
  document.getElementById('btnClear')?.addEventListener('click', () => {
    STATE.filters = {dateFrom:'',dateTo:'',vendor:''};
    document.getElementById('dateFrom').value='';
    document.getElementById('dateTo').value='';
    document.getElementById('vendorFilter').value='';
    document.querySelectorAll('.preset-btn').forEach(b=>b.classList.remove('active'));
    applyFilters(); renderAll();
  });

  // Refresh
  document.getElementById('btnRefresh')?.addEventListener('click', () => {
    document.getElementById('btnRefresh').classList.add('loading');
    fetchAllData().then(()=>document.getElementById('btnRefresh').classList.remove('loading'));
  });

  // Auto refresh
  setInterval(()=>fetchAllData(), CONFIG.REFRESH_MS);
}

// ============================================================
// INIT
// ============================================================
document.fonts.ready.then(() => {
  initEvents();
  fetchAllData();
});

// ============================================================
// CONFIG & DATA LAYER
// ============================================================
const CONFIG = {
  SPREADSHEET_ID: '1vvFjPb3BjFNu9swYlkIYKo_NI_QskOqdmuGaanXYZTM',
  API_KEY: (typeof SECRETS !== 'undefined' && SECRETS.API_KEY) || '',
  SHEETS: {
    COK: 'COK Purchase ',
    CK: 'CK Purchase',
    CLT: 'CLT Purchase',
    PVT: 'Pvt Ltd Bills'
  },
  REFRESH_MS: 5 * 60 * 1000
};

const STATE = {
  raw: { COK: [], CK: [], CLT: [], PVT: [] },
  filtered: { COK: [], CK: [], CLT: [], PVT: [] },
  vendors: [],
  filters: { dateFrom: '', dateTo: '', vendor: '' },
  lastSync: null,
  loading: true
};

function cleanVendor(name) {
  if (!name) return '';
  return name.replace(/\s*\[(Supplier|Restaurant)\]\s*/gi, '').trim();
}

function parseDate(str) {
  if (!str) return null;
  // Handle "1 Apr 2026" format
  let d = new Date(str);
  if (!isNaN(d)) return d;
  // Handle "01-Jan-26" format
  const parts = str.match(/(\d{1,2})-(\w{3})-(\d{2,4})/);
  if (parts) {
    let year = parseInt(parts[3]);
    if (year < 100) year += 2000;
    d = new Date(`${parts[2]} ${parts[1]}, ${year}`);
    if (!isNaN(d)) return d;
  }
  return null;
}

function parseNum(val) {
  if (val === '' || val === null || val === undefined) return 0;
  return parseFloat(String(val).replace(/,/g, '')) || 0;
}

function parseBranchRow(row, headers) {
  const get = h => {
    const i = headers.indexOf(h);
    return i >= 0 ? row[i] || '' : '';
  };
  return {
    date: parseDate(get('Invoice Date')),
    dateStr: get('Invoice Date'),
    vendor: cleanVendor(get('From') || get('Supplier')),
    vendorRaw: get('From') || get('Supplier'),
    invoiceNo: get('Invoice No.'),
    type: get('Type') || 'Normal',
    purchase: parseNum(get('PURCHASE')),
    purchaseReturn: parseNum(get('PURCHASE RETURN')),
    balance: parseNum(get('BALANCE')),
    payment: get('Payment') || get('Payment Status') || ''
  };
}

function parsePvtRow(row, headers) {
  const get = h => {
    const i = headers.indexOf(h);
    return i >= 0 ? row[i] || '' : '';
  };
  return {
    date: parseDate(get('Invoice Date')),
    dateStr: get('Invoice Date'),
    vendor: cleanVendor(get('To')),
    vendorRaw: get('To'),
    invoiceNo: get('Invoice No.'),
    type: get('Type') || 'Normal',
    purchase: parseNum(get('Total (₹)')),
    purchaseReturn: 0,
    balance: parseNum(get('Total (₹)')),
    payment: get('Payment') || '',
    paidAmount: parseNum(get('Paid Amount (₹)'))
  };
}

async function fetchSheet(sheetName) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(sheetName)}?key=${CONFIG.API_KEY}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch ${sheetName}: ${resp.status}`);
  const json = await resp.json();
  return json.values || [];
}

async function fetchAllData() {
  STATE.loading = true;
  renderLoading();
  try {
    const [cokRaw, ckRaw, cltRaw, pvtRaw] = await Promise.all([
      fetchSheet(CONFIG.SHEETS.COK),
      fetchSheet(CONFIG.SHEETS.CK),
      fetchSheet(CONFIG.SHEETS.CLT),
      fetchSheet(CONFIG.SHEETS.PVT)
    ]);
    STATE.raw.COK = cokRaw.length > 1 ? cokRaw.slice(1).map(r => parseBranchRow(r, cokRaw[0])).filter(r => r.date) : [];
    STATE.raw.CK = ckRaw.length > 1 ? ckRaw.slice(1).map(r => parseBranchRow(r, ckRaw[0])).filter(r => r.date) : [];
    STATE.raw.CLT = cltRaw.length > 1 ? cltRaw.slice(1).map(r => parseBranchRow(r, cltRaw[0])).filter(r => r.date) : [];
    STATE.raw.PVT = pvtRaw.length > 1 ? pvtRaw.slice(1).map(r => parsePvtRow(r, pvtRaw[0])).filter(r => r.date) : [];

    // Collect unique vendors
    const vs = new Set();
    ['COK','CK','CLT'].forEach(b => STATE.raw[b].forEach(r => { if(r.vendor) vs.add(r.vendor); }));
    STATE.vendors = [...vs].sort();

    STATE.lastSync = new Date();
    STATE.loading = false;
    applyFilters();
    renderAll();
    updateSyncInfo();
  } catch(err) {
    STATE.loading = false;
    console.error('Fetch error:', err);
    document.getElementById('loading')?.remove();
    alert('Failed to load data: ' + err.message);
  }
}

function applyFilters() {
  const { dateFrom, dateTo, vendor } = STATE.filters;
  const from = dateFrom ? new Date(dateFrom) : null;
  const to = dateTo ? new Date(dateTo + 'T23:59:59') : null;

  ['COK','CK','CLT','PVT'].forEach(branch => {
    STATE.filtered[branch] = STATE.raw[branch].filter(row => {
      if (from && row.date < from) return false;
      if (to && row.date > to) return false;
      if (vendor && row.vendor !== vendor) return false;
      return true;
    });
  });
}

function updateSyncInfo() {
  const el = document.getElementById('syncTime');
  if (el && STATE.lastSync) {
    el.textContent = STATE.lastSync.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  }
}

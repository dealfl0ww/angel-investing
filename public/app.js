// Angel Portfolio front end — vanilla JS, no build step.
const $ = (s) => document.querySelector(s);
let state = { settings: {}, investments: [], documents: [], newsItems: [] };
let liveNews = [];
let newsErrors = [];
let focusId = null; // when set, news + docs filter to one company
let editingId = null;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : '#');
const money = (n, compact = false) =>
  n == null ? '–' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0, notation: compact && Math.abs(n) >= 1e6 ? 'compact' : 'standard' }).format(n);
const fmtDate = (d) => (d ? new Date(d.length === 10 ? d + 'T12:00:00' : d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '');
const companyName = (invId) => state.investments.find((i) => i.id === invId)?.company || 'General';

function valueOf(inv) {
  if (inv.currentValue != null) return inv.currentValue;
  if (inv.status === 'Written off') return 0;
  return inv.amount || 0;
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 2600);
}

async function api(method, url, body) {
  const opts = { method, headers: {} };
  if (body instanceof FormData) opts.body = body;
  else if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Request failed (${r.status})`);
  return r.status === 204 ? null : r.json();
}

async function load() {
  state = await api('GET', '/api/state');
  render();
  loadNews();
}

// ---------- Portfolio ----------
function renderPortfolio() {
  const invs = state.investments;
  const invested = invs.reduce((s, i) => s + (i.amount || 0), 0);
  const value = invs.reduce((s, i) => s + valueOf(i), 0);
  const gain = value - invested;
  const pct = invested ? (gain / invested) * 100 : 0;

  $('#totalValue').textContent = money(value);
  const d = $('#totalDelta');
  d.className = 'delta ' + (gain > 0 ? 'up' : gain < 0 ? 'down' : 'flat');
  d.textContent = invested ? `${gain >= 0 ? '+' : '−'}${money(Math.abs(gain))} (${gain >= 0 ? '+' : '−'}${Math.abs(pct).toFixed(1)}%) all time` : 'Add your first investment to get started';

  $('#statInvested').textContent = money(invested);
  $('#statMoic').textContent = invested ? (value / invested).toFixed(2) + 'x' : '–';
  $('#statCount').textContent = invs.length;
  $('#statAvg').textContent = invs.length ? money(invested / invs.length) : '–';

  const { targetCount = 10, targetYear = 2027 } = state.settings;
  $('#goalText').innerHTML = `<strong>${invs.length} of ${targetCount}</strong> investments — goal by end of ${esc(targetYear)}`;
  $('#goalDots').innerHTML = Array.from({ length: Math.max(targetCount, invs.length) }, (_, i) => `<i class="${i < invs.length ? 'on' : ''}"></i>`).join('');

  const sorted = [...invs].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  $('#holdings').innerHTML = sorted.length
    ? sorted.map((i) => {
        const v = valueOf(i);
        const m = i.amount ? v / i.amount : null;
        const cls = m == null || m === 1 ? 'flat' : m > 1 ? 'up' : 'down';
        const terms = [i.instrument, i.valuationCap ? `${money(i.valuationCap, true)} cap` : '', i.discount ? `${i.discount}% disc.` : ''].filter(Boolean).join(' · ');
        return `<li data-id="${esc(i.id)}" class="${focusId === i.id ? 'active' : ''}">
          <div><div class="name">${esc(i.company)} ${i.status !== 'Active' ? `<span class="pill">${esc(i.status)}</span>` : ''}</div>
          <div class="sub">${esc([i.stage, i.sector].filter(Boolean).join(' · '))}${terms ? ' — ' + esc(terms) : ''}${i.date ? ' — ' + fmtDate(i.date) : ''}</div></div>
          <div class="val"><div>${money(v)}</div><div class="sub ${cls}">${m == null ? '' : m.toFixed(2) + 'x'} on ${money(i.amount)}</div></div>
          <button class="xbtn edit" data-edit="${esc(i.id)}" title="Edit">✎</button>
        </li>`;
      }).join('')
    : '<li class="empty">No investments yet. Click “+ Add investment”.</li>';

  renderChart();
}

function renderChart() {
  const svg = $('#chart');
  // Build a timeline of events: each investment adds its check, each mark revalues it.
  const events = [];
  for (const i of state.investments) {
    if (!i.date) continue;
    events.push({ t: i.date, id: i.id, invest: i.amount || 0, value: i.amount || 0 });
    for (const m of i.marks || []) events.push({ t: m.date, id: i.id, value: m.value });
  }
  events.sort((a, b) => a.t.localeCompare(b.t));
  if (!events.length) { svg.innerHTML = ''; return; }
  const cur = {}; let invested = 0; const pts = [];
  for (const e of events) {
    if (e.invest !== undefined) invested += e.invest;
    cur[e.id] = e.value;
    pts.push({ t: e.t, invested, value: Object.values(cur).reduce((s, v) => s + v, 0) });
  }
  // End today with the current (authoritative) numbers.
  pts.push({ t: new Date().toISOString().slice(0, 10), invested, value: state.investments.reduce((s, i) => s + valueOf(i), 0) });
  const ts = pts.map((p) => new Date(p.t).getTime());
  let t0 = Math.min(...ts), t1 = Math.max(...ts);
  if (t1 - t0 < 864e5 * 30) t0 = t1 - 864e5 * 30;
  const vmax = Math.max(...pts.map((p) => Math.max(p.value, p.invested)), 1) * 1.1;
  const W = 600, H = 160, pad = 6;
  const x = (t) => pad + ((new Date(t).getTime() - t0) / (t1 - t0)) * (W - pad * 2);
  const y = (v) => H - pad - (v / vmax) * (H - pad * 2);
  const step = (key) => {
    let d = `M${x(pts[0].t) - 0} ${y(0)}`;
    let prev = 0;
    for (const p of pts) { d += ` L${x(p.t)} ${y(prev)} L${x(p.t)} ${y(p[key])}`; prev = p[key]; }
    return d;
  };
  const up = pts.at(-1).value >= invested;
  const color = up ? 'var(--green)' : 'var(--red)';
  svg.innerHTML = `
    <path d="${step('invested')}" fill="none" stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="4 4" vector-effect="non-scaling-stroke"/>
    <path d="${step('value')}" fill="none" stroke="${color}" stroke-width="2.5" vector-effect="non-scaling-stroke"/>`;
}

// ---------- News ----------
async function loadNews() {
  if (!state.investments.length) { liveNews = []; newsErrors = []; renderNews(); return; }
  $('#newsList').innerHTML = '<li class="empty">Loading news…</li>';
  try {
    const r = await api('GET', '/api/news/live');
    liveNews = r.items; newsErrors = r.errors;
  } catch (e) {
    liveNews = []; newsErrors = [{ company: 'News', error: e.message }];
  }
  renderNews();
}

function renderNews() {
  const saved = state.newsItems.map((n) => ({ ...n, company: companyName(n.investmentId) }));
  let items = [...saved, ...liveNews];
  if (focusId) items = items.filter((n) => n.investmentId === focusId);
  items.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const errs = newsErrors.filter((e) => !focusId || e.investmentId === focusId);
  const errHtml = errs.map((e) => `<li class="empty">Couldn’t load news for ${esc(e.company)}: ${esc(e.error)}</li>`).join('');
  if (!items.length) {
    $('#newsList').innerHTML = errHtml || `<li class="empty">${state.investments.length ? 'No news found yet. Early-stage companies are often quiet — save LinkedIn posts here manually.' : 'Add an investment to see news.'}</li>`;
    return;
  }
  $('#newsList').innerHTML = items.map((n) => `
    <li><div class="body">
      <a class="title" href="${esc(safeUrl(n.url))}" target="_blank" rel="noopener noreferrer">${esc(n.title || n.url)}</a>
      <div class="meta"><span class="tag">${esc(n.company)}</span> · ${esc(n.source)}${n.date ? ' · ' + fmtDate(n.date) : ''}${n.manual ? ' · saved' : ''}</div>
    </div>${n.manual ? `<button class="xbtn" data-delnews="${esc(n.id)}" title="Remove">×</button>` : ''}</li>`).join('') + errHtml;
}

// ---------- Documents ----------
function companyOptions(selected, includeGeneral = true) {
  return (includeGeneral ? `<option value="">General / not company-specific</option>` : '') +
    state.investments.map((i) => `<option value="${esc(i.id)}" ${i.id === selected ? 'selected' : ''}>${esc(i.company)}</option>`).join('');
}

function renderDocs() {
  $('#uploadCompany').innerHTML = companyOptions(focusId);
  let docs = [...state.documents].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  if (focusId) docs = docs.filter((d) => d.investmentId === focusId);
  $('#docRows').innerHTML = docs.length
    ? docs.map((d) => `<tr>
        <td><a href="/api/documents/${esc(d.id)}/file" target="_blank" rel="noopener">${esc(d.name)}</a>
          ${d.note ? `<div class="note">${esc(d.note)}</div>` : ''}</td>
        <td>${esc(companyName(d.investmentId))}</td>
        <td><span class="pill">${esc(d.docType)}</span></td>
        <td>${fmtDate(d.uploadedAt)}</td>
        <td style="white-space:nowrap"><a class="xbtn" href="/api/documents/${esc(d.id)}/file?download=1" title="Download">⤓</a>
          <button class="xbtn" data-deldoc="${esc(d.id)}" title="Delete">×</button></td>
      </tr>`).join('')
    : `<tr><td colspan="5" class="empty">No documents yet${focusId ? ' for this company' : ''}.</td></tr>`;
}

function render() {
  const f = state.investments.find((i) => i.id === focusId);
  if (!f) focusId = null;
  $('#focus').hidden = !f;
  if (f) $('#focusName').textContent = f.company;
  renderPortfolio();
  renderNews();
  renderDocs();
}

// ---------- Investment dialog ----------
function openInvestment(inv) {
  editingId = inv?.id || null;
  const form = $('#invForm');
  form.reset();
  $('#invTitle').textContent = inv ? `Edit ${inv.company}` : 'Add investment';
  $('#deleteInv').hidden = !inv;
  if (inv) for (const el of form.elements) if (el.name && inv[el.name] != null) el.value = inv[el.name];
  if (!inv) form.date.value = new Date().toISOString().slice(0, 10);
  $('#invDialog').returnValue = '';
  $('#invDialog').showModal();
}

$('#addInvestment').onclick = () => openInvestment(null);
$('#invDialog').addEventListener('close', async () => {
  if ($('#invDialog').returnValue !== 'save') return;
  const body = Object.fromEntries(new FormData($('#invForm')));
  try {
    if (editingId) await api('PUT', `/api/investments/${editingId}`, body);
    else await api('POST', '/api/investments', body);
    toast(editingId ? 'Investment updated' : 'Investment added');
    await load();
  } catch (e) { toast(e.message); }
});
$('#deleteInv').onclick = async () => {
  if (!confirm('Delete this investment and all of its documents? This cannot be undone.')) return;
  $('#invDialog').close();
  await api('DELETE', `/api/investments/${editingId}`);
  toast('Investment deleted');
  load();
};

$('#holdings').addEventListener('click', (e) => {
  const edit = e.target.closest('[data-edit]');
  if (edit) return openInvestment(state.investments.find((i) => i.id === edit.dataset.edit));
  const li = e.target.closest('li[data-id]');
  if (!li) return;
  focusId = focusId === li.dataset.id ? null : li.dataset.id;
  render();
});
$('#clearFocus').onclick = () => { focusId = null; render(); };

// ---------- News actions ----------
$('#refreshNews').onclick = loadNews;
$('#saveNewsBtn').onclick = () => {
  $('#newsForm').reset();
  $('#newsCompany').innerHTML = companyOptions(focusId);
  $('#newsForm').date.value = new Date().toISOString().slice(0, 10);
  $('#newsDialog').returnValue = '';
  $('#newsDialog').showModal();
};
$('#newsDialog').addEventListener('close', async () => {
  if ($('#newsDialog').returnValue !== 'save') return;
  try {
    await api('POST', '/api/news', Object.fromEntries(new FormData($('#newsForm'))));
    state = await api('GET', '/api/state');
    render(); toast('Saved');
  } catch (e) { toast(e.message); }
});
$('#newsList').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-delnews]');
  if (!b) return;
  await api('DELETE', `/api/news/${b.dataset.delnews}`);
  state.newsItems = state.newsItems.filter((n) => n.id !== b.dataset.delnews);
  renderNews();
});

// ---------- Upload ----------
const drop = $('#drop'), fileInput = $('#fileInput');
const showChosen = () => ($('#chosen').textContent = [...fileInput.files].map((f) => f.name).join(', '));
fileInput.onchange = showChosen;
['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', (e) => { fileInput.files = e.dataTransfer.files; showChosen(); });

$('#uploadForm').onsubmit = async (e) => {
  e.preventDefault();
  if (!fileInput.files.length) return toast('Choose a file first');
  try {
    await api('POST', '/api/documents', new FormData(e.target));
    e.target.reset(); showChosen();
    state = await api('GET', '/api/state');
    render(); toast('Uploaded');
  } catch (err) { toast(err.message); }
};
$('#docRows').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-deldoc]');
  if (!b || !confirm('Delete this document?')) return;
  await api('DELETE', `/api/documents/${b.dataset.deldoc}`);
  state.documents = state.documents.filter((d) => d.id !== b.dataset.deldoc);
  renderDocs();
});

load().catch((e) => toast(e.message));

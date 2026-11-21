// Angel Portfolio — a private "Robinhood for angel investments".
// Local-only server: stores data in ./data (git-ignored) and serves ./public.

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { XMLParser } = require('fast-xml-parser');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'db.json');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ---------- tiny JSON store ----------
const EMPTY_DB = { settings: { targetCount: 10, targetYear: 2027 }, investments: [], documents: [], newsItems: [] };

function loadDb() {
  if (!fs.existsSync(DB_FILE)) return structuredClone(EMPTY_DB);
  try {
    return { ...structuredClone(EMPTY_DB), ...JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) };
  } catch (e) {
    console.error('Could not parse db.json:', e.message);
    process.exit(1);
  }
}
let db = loadDb();
function saveDb() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}
const id = () => crypto.randomUUID();
const num = (v) => (v === '' || v === null || v === undefined || isNaN(Number(v)) ? null : Number(v));
const str = (v) => (v === undefined || v === null ? '' : String(v).trim());

const INVESTMENT_FIELDS = {
  company: str, website: str, linkedinUrl: str, sector: str, stage: str,
  instrument: str, date: str, amount: num, valuationCap: num, discount: num,
  currentValue: num, status: str, newsQuery: str, notes: str,
};
function cleanInvestment(body, existing = {}) {
  const out = { ...existing };
  for (const [k, fn] of Object.entries(INVESTMENT_FIELDS)) if (k in body) out[k] = fn(body[k]);
  return out;
}

// ---------- app ----------
const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/state', (req, res) => res.json(db));

app.put('/api/settings', (req, res) => {
  db.settings = { ...db.settings, targetCount: num(req.body.targetCount) ?? db.settings.targetCount, targetYear: num(req.body.targetYear) ?? db.settings.targetYear };
  saveDb();
  res.json(db.settings);
});

// Investments
app.post('/api/investments', (req, res) => {
  const inv = cleanInvestment(req.body, { id: id(), createdAt: new Date().toISOString(), marks: [] });
  if (!inv.company) return res.status(400).json({ error: 'Company name is required' });
  if (!inv.status) inv.status = 'Active';
  db.investments.push(inv);
  saveDb();
  res.status(201).json(inv);
});

app.put('/api/investments/:id', (req, res) => {
  const i = db.investments.findIndex((x) => x.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'Not found' });
  const before = db.investments[i];
  const after = cleanInvestment(req.body, before);
  if (!after.company) return res.status(400).json({ error: 'Company name is required' });
  // Keep a history of valuation marks so we can see how a position moved.
  if (after.currentValue !== before.currentValue && after.currentValue !== null) {
    after.marks = [...(before.marks || []), { date: new Date().toISOString().slice(0, 10), value: after.currentValue }];
  }
  db.investments[i] = after;
  saveDb();
  res.json(after);
});

app.delete('/api/investments/:id', (req, res) => {
  const inv = db.investments.find((x) => x.id === req.params.id);
  if (!inv) return res.status(404).json({ error: 'Not found' });
  for (const d of db.documents.filter((d) => d.investmentId === inv.id)) {
    fs.rmSync(path.join(UPLOAD_DIR, d.storedName), { force: true });
  }
  db.documents = db.documents.filter((d) => d.investmentId !== inv.id);
  db.newsItems = db.newsItems.filter((n) => n.investmentId !== inv.id);
  db.investments = db.investments.filter((x) => x.id !== inv.id);
  saveDb();
  res.status(204).end();
});

// Documents
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, id() + path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '')),
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
});

app.post('/api/documents', upload.array('files', 20), (req, res) => {
  const investmentId = str(req.body.investmentId) || null;
  if (investmentId && !db.investments.some((x) => x.id === investmentId)) {
    for (const f of req.files || []) fs.rmSync(f.path, { force: true });
    return res.status(400).json({ error: 'Unknown investment' });
  }
  const docs = (req.files || []).map((f) => ({
    id: id(),
    investmentId,
    name: Buffer.from(f.originalname, 'latin1').toString('utf8'),
    storedName: f.filename,
    mimeType: f.mimetype,
    size: f.size,
    docType: str(req.body.docType) || 'Other',
    note: str(req.body.note),
    uploadedAt: new Date().toISOString(),
  }));
  db.documents.push(...docs);
  saveDb();
  res.status(201).json(docs);
});

app.get('/api/documents/:id/file', (req, res) => {
  const d = db.documents.find((x) => x.id === req.params.id);
  if (!d) return res.status(404).end();
  const disposition = req.query.download ? 'attachment' : 'inline';
  res.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${encodeURIComponent(d.name)}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.type(d.mimeType || 'application/octet-stream');
  res.sendFile(path.join(UPLOAD_DIR, d.storedName));
});

app.delete('/api/documents/:id', (req, res) => {
  const d = db.documents.find((x) => x.id === req.params.id);
  if (!d) return res.status(404).end();
  fs.rmSync(path.join(UPLOAD_DIR, d.storedName), { force: true });
  db.documents = db.documents.filter((x) => x.id !== d.id);
  saveDb();
  res.status(204).end();
});

// Manually saved news (e.g. a LinkedIn post or an investor update you want to keep)
app.post('/api/news', (req, res) => {
  const item = {
    id: id(),
    investmentId: str(req.body.investmentId) || null,
    title: str(req.body.title),
    url: str(req.body.url),
    source: str(req.body.source) || 'Saved',
    date: str(req.body.date) || new Date().toISOString().slice(0, 10),
    manual: true,
  };
  if (!item.title && !item.url) return res.status(400).json({ error: 'Add a title or a link' });
  if (item.url && !/^https?:\/\//i.test(item.url)) return res.status(400).json({ error: 'Link must start with http(s)://' });
  db.newsItems.push(item);
  saveDb();
  res.status(201).json(item);
});
app.delete('/api/news/:id', (req, res) => {
  db.newsItems = db.newsItems.filter((x) => x.id !== req.params.id);
  saveDb();
  res.status(204).end();
});

// Live news via Google News RSS (press releases, articles, and LinkedIn pages Google has indexed)
const parser = new XMLParser({ ignoreAttributes: false });
const newsCache = new Map(); // key -> { at, items }
const NEWS_TTL_MS = 30 * 60 * 1000;

async function fetchGoogleNews(query) {
  const cached = newsCache.get(query);
  if (cached && Date.now() - cached.at < NEWS_TTL_MS) return cached.items;
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (portfolio-tracker)' }, signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`Google News returned ${r.status}`);
  const xml = parser.parse(await r.text());
  let items = xml?.rss?.channel?.item || [];
  if (!Array.isArray(items)) items = [items];
  const out = items.slice(0, 15).map((it) => ({
    title: String(it.title ?? '').replace(/\s+-\s+[^-]+$/, ''),
    url: it.link,
    source: typeof it.source === 'object' ? it.source['#text'] : String(it.source ?? 'News'),
    date: it.pubDate ? new Date(it.pubDate).toISOString() : null,
  }));
  newsCache.set(query, { at: Date.now(), items: out });
  return out;
}

app.get('/api/news/live', async (req, res) => {
  const targets = db.investments.filter((x) => !req.query.investmentId || x.id === req.query.investmentId);
  const results = await Promise.all(
    targets.map(async (inv) => {
      const query = inv.newsQuery || `"${inv.company}"`;
      try {
        const items = await fetchGoogleNews(query);
        return items.map((n) => ({ ...n, investmentId: inv.id, company: inv.company }));
      } catch (e) {
        return [{ error: e.message, investmentId: inv.id, company: inv.company }];
      }
    })
  );
  const flat = results.flat();
  res.json({
    items: flat.filter((x) => !x.error).sort((a, b) => (b.date || '').localeCompare(a.date || '')),
    errors: flat.filter((x) => x.error),
  });
});

app.listen(PORT, HOST, () => {
  console.log(`Angel Portfolio running at http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  console.log(`Data folder: ${DATA_DIR}`);
});

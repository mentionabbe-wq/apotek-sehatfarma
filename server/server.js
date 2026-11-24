'use strict';
/* =====================================================================
   Server Apotek Dian Farma
   - Menyimpan data aplikasi admin (apotek-dian-farma.html)
   - API toko online (toko.html): produk, pesanan, cek status
   Tanpa dependensi luar: hanya Node.js 22.13+ (node:http + node:sqlite)
   ===================================================================== */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const PORT = +process.env.PORT || 3100;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const FRONT = path.resolve(process.env.FRONTEND_DIR || path.join(__dirname, '..', 'frontend'));
fs.mkdirSync(DATA_DIR, { recursive: true });

/* ---------- Database ---------- */
const db = new DatabaseSync(path.join(DATA_DIR, 'dianfarma.db'));
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT, rev INTEGER DEFAULT 0, updated_at TEXT);
  CREATE TABLE IF NOT EXISTS users (username TEXT PRIMARY KEY, nama TEXT, salt TEXT, hash TEXT, must_change INTEGER DEFAULT 0, created_at TEXT);
  CREATE TABLE IF NOT EXISTS orders (
    kode TEXT PRIMARY KEY, created_at TEXT, updated_at TEXT, status TEXT, telp TEXT,
    data TEXT, resep TEXT, bukti TEXT);
  CREATE INDEX IF NOT EXISTS orders_status ON orders(status);
`);
const now = () => new Date().toISOString();
const kvGet = k => db.prepare('SELECT value, rev FROM kv WHERE key=?').get(k);
const kvSet = (k, v, rev = 0) => db.prepare('INSERT OR REPLACE INTO kv (key,value,rev,updated_at) VALUES (?,?,?,?)').run(k, v, rev, now());

let SECRET = process.env.TOKEN_SECRET;
if (!SECRET) {
  const s = kvGet('secret');
  SECRET = s ? s.value : crypto.randomBytes(32).toString('hex');
  if (!s) kvSet('secret', SECRET);
}

/* ---------- Password & token ---------- */
const hashPw = (pw, salt) => crypto.scryptSync(String(pw), salt, 64).toString('hex');
function setPassword(username, pw, mustChange = 0) {
  const salt = crypto.randomBytes(16).toString('hex');
  db.prepare('UPDATE users SET salt=?, hash=?, must_change=? WHERE username=?').run(salt, hashPw(pw, salt), mustChange, username);
}
if (!db.prepare('SELECT 1 FROM users LIMIT 1').get()) {
  const pw = process.env.ADMIN_PASSWORD || 'admin123';
  db.prepare('INSERT INTO users (username,nama,salt,hash,must_change,created_at) VALUES (?,?,?,?,?,?)')
    .run('admin', 'Administrator', '', '', 0, now());
  setPassword('admin', pw, process.env.ADMIN_PASSWORD ? 0 : 1);
}
const b64u = s => Buffer.from(s).toString('base64url');
const sign = p => crypto.createHmac('sha256', SECRET).update(p).digest('base64url');
function makeToken(u) { const p = b64u(JSON.stringify({ u, exp: Date.now() + 12 * 3600e3 })); return p + '.' + sign(p); }
function readToken(t) {
  if (!t || !t.includes('.')) return null;
  const [p, s] = t.split('.');
  const exp = sign(p);
  if (s.length !== exp.length || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(exp))) return null;
  try { const o = JSON.parse(Buffer.from(p, 'base64url').toString()); return o.exp > Date.now() ? o : null; } catch { return null; }
}

/* ---------- Data aplikasi (state) ---------- */
let STATE = null; // cache {rev, data}
function getState() {
  if (STATE) return STATE;
  const r = kvGet('state');
  STATE = r ? { rev: r.rev, data: JSON.parse(r.value) } : { rev: 0, data: null };
  return STATE;
}

/* ---------- Util HTTP ---------- */
const SEC_HEADERS = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'SAMEORIGIN' };
function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SEC_HEADERS });
  res.end(body);
}
const fail = (res, code, message) => send(res, code, { success: false, message });
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { reject(Object.assign(new Error('Data terlalu besar'), { code: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(Object.assign(new Error('Format JSON tidak valid'), { code: 400 })); } });
    req.on('error', reject);
  });
}
const RL = new Map();
function rateLimited(ip, key, max, windowMs) {
  const k = ip + '|' + key, t = Date.now();
  const arr = (RL.get(k) || []).filter(x => t - x < windowMs);
  arr.push(t); RL.set(k, arr);
  return arr.length > max;
}
setInterval(() => { const t = Date.now(); for (const [k, a] of RL) if (!a.some(x => t - x < 3600e3)) RL.delete(k); }, 600e3).unref();

const digits = s => String(s || '').replace(/\D/g, '');
const normTelp = s => { let d = digits(s); if (d.startsWith('62')) d = '0' + d.slice(2); return d; };
const isImg = s => typeof s === 'string' && s.length < 3.5e6 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(s);
const str = (s, max) => String(s ?? '').trim().slice(0, max);

/* ---------- Logika toko ---------- */
const TOKO0 = { buka: true, ongkir: 10000, gratisOngkir: 0, minBelanja: 0, bayar: ['transfer', 'qris', 'cod'], rekening: '', qris: '', wa: '', jam: '', info: '' };
const tokoCfg = d => ({ ...TOKO0, ...((d && d.config && d.config.toko) || {}) });
const punya2 = o => !!(o.satuanBesar && o.isi > 1);
function reserved() {
  const m = {};
  for (const r of db.prepare("SELECT data FROM orders WHERE status='baru'").all()) {
    for (const it of JSON.parse(r.data).items) m[it.id] = (m[it.id] || 0) + it.qty * it.isi;
  }
  return m;
}
function produkList(d) {
  const res = reserved();
  return (d.obat || []).filter(o => o.online !== false).map(o => {
    const avail = Math.max(0, (o.stok || 0) - (res[o.id] || 0));
    return {
      id: o.id, nama: o.nama, kategori: o.kategori || 'Umum', satuan: o.satuan, harga: o.jual || 0,
      besar: punya2(o) ? { nama: o.satuanBesar, isi: o.isi, harga: o.jualBesar || (o.jual || 0) * o.isi } : null,
      resep: !!o.resep, tersedia: avail,
    };
  });
}
function diskonFor(d, telp) {
  const t = normTelp(telp);
  if (t.length < 9) return null;
  const p = (d.pelanggan || []).find(x => x.nama !== 'Pelanggan Umum' && normTelp(x.telp) === t);
  if (!p) return null;
  const k = (d.katpel || []).find(k => k.nama === p.kategori);
  return { nama: p.nama, kategori: (k && k.nama) || 'Umum', diskon: (k && +k.diskon) || 0 };
}
const BAYAR_LABEL = { transfer: 'Transfer Bank', qris: 'QRIS', cod: 'Bayar di Tempat' };
const STATUS_NEXT = { baru: ['diproses', 'dibatalkan'], diproses: ['dikirim', 'siap', 'selesai'], dikirim: ['selesai'], siap: ['selesai'], selesai: [], dibatalkan: [] };
function newKode() {
  const d = new Date(), A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let r = ''; for (const b of crypto.randomBytes(5)) r += A[b % A.length];
  return 'DF' + String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '-' + r;
}
function publicOrder(row) {
  const o = JSON.parse(row.data);
  return { ...o, status: row.status, created_at: row.created_at, updated_at: row.updated_at, adaResep: !!row.resep, adaBukti: !!row.bukti };
}

/* ---------- Router ---------- */
async function api(req, res, url) {
  const p = url.pathname, m = req.method;
  const ip = req.socket.remoteAddress || '';

  if (p === '/api/health') return send(res, 200, { success: true, app: 'dianfarma', time: now() });

  /* ===== Publik: toko online ===== */
  if (p === '/api/toko/info' && m === 'GET') {
    const d = getState().data;
    if (!d) return send(res, 200, { success: true, siap: false });
    const c = d.config || {}, t = tokoCfg(d);
    return send(res, 200, { success: true, siap: true, data: {
      nama: c.nama, tagline: c.tagline, alamat: c.alamat, telp: c.telp, logo: c.logo || '', ppn: c.ppn,
      buka: !!t.buka, ongkir: +t.ongkir || 0, gratisOngkir: +t.gratisOngkir || 0, minBelanja: +t.minBelanja || 0,
      bayar: (t.bayar || []).filter(b => BAYAR_LABEL[b]), rekening: String(t.rekening || '').split('\n').map(s => s.trim()).filter(Boolean),
      qris: t.qris || '', wa: digits(t.wa), jam: t.jam || '', info: t.info || '' } });
  }
  if (p === '/api/toko/produk' && m === 'GET') {
    const d = getState().data;
    if (!d) return send(res, 200, { success: true, items: [] });
    return send(res, 200, { success: true, items: produkList(d) });
  }
  if (p === '/api/toko/diskon' && m === 'POST') {
    if (rateLimited(ip, 'diskon', 30, 600e3)) return fail(res, 429, 'Terlalu banyak permintaan, coba lagi nanti');
    const b = await readBody(req, 4e3), d = getState().data;
    const x = d && diskonFor(d, b.telp);
    return send(res, 200, { success: true, diskon: x ? x.diskon : 0, kategori: x ? x.kategori : null });
  }
  if (p === '/api/toko/tagihan' && m === 'POST') {
    if (rateLimited(ip, 'tagihan', 8, 600e3)) return fail(res, 429, 'Terlalu banyak percobaan, coba lagi 10 menit lagi');
    const b = await readBody(req, 4e3), d = getState().data;
    const t = normTelp(b.telp), pin = String(b.pin || '').trim();
    const pel = d && /^\d{6}$/.test(pin) && t.length >= 9 && (d.pelanggan || []).find(x => x.nama !== 'Pelanggan Umum' && normTelp(x.telp) === t);
    if (!pel || !pel.pin || pel.pin.length !== pin.length || !crypto.timingSafeEqual(Buffer.from(pel.pin), Buffer.from(pin)))
      return fail(res, 404, 'Nomor HP atau PIN salah');
    const dib = h => (h.bayar || []).reduce((s, x) => s + (+x.jumlah || 0), 0);
    const sisa = h => h.status === 'Lunas' ? 0 : Math.max(0, h.jumlah - dib(h));
    const today = new Date().toISOString().slice(0, 10);
    const L = (d.piutang || []).filter(h => h.pihak === pel.nama);
    const tagihan = L.filter(h => sisa(h) > 0).sort((a, b) => a.jt < b.jt ? -1 : 1)
      .map(h => ({ ref: h.ref, tgl: h.tgl || null, jt: h.jt, jumlah: h.jumlah, dibayar: dib(h), sisa: sisa(h), lewat: h.jt < today }));
    const bayar = L.flatMap(h => (h.bayar || []).map(x => ({ tgl: x.tgl, jumlah: x.jumlah, ref: h.ref }))).sort((a, b) => a.tgl < b.tgl ? 1 : -1).slice(0, 20);
    const total = tagihan.reduce((s, h) => s + h.sisa, 0);
    const bonus = (d.bonus || []).filter(x => x.pelanggan === pel.nama).reduce((s, x) => s + x.jumlah, 0);
    return send(res, 200, { success: true, data: { nama: pel.nama, total, limit: +pel.limit || 0, termin: +pel.termin || 0,
      lewat: tagihan.filter(h => h.lewat).reduce((s, h) => s + h.sisa, 0), tagihan, bayar, bonus } });
  }
  if (p === '/api/toko/pesanan' && m === 'POST') {
    if (rateLimited(ip, 'order', 10, 600e3)) return fail(res, 429, 'Terlalu banyak pesanan dari perangkat ini, coba lagi nanti');
    const b = await readBody(req, 6e6), d = getState().data;
    if (!d) return fail(res, 503, 'Toko belum siap');
    const t = tokoCfg(d);
    if (!t.buka) return fail(res, 400, 'Maaf, toko sedang tutup');
    const nama = str(b.nama, 80), telp = normTelp(b.telp), alamat = str(b.alamat, 300), catatan = str(b.catatan, 300);
    const kirim = b.kirim === 'antar' ? 'antar' : 'ambil', bayar = String(b.bayar || '');
    if (nama.length < 2) return fail(res, 400, 'Nama wajib diisi');
    if (telp.length < 9 || telp.length > 15) return fail(res, 400, 'Nomor HP tidak valid');
    if (kirim === 'antar' && alamat.length < 5) return fail(res, 400, 'Alamat pengiriman wajib diisi');
    if (!(t.bayar || []).includes(bayar) || !BAYAR_LABEL[bayar]) return fail(res, 400, 'Metode pembayaran tidak tersedia');
    if (!Array.isArray(b.items) || !b.items.length || b.items.length > 50) return fail(res, 400, 'Keranjang kosong');
    const prod = Object.fromEntries((d.obat || []).map(o => [String(o.id), o]));
    const res0 = reserved(), pakai = {}, items = [];
    for (const it of b.items) {
      const o = prod[String(it.id)];
      if (!o || o.online === false) return fail(res, 400, 'Ada produk yang tidak tersedia lagi, muat ulang halaman');
      const qty = Math.floor(+it.qty);
      if (!(qty >= 1 && qty <= 999)) return fail(res, 400, 'Jumlah tidak valid');
      const besar = punya2(o) && +it.isi === o.isi, isi = besar ? o.isi : 1;
      const harga = besar ? (o.jualBesar || o.jual * o.isi) : o.jual;
      pakai[o.id] = (pakai[o.id] || 0) + qty * isi;
      if (pakai[o.id] > (o.stok || 0) - (res0[o.id] || 0)) return fail(res, 400, `Stok ${o.nama} tidak cukup`);
      items.push({ id: o.id, nama: o.nama, isi, unit: besar ? o.satuanBesar : o.satuan, qty, harga, sub: qty * harga, resep: !!o.resep });
    }
    const perluResep = items.some(i => i.resep);
    if (perluResep && !isImg(b.resep)) return fail(res, 400, 'Pesanan berisi obat keras — unggah foto resep dokter');
    const subtotal = items.reduce((s, i) => s + i.sub, 0);
    if (t.minBelanja && subtotal < t.minBelanja) return fail(res, 400, 'Minimal belanja Rp ' + Number(t.minBelanja).toLocaleString('id-ID'));
    const ds = diskonFor(d, telp), diskonPct = ds ? ds.diskon : 0, diskon = Math.round(subtotal * diskonPct / 100);
    const ongkir = kirim === 'antar' && !(t.gratisOngkir && subtotal - diskon >= t.gratisOngkir) ? (+t.ongkir || 0) : 0;
    let kode; do { kode = newKode(); } while (db.prepare('SELECT 1 FROM orders WHERE kode=?').get(kode));
    const order = { kode, nama, telp, alamat, kirim, bayar, bayarLabel: BAYAR_LABEL[bayar], catatan, items, subtotal, diskonPct,
      kategori: ds ? ds.kategori : null, diskon, ongkir, total: subtotal - diskon + ongkir, ppn: (d.config && d.config.ppn) || 0,
      riwayat: [{ t: now(), status: 'baru' }] };
    db.prepare('INSERT INTO orders (kode,created_at,updated_at,status,telp,data,resep,bukti) VALUES (?,?,?,?,?,?,?,?)')
      .run(kode, now(), now(), 'baru', telp, JSON.stringify(order), perluResep ? b.resep : null, isImg(b.bukti) ? b.bukti : null);
    return send(res, 201, { success: true, data: { kode, total: order.total } });
  }
  let mm = p.match(/^\/api\/toko\/pesanan\/([A-Z0-9-]{6,20})$/);
  if (mm && m === 'GET') {
    if (rateLimited(ip, 'cek', 60, 600e3)) return fail(res, 429, 'Terlalu banyak permintaan');
    const row = db.prepare('SELECT * FROM orders WHERE kode=?').get(mm[1]);
    if (!row || row.telp !== normTelp(url.searchParams.get('telp'))) return fail(res, 404, 'Pesanan tidak ditemukan. Periksa kode & nomor HP');
    return send(res, 200, { success: true, data: publicOrder(row) });
  }
  mm = p.match(/^\/api\/toko\/pesanan\/([A-Z0-9-]{6,20})\/bukti$/);
  if (mm && m === 'POST') {
    if (rateLimited(ip, 'bukti', 10, 600e3)) return fail(res, 429, 'Terlalu banyak permintaan');
    const b = await readBody(req, 5e6);
    const row = db.prepare('SELECT * FROM orders WHERE kode=?').get(mm[1]);
    if (!row || row.telp !== normTelp(b.telp)) return fail(res, 404, 'Pesanan tidak ditemukan');
    if (!['baru', 'diproses'].includes(row.status)) return fail(res, 400, 'Pesanan sudah tidak menunggu pembayaran');
    if (!isImg(b.bukti)) return fail(res, 400, 'File bukti harus gambar JPG/PNG');
    const o = JSON.parse(row.data); o.riwayat.push({ t: now(), status: 'bukti', ket: 'Bukti pembayaran diunggah' });
    db.prepare('UPDATE orders SET bukti=?, data=?, updated_at=? WHERE kode=?').run(b.bukti, JSON.stringify(o), now(), row.kode);
    return send(res, 200, { success: true });
  }

  /* ===== Login admin ===== */
  if (p === '/api/auth/login' && m === 'POST') {
    if (rateLimited(ip, 'login', 10, 600e3)) return fail(res, 429, 'Terlalu banyak percobaan login, tunggu 10 menit');
    const b = await readBody(req, 4e3);
    const u = db.prepare('SELECT * FROM users WHERE username=?').get(str(b.username, 40));
    if (!u || hashPw(b.password || '', u.salt) !== u.hash) return fail(res, 401, 'Username atau password salah');
    return send(res, 200, { success: true, token: makeToken(u.username), nama: u.nama, mustChange: !!u.must_change });
  }

  /* ===== Admin (wajib token) ===== */
  const auth = readToken((req.headers.authorization || '').replace(/^Bearer /, ''));
  if (!auth) return fail(res, 401, 'Silakan login');

  if (p === '/api/auth/password' && m === 'POST') {
    const b = await readBody(req, 4e3);
    const u = db.prepare('SELECT * FROM users WHERE username=?').get(auth.u);
    if (hashPw(b.lama || '', u.salt) !== u.hash) return fail(res, 400, 'Password lama salah');
    if (String(b.baru || '').length < 6) return fail(res, 400, 'Password baru minimal 6 karakter');
    setPassword(auth.u, b.baru, 0);
    return send(res, 200, { success: true });
  }
  if (p === '/api/state' && m === 'GET') return send(res, 200, { success: true, ...getState() });
  if (p === '/api/state' && m === 'PUT') {
    const b = await readBody(req, 15e6), cur = getState();
    if (!b.data || !Array.isArray(b.data.obat)) return fail(res, 400, 'Data tidak valid');
    if (+b.rev !== cur.rev) return send(res, 409, { success: false, message: 'Data sudah diubah dari perangkat lain', rev: cur.rev });
    const rev = cur.rev + 1;
    kvSet('state', JSON.stringify(b.data), rev);
    STATE = { rev, data: b.data };
    return send(res, 200, { success: true, rev });
  }
  if (p === '/api/admin/orders' && m === 'GET') {
    const rows = db.prepare('SELECT kode,created_at,updated_at,status,telp,data,(resep IS NOT NULL) AS r,(bukti IS NOT NULL) AS bk FROM orders ORDER BY created_at DESC LIMIT 500').all();
    return send(res, 200, { success: true, items: rows.map(r => ({ ...JSON.parse(r.data), status: r.status, created_at: r.created_at, updated_at: r.updated_at, adaResep: !!r.r, adaBukti: !!r.bk })) });
  }
  mm = p.match(/^\/api\/admin\/orders\/([A-Z0-9-]{6,20})$/);
  if (mm && m === 'GET') {
    const row = db.prepare('SELECT * FROM orders WHERE kode=?').get(mm[1]);
    if (!row) return fail(res, 404, 'Pesanan tidak ditemukan');
    return send(res, 200, { success: true, data: { ...publicOrder(row), resepImg: row.resep, buktiImg: row.bukti } });
  }
  if (mm && m === 'PATCH') {
    const b = await readBody(req, 2e4);
    const row = db.prepare('SELECT * FROM orders WHERE kode=?').get(mm[1]);
    if (!row) return fail(res, 404, 'Pesanan tidak ditemukan');
    if (!(STATUS_NEXT[row.status] || []).includes(b.status)) return send(res, 409, { success: false, message: `Status pesanan sudah "${row.status}", muat ulang daftar`, status: row.status });
    const o = JSON.parse(row.data);
    o.riwayat.push({ t: now(), status: b.status, ket: str(b.ket, 300), oleh: auth.u });
    if (b.saleNo) o.saleNo = str(b.saleNo, 40);
    if (b.status === 'dibatalkan') o.alasan = str(b.ket, 300);
    db.prepare('UPDATE orders SET status=?, data=?, updated_at=? WHERE kode=?').run(b.status, JSON.stringify(o), now(), row.kode);
    return send(res, 200, { success: true });
  }
  return fail(res, 404, 'Endpoint tidak ditemukan');
}

/* ---------- File statis ---------- */
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp', '.json': 'application/json' };
function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/' || rel === '/toko') rel = '/toko.html';
  if (rel === '/admin' || rel === '/admin/') rel = '/apotek-dian-farma.html';
  const file = path.resolve(FRONT, '.' + rel);
  if (!file.startsWith(FRONT + path.sep)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Halaman tidak ditemukan'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', ...SEC_HEADERS });
    res.end(buf);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    try { await api(req, res, url); }
    catch (e) { if (!res.headersSent) fail(res, e.code === 413 || e.code === 400 ? e.code : 500, e.code ? e.message : 'Terjadi kesalahan server'); if (!e.code) console.error(e); }
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  serveStatic(req, res, url);
});
server.listen(PORT, () => {
  const u = db.prepare('SELECT must_change FROM users WHERE username=?').get('admin');
  console.log('\n==============================================');
  console.log('  Server Apotek Dian Farma berjalan');
  console.log(`  Toko online : http://localhost:${PORT}/`);
  console.log(`  Admin       : http://localhost:${PORT}/admin`);
  if (u && u.must_change) console.log('  Login awal  : admin / admin123  (segera ganti password!)');
  console.log('==============================================\n');
});

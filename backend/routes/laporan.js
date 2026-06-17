const express = require('express');
const router = express.Router();
const { db } = require('../database');

// GET /api/laporan/dashboard - ringkasan hari ini
router.get('/dashboard', (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const tx = db.prepare(`SELECT COUNT(*) as trx, COALESCE(SUM(total),0) as omzet, COALESCE(SUM(laba),0) as laba, COALESCE(SUM(diskon),0) as diskon FROM transaksi WHERE DATE(tanggal) = ?`).get(today);
    const stokMenipis = db.prepare('SELECT COUNT(*) as c FROM obat WHERE stok <= stok_min').get();
    const in30 = new Date(Date.now()+30*86400000).toISOString().split('T')[0];
    const expired = db.prepare('SELECT COUNT(*) as c FROM obat WHERE expired_date <= ? AND stok > 0').get(in30);
    const peng = db.prepare(`SELECT COALESCE(SUM(nominal),0) as total FROM pengeluaran WHERE DATE(tanggal) = ?`).get(today);
    res.json({ success: true, data: { transaksi: tx, stok_menipis: stokMenipis.c, expired: expired.c, pengeluaran_hari_ini: peng.total } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET /api/laporan/penjualan?dari=&sampai=
router.get('/penjualan', (req, res) => {
  try {
    const { dari, sampai } = req.query;
    const today = new Date().toISOString().split('T')[0];
    const d = dari || today, s = sampai || today;
    const rows = db.prepare(`SELECT t.*, GROUP_CONCAT(td.nama_obat || ' x' || td.jumlah, ', ') as items_ringkas
      FROM transaksi t LEFT JOIN transaksi_detail td ON t.id = td.transaksi_id
      WHERE DATE(t.tanggal) BETWEEN ? AND ?
      GROUP BY t.id ORDER BY t.tanggal DESC`).all(d, s);
    const summary = db.prepare(`SELECT COUNT(*) as trx, COALESCE(SUM(sub),0) as sub, COALESCE(SUM(diskon),0) as diskon, COALESCE(SUM(total),0) as total, COALESCE(SUM(laba),0) as laba FROM transaksi WHERE DATE(tanggal) BETWEEN ? AND ?`).get(d, s);
    res.json({ success: true, data: rows, summary, periode: { dari: d, sampai: s } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET /api/laporan/harian?tanggal=
router.get('/harian', (req, res) => {
  try {
    const tanggal = req.query.tanggal || new Date().toISOString().split('T')[0];
    const summary = db.prepare(`SELECT COUNT(*) as trx, COALESCE(SUM(total),0) as omzet, COALESCE(SUM(laba),0) as laba FROM transaksi WHERE DATE(tanggal) = ?`).get(tanggal);
    const transaksi = db.prepare('SELECT * FROM transaksi WHERE DATE(tanggal) = ? ORDER BY tanggal DESC').all(tanggal);
    const topObat = db.prepare(`SELECT td.nama_obat, SUM(td.jumlah) as terjual, SUM(td.subtotal) as pendapatan FROM transaksi_detail td JOIN transaksi t ON td.transaksi_id = t.id WHERE DATE(t.tanggal) = ? GROUP BY td.obat_id ORDER BY terjual DESC LIMIT 10`).all(tanggal);
    res.json({ success: true, data: { tanggal, summary, transaksi, top_obat: topObat } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET /api/laporan/bulanan?bulan=MM&tahun=YYYY
router.get('/bulanan', (req, res) => {
  try {
    const now = new Date();
    const bulan = (req.query.bulan || String(now.getMonth()+1)).padStart(2,'0');
    const tahun = req.query.tahun || String(now.getFullYear());
    const period = `${tahun}-${bulan}`;
    const summary = db.prepare(`SELECT COUNT(*) as trx, COALESCE(SUM(total),0) as omzet, COALESCE(SUM(laba),0) as laba FROM transaksi WHERE strftime('%Y-%m',tanggal) = ?`).get(period);
    const perHari = db.prepare(`SELECT DATE(tanggal) as tgl, COUNT(*) as trx, SUM(total) as omzet, SUM(laba) as laba FROM transaksi WHERE strftime('%Y-%m',tanggal) = ? GROUP BY tgl ORDER BY tgl`).all(period);
    const topObat = db.prepare(`SELECT td.nama_obat, SUM(td.jumlah) as terjual, SUM(td.subtotal) as pendapatan FROM transaksi_detail td JOIN transaksi t ON td.transaksi_id = t.id WHERE strftime('%Y-%m',t.tanggal) = ? GROUP BY td.obat_id ORDER BY terjual DESC LIMIT 10`).all(period);
    res.json({ success: true, data: { periode: period, summary, per_hari: perHari, top_obat: topObat } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET /api/laporan/laba-rugi?dari=&sampai=
router.get('/laba-rugi', (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const d = req.query.dari || today.slice(0,7)+'-01', s = req.query.sampai || today;
    const penjualan = db.prepare(`SELECT COALESCE(SUM(total),0) as omzet, COALESCE(SUM(laba),0) as laba_kotor, COALESCE(SUM(diskon),0) as diskon FROM transaksi WHERE DATE(tanggal) BETWEEN ? AND ?`).get(d, s);
    const pengeluaran = db.prepare(`SELECT COALESCE(SUM(nominal),0) as total FROM pengeluaran WHERE DATE(tanggal) BETWEEN ? AND ?`).get(d, s);
    const pembelian = db.prepare(`SELECT COALESCE(SUM(total),0) as total FROM pembelian WHERE DATE(tanggal) BETWEEN ? AND ?`).get(d, s);
    const labaBersih = penjualan.laba_kotor - pengeluaran.total;
    res.json({ success: true, data: { periode: { dari: d, sampai: s }, penjualan, pengeluaran: pengeluaran.total, pembelian: pembelian.total, laba_bersih: labaBersih } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET /api/laporan/stok-menipis?batas=10
router.get('/stok-menipis', (req, res) => {
  try {
    const obat = db.prepare(`SELECT o.*, s.nama as supplier_nama FROM obat o LEFT JOIN supplier s ON o.supplier_id = s.id WHERE o.stok <= o.stok_min ORDER BY o.stok ASC`).all();
    res.json({ success: true, data: obat });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET /api/laporan/expired
router.get('/expired', (req, res) => {
  try {
    const in30 = new Date(Date.now()+30*86400000).toISOString().split('T')[0];
    const obat = db.prepare(`SELECT o.*, s.nama as supplier_nama FROM obat o LEFT JOIN supplier s ON o.supplier_id = s.id WHERE o.expired_date <= ? AND o.stok > 0 ORDER BY o.expired_date ASC`).all(in30);
    res.json({ success: true, data: obat });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET /api/laporan/per-kasir?dari=&sampai=
router.get('/per-kasir', (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const d = req.query.dari || today, s = req.query.sampai || today;
    const rows = db.prepare(`SELECT kasir, COUNT(*) as trx, SUM(total) as omzet, SUM(laba) as laba FROM transaksi WHERE DATE(tanggal) BETWEEN ? AND ? GROUP BY kasir ORDER BY omzet DESC`).all(d, s);
    res.json({ success: true, data: rows, periode: { dari: d, sampai: s } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET /api/laporan/per-metode?dari=&sampai=
router.get('/per-metode', (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const d = req.query.dari || today, s = req.query.sampai || today;
    const rows = db.prepare(`SELECT metode_bayar, COUNT(*) as trx, SUM(total) as omzet FROM transaksi WHERE DATE(tanggal) BETWEEN ? AND ? GROUP BY metode_bayar ORDER BY omzet DESC`).all(d, s);
    res.json({ success: true, data: rows, periode: { dari: d, sampai: s } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;

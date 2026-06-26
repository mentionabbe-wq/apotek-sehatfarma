const express = require('express');
const router = express.Router();
const { db } = require('../database');

// POST /api/publik/sync-obat — sync OBAT dari localStorage frontend ke SQLite
router.post('/sync-obat', (req, res) => {
  const obatList = req.body.obat;
  if (!Array.isArray(obatList) || obatList.length === 0)
    return res.status(400).json({ success: false, message: 'Data obat kosong' });
  try {
    db.transaction(() => {
      db.prepare("DELETE FROM obat WHERE local_id != ''").run();
      const ins = db.prepare(`
        INSERT INTO obat
          (local_id, kode, nama, kategori, stok, stok_min, harga_beli, harga_jual,
           satuan, satuan_kecil, satuan_besar, jual_kecil, jual_besar, isi_per_besar, expired_date)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
      for (const o of obatList) {
        const sk = o.satuanKecil || 'Pcs';
        const jk = o.jualKecil || 0;
        ins.run(
          o.id, o.kode || '', o.nama || '', o.kategori || '',
          o.stok || 0, o.min || 10, o.beli || 0,
          jk,          // harga_jual = harga satuan kecil
          sk,          // satuan = satuan kecil
          sk,
          o.satuanBesar || '',
          jk,
          o.jualBesar || 0,
          o.isiPerBesar || 0,
          o.exp || null
        );
      }
    })();
    res.json({ success: true, synced: obatList.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/publik/produk?search=&page=1
router.get('/produk', (req, res) => {
  try {
    const search = req.query.search || '';
    const page = parseInt(req.query.page) || 1;
    const limit = 24;
    const offset = (page - 1) * limit;
    const params = [];
    let where = 'WHERE o.stok > 0';
    if (search) {
      where += ' AND (o.nama LIKE ? OR o.kategori LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    const items = db.prepare(
      `SELECT o.id, o.local_id, o.kode, o.nama, o.kategori, o.stok,
              CASE WHEN o.satuan_kecil != '' THEN o.satuan_kecil ELSE o.satuan END as satuan,
              CASE WHEN o.satuan_kecil != '' THEN o.jual_kecil ELSE o.harga_jual END as harga_jual,
              o.satuan_besar, o.jual_besar, o.isi_per_besar
       FROM obat o ${where} ORDER BY o.nama ASC LIMIT ? OFFSET ?`
    ).all(...params, limit, offset);
    const total = db.prepare(`SELECT COUNT(*) as c FROM obat o ${where}`).get(...params).c;
    res.json({ success: true, items, total, page, limit });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/publik/produk/:id
router.get('/produk/:id', (req, res) => {
  try {
    const obat = db.prepare(
      `SELECT o.id, o.local_id, o.kode, o.nama, o.kategori, o.stok,
              CASE WHEN o.satuan_kecil != '' THEN o.satuan_kecil ELSE o.satuan END as satuan,
              CASE WHEN o.satuan_kecil != '' THEN o.jual_kecil ELSE o.harga_jual END as harga_jual,
              o.satuan_besar, o.jual_besar, o.isi_per_besar
       FROM obat o WHERE o.id = ?`
    ).get(req.params.id);
    if (!obat) return res.status(404).json({ success: false, message: 'Produk tidak ditemukan' });
    res.json({ success: true, data: obat });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const { db } = require('../database');

// GET /api/publik/produk?search=&page=1
// Endpoint publik untuk apotek-online — tidak butuh token
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
      `SELECT o.id, o.kode, o.nama, o.kategori, o.stok, o.harga_jual, o.satuan
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
      'SELECT id, kode, nama, kategori, stok, harga_jual, satuan FROM obat WHERE id = ?'
    ).get(req.params.id);
    if (!obat) return res.status(404).json({ success: false, message: 'Produk tidak ditemukan' });
    res.json({ success: true, data: obat });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const { db } = require('../database');

router.get('/', (req, res) => {
  try {
    const { search, kategori, stok_menipis, expired } = req.query;
    let q = `SELECT o.*, s.nama as supplier_nama FROM obat o LEFT JOIN supplier s ON o.supplier_id = s.id WHERE 1=1`;
    const params = [];
    if (search) { q += ' AND (o.nama LIKE ? OR o.kode LIKE ? OR o.kategori LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    if (kategori) { q += ' AND o.kategori = ?'; params.push(kategori); }
    if (stok_menipis) { q += ' AND o.stok <= o.stok_min'; }
    if (expired) {
      const in30 = new Date(Date.now() + 30*86400000).toISOString().split('T')[0];
      q += ' AND o.expired_date <= ? AND o.stok > 0'; params.push(in30);
    }
    q += ' ORDER BY o.nama ASC';
    res.json({ success: true, data: db.prepare(q).all(...params) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get('/kategori', (req, res) => {
  try {
    const rows = db.prepare("SELECT DISTINCT kategori FROM obat WHERE kategori != '' ORDER BY kategori").all();
    res.json({ success: true, data: rows.map(r => r.kategori) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get('/:id', (req, res) => {
  try {
    const obat = db.prepare('SELECT o.*, s.nama as supplier_nama FROM obat o LEFT JOIN supplier s ON o.supplier_id = s.id WHERE o.id = ?').get(req.params.id);
    if (!obat) return res.status(404).json({ success: false, message: 'Obat tidak ditemukan' });
    res.json({ success: true, data: obat });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/', (req, res) => {
  try {
    const { kode, nama, kategori, stok, stok_min, harga_beli, harga_jual, satuan, expired_date, supplier_id, lokasi, keterangan } = req.body;
    if (!nama) return res.status(400).json({ success: false, message: 'Nama obat wajib diisi' });
    const result = db.prepare(`INSERT INTO obat (kode,nama,kategori,stok,stok_min,harga_beli,harga_jual,satuan,expired_date,supplier_id,lokasi,keterangan)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      kode||'', nama, kategori||'', stok||0, stok_min||10, harga_beli||0, harga_jual||0,
      satuan||'tablet', expired_date||null, supplier_id||null, lokasi||'', keterangan||''
    );
    const newObat = db.prepare('SELECT o.*, s.nama as supplier_nama FROM obat o LEFT JOIN supplier s ON o.supplier_id = s.id WHERE o.id = ?').get(result.lastInsertRowid);
    res.status(201).json({ success: true, data: newObat, message: 'Obat berhasil ditambahkan' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.put('/:id', (req, res) => {
  try {
    const ex = db.prepare('SELECT * FROM obat WHERE id = ?').get(req.params.id);
    if (!ex) return res.status(404).json({ success: false, message: 'Obat tidak ditemukan' });
    const { kode, nama, kategori, stok, stok_min, harga_beli, harga_jual, satuan, expired_date, supplier_id, lokasi, keterangan } = req.body;
    db.prepare(`UPDATE obat SET kode=?,nama=?,kategori=?,stok=?,stok_min=?,harga_beli=?,harga_jual=?,satuan=?,expired_date=?,supplier_id=?,lokasi=?,keterangan=? WHERE id=?`).run(
      kode!==undefined?kode:ex.kode, nama||ex.nama, kategori!==undefined?kategori:ex.kategori,
      stok!==undefined?stok:ex.stok, stok_min!==undefined?stok_min:ex.stok_min,
      harga_beli!==undefined?harga_beli:ex.harga_beli, harga_jual!==undefined?harga_jual:ex.harga_jual,
      satuan||ex.satuan, expired_date!==undefined?expired_date:ex.expired_date,
      supplier_id!==undefined?supplier_id:ex.supplier_id, lokasi!==undefined?lokasi:ex.lokasi,
      keterangan!==undefined?keterangan:ex.keterangan, req.params.id
    );
    const updated = db.prepare('SELECT o.*, s.nama as supplier_nama FROM obat o LEFT JOIN supplier s ON o.supplier_id = s.id WHERE o.id = ?').get(req.params.id);
    res.json({ success: true, data: updated, message: 'Obat berhasil diperbarui' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.delete('/:id', (req, res) => {
  try {
    if (!db.prepare('SELECT id FROM obat WHERE id = ?').get(req.params.id))
      return res.status(404).json({ success: false, message: 'Obat tidak ditemukan' });
    const used = db.prepare('SELECT COUNT(*) as c FROM transaksi_detail WHERE obat_id = ?').get(req.params.id);
    if (used.c > 0) return res.status(400).json({ success: false, message: 'Obat tidak dapat dihapus karena memiliki riwayat transaksi' });
    db.prepare('DELETE FROM obat WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: 'Obat berhasil dihapus' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;

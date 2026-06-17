const express = require('express');
const router = express.Router();
const { db } = require('../database');
const { adminOnly } = require('../middleware/auth');

router.get('/', (req, res) => {
  try {
    res.json({ success: true, data: db.prepare('SELECT * FROM klasifikasi ORDER BY diskon ASC').all() });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get('/:id', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM klasifikasi WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: 'Klasifikasi tidak ditemukan' });
    res.json({ success: true, data: row });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/', adminOnly, (req, res) => {
  try {
    const { nama, warna, diskon } = req.body;
    if (!nama) return res.status(400).json({ success: false, message: 'Nama klasifikasi wajib diisi' });
    const id = 'kl_' + Date.now();
    db.prepare('INSERT INTO klasifikasi (id,nama,warna,diskon) VALUES (?,?,?,?)').run(id, nama, warna || '#6b7280', diskon || 0);
    res.status(201).json({ success: true, data: db.prepare('SELECT * FROM klasifikasi WHERE id=?').get(id), message: 'Klasifikasi berhasil ditambahkan' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.put('/:id', adminOnly, (req, res) => {
  try {
    const { nama, warna, diskon } = req.body;
    const existing = db.prepare('SELECT * FROM klasifikasi WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Klasifikasi tidak ditemukan' });
    db.prepare('UPDATE klasifikasi SET nama=?,warna=?,diskon=? WHERE id=?').run(
      nama || existing.nama, warna || existing.warna, diskon !== undefined ? diskon : existing.diskon, req.params.id
    );
    res.json({ success: true, data: db.prepare('SELECT * FROM klasifikasi WHERE id=?').get(req.params.id), message: 'Klasifikasi berhasil diperbarui' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.delete('/:id', adminOnly, (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM klasifikasi WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Klasifikasi tidak ditemukan' });
    const used = db.prepare('SELECT COUNT(*) as c FROM pelanggan WHERE klasifikasi_id = ?').get(req.params.id);
    if (used.c > 0) return res.status(400).json({ success: false, message: 'Klasifikasi sedang digunakan oleh pelanggan' });
    db.prepare('DELETE FROM klasifikasi WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: 'Klasifikasi berhasil dihapus' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;

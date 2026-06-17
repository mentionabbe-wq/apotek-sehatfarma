const express = require('express');
const router = express.Router();
const { db } = require('../database');

router.get('/', (req, res) => {
  try {
    const { search, klasifikasi_id } = req.query;
    let q = `SELECT p.*, k.nama as klasifikasi_nama, k.warna as klasifikasi_warna, k.diskon as klasifikasi_diskon
             FROM pelanggan p LEFT JOIN klasifikasi k ON p.klasifikasi_id = k.id WHERE 1=1`;
    const params = [];
    if (search) { q += ' AND (p.nama LIKE ? OR p.telepon LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
    if (klasifikasi_id) { q += ' AND p.klasifikasi_id = ?'; params.push(klasifikasi_id); }
    q += ' ORDER BY p.nama ASC';
    res.json({ success: true, data: db.prepare(q).all(...params) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get('/:id', (req, res) => {
  try {
    const row = db.prepare(`SELECT p.*, k.nama as klasifikasi_nama, k.diskon as klasifikasi_diskon
      FROM pelanggan p LEFT JOIN klasifikasi k ON p.klasifikasi_id = k.id WHERE p.id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: 'Pelanggan tidak ditemukan' });
    res.json({ success: true, data: row });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/', (req, res) => {
  try {
    const { nama, telepon, alamat, catatan, klasifikasi_id } = req.body;
    if (!nama) return res.status(400).json({ success: false, message: 'Nama pelanggan wajib diisi' });
    const id = 'pel_' + Date.now();
    db.prepare('INSERT INTO pelanggan (id,nama,telepon,alamat,catatan,klasifikasi_id) VALUES (?,?,?,?,?,?)').run(
      id, nama, telepon || '', alamat || '', catatan || '', klasifikasi_id || ''
    );
    res.status(201).json({ success: true, data: db.prepare('SELECT * FROM pelanggan WHERE id=?').get(id), message: 'Pelanggan berhasil ditambahkan' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.put('/:id', (req, res) => {
  try {
    const { nama, telepon, alamat, catatan, klasifikasi_id } = req.body;
    const ex = db.prepare('SELECT * FROM pelanggan WHERE id = ?').get(req.params.id);
    if (!ex) return res.status(404).json({ success: false, message: 'Pelanggan tidak ditemukan' });
    db.prepare('UPDATE pelanggan SET nama=?,telepon=?,alamat=?,catatan=?,klasifikasi_id=? WHERE id=?').run(
      nama || ex.nama, telepon !== undefined ? telepon : ex.telepon, alamat !== undefined ? alamat : ex.alamat,
      catatan !== undefined ? catatan : ex.catatan, klasifikasi_id !== undefined ? klasifikasi_id : ex.klasifikasi_id, req.params.id
    );
    res.json({ success: true, data: db.prepare('SELECT * FROM pelanggan WHERE id=?').get(req.params.id), message: 'Pelanggan berhasil diperbarui' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.delete('/:id', (req, res) => {
  try {
    if (!db.prepare('SELECT id FROM pelanggan WHERE id = ?').get(req.params.id))
      return res.status(404).json({ success: false, message: 'Pelanggan tidak ditemukan' });
    db.prepare('DELETE FROM pelanggan WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: 'Pelanggan berhasil dihapus' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;

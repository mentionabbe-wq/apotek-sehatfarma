const express = require('express');
const router = express.Router();
const { db } = require('../database');

router.get('/', (req, res) => {
  try {
    res.json({ success: true, data: db.prepare('SELECT * FROM salesman ORDER BY nama ASC').all() });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get('/:id', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM salesman WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: 'Salesman tidak ditemukan' });
    res.json({ success: true, data: row });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/', (req, res) => {
  try {
    const { nama, telepon, email, target, komisi } = req.body;
    if (!nama) return res.status(400).json({ success: false, message: 'Nama salesman wajib diisi' });
    const id = 'sal_' + Date.now();
    db.prepare('INSERT INTO salesman (id,nama,telepon,email,target,komisi) VALUES (?,?,?,?,?,?)').run(
      id, nama, telepon || '', email || '', target || 0, komisi || 0
    );
    res.status(201).json({ success: true, data: db.prepare('SELECT * FROM salesman WHERE id=?').get(id), message: 'Salesman berhasil ditambahkan' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.put('/:id', (req, res) => {
  try {
    const { nama, telepon, email, target, komisi, aktif } = req.body;
    const ex = db.prepare('SELECT * FROM salesman WHERE id = ?').get(req.params.id);
    if (!ex) return res.status(404).json({ success: false, message: 'Salesman tidak ditemukan' });
    db.prepare('UPDATE salesman SET nama=?,telepon=?,email=?,target=?,komisi=?,aktif=? WHERE id=?').run(
      nama || ex.nama, telepon !== undefined ? telepon : ex.telepon, email !== undefined ? email : ex.email,
      target !== undefined ? target : ex.target, komisi !== undefined ? komisi : ex.komisi,
      aktif !== undefined ? aktif : ex.aktif, req.params.id
    );
    res.json({ success: true, data: db.prepare('SELECT * FROM salesman WHERE id=?').get(req.params.id), message: 'Salesman berhasil diperbarui' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.delete('/:id', (req, res) => {
  try {
    if (!db.prepare('SELECT id FROM salesman WHERE id = ?').get(req.params.id))
      return res.status(404).json({ success: false, message: 'Salesman tidak ditemukan' });
    db.prepare('DELETE FROM salesman WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: 'Salesman berhasil dihapus' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;

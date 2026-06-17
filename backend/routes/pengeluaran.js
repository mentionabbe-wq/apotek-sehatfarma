const express = require('express');
const router = express.Router();
const { db, genInv } = require('../database');

router.get('/', (req, res) => {
  try {
    const { dari, sampai, kategori } = req.query;
    let q = 'SELECT * FROM pengeluaran WHERE 1=1';
    const params = [];
    if (dari) { q += ' AND DATE(tanggal) >= ?'; params.push(dari); }
    if (sampai) { q += ' AND DATE(tanggal) <= ?'; params.push(sampai); }
    if (kategori) { q += ' AND kategori = ?'; params.push(kategori); }
    q += ' ORDER BY tanggal DESC';
    const rows = db.prepare(q).all(...params);
    const total = rows.reduce((s, r) => s + r.nominal, 0);
    res.json({ success: true, data: rows, total });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get('/:id', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM pengeluaran WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: 'Pengeluaran tidak ditemukan' });
    res.json({ success: true, data: row });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/', (req, res) => {
  try {
    const { tanggal, kategori, keterangan, penerima, nominal } = req.body;
    if (!nominal || nominal <= 0) return res.status(400).json({ success: false, message: 'Nominal wajib diisi' });
    const id = 'peng_' + Date.now();
    const inv = genInv('EXP', 'counterPeng');
    db.prepare('INSERT INTO pengeluaran (id,inv,tanggal,kategori,keterangan,penerima,nominal) VALUES (?,?,?,?,?,?,?)').run(
      id, inv, tanggal || new Date().toISOString(), kategori || 'Operasional', keterangan || '', penerima || '', nominal
    );
    res.status(201).json({ success: true, data: db.prepare('SELECT * FROM pengeluaran WHERE id=?').get(id), message: 'Pengeluaran berhasil disimpan' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.put('/:id', (req, res) => {
  try {
    const { tanggal, kategori, keterangan, penerima, nominal } = req.body;
    const ex = db.prepare('SELECT * FROM pengeluaran WHERE id = ?').get(req.params.id);
    if (!ex) return res.status(404).json({ success: false, message: 'Pengeluaran tidak ditemukan' });
    db.prepare('UPDATE pengeluaran SET tanggal=?,kategori=?,keterangan=?,penerima=?,nominal=? WHERE id=?').run(
      tanggal || ex.tanggal, kategori || ex.kategori, keterangan !== undefined ? keterangan : ex.keterangan,
      penerima !== undefined ? penerima : ex.penerima, nominal !== undefined ? nominal : ex.nominal, req.params.id
    );
    res.json({ success: true, data: db.prepare('SELECT * FROM pengeluaran WHERE id=?').get(req.params.id), message: 'Pengeluaran berhasil diperbarui' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.delete('/:id', (req, res) => {
  try {
    if (!db.prepare('SELECT id FROM pengeluaran WHERE id = ?').get(req.params.id))
      return res.status(404).json({ success: false, message: 'Pengeluaran tidak ditemukan' });
    db.prepare('DELETE FROM pengeluaran WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: 'Pengeluaran berhasil dihapus' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;

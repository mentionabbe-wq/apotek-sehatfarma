const express = require('express');
const router = express.Router();
const { db, genInv } = require('../database');

router.get('/', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM opname ORDER BY tanggal DESC').all();
    const result = rows.map(o => ({
      ...o,
      detail: db.prepare('SELECT * FROM opname_detail WHERE opname_id = ? ORDER BY nama_obat').all(o.id)
    }));
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get('/:id', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM opname WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: 'Opname tidak ditemukan' });
    const detail = db.prepare('SELECT * FROM opname_detail WHERE opname_id = ? ORDER BY nama_obat').all(req.params.id);
    res.json({ success: true, data: { ...row, detail } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST - create opname and adjust stock
router.post('/', (req, res) => {
  try {
    const { tanggal, petugas, keterangan, items } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0)
      return res.status(400).json({ success: false, message: 'Item opname tidak boleh kosong' });

    const id = 'opn_' + Date.now();
    const inv = genInv('OPN', 'counterOpname');

    const doOpname = db.transaction(() => {
      db.prepare('INSERT INTO opname (id,inv,tanggal,petugas,keterangan) VALUES (?,?,?,?,?)').run(
        id, inv, tanggal || new Date().toISOString(), petugas || '', keterangan || ''
      );
      for (const item of items) {
        const obat = db.prepare('SELECT * FROM obat WHERE id = ?').get(item.obat_id);
        if (!obat) throw new Error(`Obat ID ${item.obat_id} tidak ditemukan`);
        const stokSistem = obat.stok;
        const stokFisik = parseInt(item.stok_fisik) || 0;
        const selisih = stokFisik - stokSistem;
        db.prepare('INSERT INTO opname_detail (opname_id,obat_id,nama_obat,stok_sistem,stok_fisik,selisih) VALUES (?,?,?,?,?,?)').run(
          id, obat.id, obat.nama, stokSistem, stokFisik, selisih
        );
        db.prepare('UPDATE obat SET stok = ? WHERE id = ?').run(stokFisik, obat.id);
      }
    });

    doOpname();
    const opname = db.prepare('SELECT * FROM opname WHERE id=?').get(id);
    const detail = db.prepare('SELECT * FROM opname_detail WHERE opname_id=?').all(id);
    res.status(201).json({ success: true, data: { ...opname, detail }, message: 'Opname berhasil disimpan dan stok diperbarui' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.delete('/:id', (req, res) => {
  try {
    if (!db.prepare('SELECT id FROM opname WHERE id = ?').get(req.params.id))
      return res.status(404).json({ success: false, message: 'Opname tidak ditemukan' });
    db.prepare('DELETE FROM opname_detail WHERE opname_id = ?').run(req.params.id);
    db.prepare('DELETE FROM opname WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: 'Opname berhasil dihapus' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const { db } = require('../database');

// GET all supplier
router.get('/', (req, res) => {
  try {
    const suppliers = db.prepare('SELECT * FROM supplier ORDER BY nama ASC').all();
    res.json({ success: true, data: suppliers });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET single supplier
router.get('/:id', (req, res) => {
  try {
    const supplier = db.prepare('SELECT * FROM supplier WHERE id = ?').get(req.params.id);
    if (!supplier) return res.status(404).json({ success: false, message: 'Supplier tidak ditemukan' });
    res.json({ success: true, data: supplier });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST create supplier
router.post('/', (req, res) => {
  try {
    const { nama, telepon, alamat, email } = req.body;
    if (!nama) return res.status(400).json({ success: false, message: 'Nama supplier wajib diisi' });

    const result = db.prepare(`
      INSERT INTO supplier (nama, telepon, alamat, email) VALUES (?, ?, ?, ?)
    `).run(nama, telepon || '', alamat || '', email || '');

    const newSupplier = db.prepare('SELECT * FROM supplier WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ success: true, data: newSupplier, message: 'Supplier berhasil ditambahkan' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT update supplier
router.put('/:id', (req, res) => {
  try {
    const { nama, telepon, alamat, email } = req.body;
    const existing = db.prepare('SELECT * FROM supplier WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Supplier tidak ditemukan' });

    db.prepare(`
      UPDATE supplier SET nama=?, telepon=?, alamat=?, email=? WHERE id=?
    `).run(
      nama || existing.nama,
      telepon !== undefined ? telepon : existing.telepon,
      alamat !== undefined ? alamat : existing.alamat,
      email !== undefined ? email : existing.email,
      req.params.id
    );

    const updated = db.prepare('SELECT * FROM supplier WHERE id = ?').get(req.params.id);
    res.json({ success: true, data: updated, message: 'Supplier berhasil diperbarui' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE supplier
router.delete('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM supplier WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Supplier tidak ditemukan' });

    // Check if supplier has obat
    const obatCount = db.prepare('SELECT COUNT(*) as count FROM obat WHERE supplier_id = ?').get(req.params.id);
    if (obatCount.count > 0) {
      return res.status(400).json({ success: false, message: 'Supplier tidak dapat dihapus karena memiliki data obat' });
    }

    db.prepare('DELETE FROM supplier WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: 'Supplier berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { db } = require('../database');
const { adminOnly } = require('../middleware/auth');

// GET /api/pengguna
router.get('/', adminOnly, (req, res) => {
  try {
    const rows = db.prepare('SELECT id,username,nama,role,aktif,created_at FROM pengguna ORDER BY nama').all();
    res.json({ success: true, data: rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST /api/pengguna
router.post('/', adminOnly, (req, res) => {
  try {
    const { username, password, nama, role } = req.body;
    if (!username || !password || !nama)
      return res.status(400).json({ success: false, message: 'Username, password, dan nama wajib diisi' });

    const exists = db.prepare('SELECT id FROM pengguna WHERE username = ?').get(username);
    if (exists) return res.status(400).json({ success: false, message: 'Username sudah digunakan' });

    const hash = bcrypt.hashSync(password, 10);
    const result = db.prepare('INSERT INTO pengguna (username,password,nama,role) VALUES (?,?,?,?)').run(username, hash, nama, role || 'kasir');
    const newUser = db.prepare('SELECT id,username,nama,role,aktif FROM pengguna WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ success: true, data: newUser, message: 'Pengguna berhasil ditambahkan' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// PUT /api/pengguna/:id
router.put('/:id', adminOnly, (req, res) => {
  try {
    const { nama, role, aktif, password } = req.body;
    const existing = db.prepare('SELECT * FROM pengguna WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Pengguna tidak ditemukan' });

    if (password) {
      const hash = bcrypt.hashSync(password, 10);
      db.prepare('UPDATE pengguna SET password=? WHERE id=?').run(hash, req.params.id);
    }
    db.prepare('UPDATE pengguna SET nama=?,role=?,aktif=? WHERE id=?').run(
      nama || existing.nama, role || existing.role, aktif !== undefined ? aktif : existing.aktif, req.params.id
    );
    const updated = db.prepare('SELECT id,username,nama,role,aktif FROM pengguna WHERE id=?').get(req.params.id);
    res.json({ success: true, data: updated, message: 'Pengguna berhasil diperbarui' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// DELETE /api/pengguna/:id
router.delete('/:id', adminOnly, (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM pengguna WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Pengguna tidak ditemukan' });
    if (existing.username === 'admin') return res.status(400).json({ success: false, message: 'Akun admin utama tidak dapat dihapus' });
    db.prepare('DELETE FROM pengguna WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: 'Pengguna berhasil dihapus' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;

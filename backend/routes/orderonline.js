const express = require('express');
const router = express.Router();
const { db } = require('../database');

// PATCH /api/order-online/:kode/status — update status order dari apotek-online
router.patch('/:kode/status', (req, res) => {
  const { status } = req.body;
  const valid = ['diproses', 'dikirim', 'selesai', 'dibatalkan'];
  if (!valid.includes(status)) return res.status(400).json({ success: false, message: 'Status tidak valid' });

  try {
    // Simpan log status di tabel store
    const key = 'order_status_' + req.params.kode;
    db.prepare('INSERT OR REPLACE INTO store (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)')
      .run(key, JSON.stringify({ kode: req.params.kode, status, updated_at: new Date().toISOString() }));

    // Update status di notif list juga
    const row = db.prepare("SELECT value FROM store WHERE key='order_online_notif'").get();
    if (row) {
      const list = JSON.parse(row.value);
      const updated = list.map(o => o.kode === req.params.kode ? { ...o, status, type: status } : o);
      db.prepare('INSERT OR REPLACE INTO store (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)')
        .run('order_online_notif', JSON.stringify(updated));
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

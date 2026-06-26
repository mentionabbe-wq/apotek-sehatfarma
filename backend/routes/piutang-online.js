const express = require('express');
const router = express.Router();
const { db } = require('../database');

function getList() {
  try {
    const row = db.prepare("SELECT value FROM store WHERE key='piutang_online'").get();
    return row ? JSON.parse(row.value) : [];
  } catch { return []; }
}

function saveList(list) {
  db.prepare("INSERT OR REPLACE INTO store (key,value,updated_at) VALUES (?,?,CURRENT_TIMESTAMP)")
    .run('piutang_online', JSON.stringify(list));
}

// GET /api/piutang-online
router.get('/', (req, res) => {
  try {
    const list = getList();
    const belumLunas = list.filter(p => p.status !== 'lunas').length;
    res.json({ success: true, data: list, belum_lunas: belumLunas });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/piutang-online/:kode/lunas
router.patch('/:kode/lunas', (req, res) => {
  try {
    const list = getList();
    const idx = list.findIndex(p => p.kode === req.params.kode);
    if (idx < 0) return res.status(404).json({ success: false, message: 'Piutang tidak ditemukan' });
    list[idx].status = 'lunas';
    list[idx].lunas_at = new Date().toISOString();
    saveList(list);

    // Update juga di notif list
    try {
      const notifRow = db.prepare("SELECT value FROM store WHERE key='order_online_notif'").get();
      if (notifRow) {
        const notifList = JSON.parse(notifRow.value);
        const updated = notifList.map(o => o.kode === req.params.kode ? { ...o, status: 'lunas', type: 'selesai' } : o);
        db.prepare("INSERT OR REPLACE INTO store (key,value,updated_at) VALUES (?,?,CURRENT_TIMESTAMP)")
          .run('order_online_notif', JSON.stringify(updated));
      }
    } catch {}

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

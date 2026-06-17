const express = require('express');
const router = express.Router();
const { db } = require('../database');
const { adminOnly } = require('../middleware/auth');

// GET /api/pengaturan - return all as object
router.get('/', (req, res) => {
  try {
    const rows = db.prepare('SELECT key,value FROM pengaturan').all();
    const obj = {};
    for (const r of rows) obj[r.key] = r.value;
    res.json({ success: true, data: obj });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// PUT /api/pengaturan - update multiple keys
router.put('/', adminOnly, (req, res) => {
  try {
    const updates = req.body; // { key: value, ... }
    if (!updates || typeof updates !== 'object')
      return res.status(400).json({ success: false, message: 'Body harus berupa object' });

    const ins = db.prepare('INSERT OR REPLACE INTO pengaturan (key,value) VALUES (?,?)');
    const doUpdate = db.transaction(() => {
      for (const [k, v] of Object.entries(updates)) {
        if (!['counterTx','counterBeli','counterPeng','counterOpname'].includes(k))
          ins.run(k, String(v));
      }
    });
    doUpdate();

    const rows = db.prepare('SELECT key,value FROM pengaturan').all();
    const obj = {};
    for (const r of rows) obj[r.key] = r.value;
    res.json({ success: true, data: obj, message: 'Pengaturan berhasil disimpan' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;

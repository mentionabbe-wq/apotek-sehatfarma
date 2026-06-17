const express = require('express');
const router = express.Router();
const { db } = require('../database');

// GET /api/store/:key
router.get('/:key', (req, res) => {
  try {
    const row = db.prepare('SELECT value FROM store WHERE key = ?').get(req.params.key);
    const value = row ? JSON.parse(row.value) : null;
    res.json({ success: true, data: value });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/store/:key
router.put('/:key', (req, res) => {
  try {
    const { value } = req.body;
    db.prepare('INSERT OR REPLACE INTO store (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)')
      .run(req.params.key, JSON.stringify(value));
    res.json({ success: true, message: 'Data disimpan' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

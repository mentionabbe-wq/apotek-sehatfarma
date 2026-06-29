const express = require('express');
const router = express.Router();
const { db } = require('../database');

// POST /api/publik/sync-obat — sync OBAT dari localStorage frontend ke SQLite
router.post('/sync-obat', (req, res) => {
  const obatList = req.body.obat;
  if (!Array.isArray(obatList) || obatList.length === 0)
    return res.status(400).json({ success: false, message: 'Data obat kosong' });
  try {
    db.transaction(() => {
      db.prepare("DELETE FROM obat WHERE local_id != ''").run();
      const ins = db.prepare(`
        INSERT INTO obat
          (local_id, kode, nama, kategori, stok, stok_min, harga_beli, harga_jual,
           satuan, satuan_kecil, satuan_besar, jual_kecil, jual_besar, isi_per_besar, expired_date)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
      for (const o of obatList) {
        const sk = o.satuanKecil || o.satuan || 'Pcs';
        const jk = o.jualKecil || o.jual || o.harga_jual || 0;
        ins.run(
          o.id, o.kode || '', o.nama || '', o.kategori || '',
          o.stok || 0, o.min || 10, o.beli || o.harga_beli || 0,
          jk,
          sk,
          sk,
          o.satuanBesar || '',
          jk,
          o.jualBesar || 0,
          o.isiPerBesar || 0,
          o.exp || o.expired_date || null
        );
      }
    })();
    res.json({ success: true, synced: obatList.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/publik/produk?search=&page=1
router.get('/produk', (req, res) => {
  try {
    const search = req.query.search || '';
    const page = parseInt(req.query.page) || 1;
    const limit = 24;
    const offset = (page - 1) * limit;
    const params = [];
    let where = 'WHERE o.stok > 0';
    if (search) {
      where += ' AND (o.nama LIKE ? OR o.kategori LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    // Prioritaskan produk yang sudah di-sync dari localStorage (local_id != '')
    // Jika ada data sync, hanya tampilkan itu agar nama & satuan sama persis dengan apotek-app
    const hasSynced = db.prepare("SELECT 1 FROM obat WHERE local_id != '' LIMIT 1").get();
    if (hasSynced) {
      where += " AND o.local_id != ''";
    }
    const items = db.prepare(
      `SELECT o.id, o.local_id, o.kode, o.nama, o.kategori, o.stok,
              CASE WHEN o.satuan_kecil != '' THEN o.satuan_kecil ELSE o.satuan END as satuan,
              CASE WHEN o.satuan_kecil != '' THEN o.jual_kecil ELSE o.harga_jual END as harga_jual,
              o.satuan_besar, o.jual_besar, o.isi_per_besar
       FROM obat o ${where} ORDER BY o.nama ASC LIMIT ? OFFSET ?`
    ).all(...params, limit, offset);
    const total = db.prepare(`SELECT COUNT(*) as c FROM obat o ${where}`).get(...params).c;
    res.json({ success: true, items, total, page, limit });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/publik/produk/:id
router.get('/produk/:id', (req, res) => {
  try {
    const obat = db.prepare(
      `SELECT o.id, o.local_id, o.kode, o.nama, o.kategori, o.stok,
              CASE WHEN o.satuan_kecil != '' THEN o.satuan_kecil ELSE o.satuan END as satuan,
              CASE WHEN o.satuan_kecil != '' THEN o.jual_kecil ELSE o.harga_jual END as harga_jual,
              o.satuan_besar, o.jual_besar, o.isi_per_besar
       FROM obat o WHERE o.id = ?`
    ).get(req.params.id);
    if (!obat) return res.status(404).json({ success: false, message: 'Produk tidak ditemukan' });
    res.json({ success: true, data: obat });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/publik/pelanggan — sync pelanggan dari apotek-online (public, tidak butuh token)
router.post('/pelanggan', (req, res) => {
  try {
    const { nama, telepon, alamat, npwp, email, kategori } = req.body;
    if (!nama || !telepon) return res.status(400).json({ success: false, message: 'Nama dan telepon wajib' });

    // Cari klasifikasi berdasarkan kategori: Medis → Grosir, Umum → Umum
    const cariKlas = (nama_klas) => {
      const row = db.prepare("SELECT id FROM klasifikasi WHERE LOWER(nama) LIKE ? LIMIT 1").get(`%${nama_klas.toLowerCase()}%`);
      return row?.id || null;
    };
    const klasId = kategori === 'Medis' ? (cariKlas('Grosir') || cariKlas('Medis')) : cariKlas('Umum');

    // Cek apakah sudah ada (by telepon)
    const existing = db.prepare('SELECT id FROM pelanggan WHERE telepon = ?').get(telepon);
    if (existing) {
      // Update data existing
      db.prepare('UPDATE pelanggan SET nama=?, alamat=?, catatan=?, klasifikasi_id=? WHERE id=?').run(
        nama, alamat || '', npwp ? `NPWP: ${npwp}` : '', klasId, existing.id
      );
      return res.json({ success: true, action: 'updated', id: existing.id });
    }

    const id = 'pel_' + Date.now();
    db.prepare('INSERT INTO pelanggan (id,nama,telepon,alamat,catatan,klasifikasi_id) VALUES (?,?,?,?,?,?)').run(
      id, nama, telepon, alamat || '', npwp ? `NPWP: ${npwp}` : '', klasId
    );
    res.json({ success: true, action: 'created', id });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

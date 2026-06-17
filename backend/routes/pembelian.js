const express = require('express');
const router = express.Router();
const { db, genInv } = require('../database');

const withDetail = (p) => ({
  ...p,
  detail: db.prepare(`SELECT pd.*, o.satuan FROM pembelian_detail pd JOIN obat o ON pd.obat_id = o.id WHERE pd.pembelian_id = ?`).all(p.id)
});

router.get('/', (req, res) => {
  try {
    const { dari, sampai } = req.query;
    let q = `SELECT p.*, s.nama as supplier_nama FROM pembelian p LEFT JOIN supplier s ON p.supplier_id = s.id WHERE 1=1`;
    const params = [];
    if (dari) { q += ' AND DATE(p.tanggal) >= ?'; params.push(dari); }
    if (sampai) { q += ' AND DATE(p.tanggal) <= ?'; params.push(sampai); }
    q += ' ORDER BY p.tanggal DESC';
    res.json({ success: true, data: db.prepare(q).all(...params).map(withDetail) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get('/hutang/list', (req, res) => {
  try {
    const rows = db.prepare(`SELECT p.*, s.nama as supplier_nama FROM pembelian p LEFT JOIN supplier s ON p.supplier_id = s.id WHERE p.status_bayar != 'lunas' ORDER BY p.jatuh_tempo ASC, p.tanggal DESC`).all();
    res.json({ success: true, data: rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get('/:id', (req, res) => {
  try {
    const p = db.prepare(`SELECT p.*, s.nama as supplier_nama FROM pembelian p LEFT JOIN supplier s ON p.supplier_id = s.id WHERE p.id = ?`).get(req.params.id);
    if (!p) return res.status(404).json({ success: false, message: 'Pembelian tidak ditemukan' });
    res.json({ success: true, data: withDetail(p) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/', (req, res) => {
  try {
    const { supplier_id, keterangan, items, jatuh_tempo, bayar_muka } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0)
      return res.status(400).json({ success: false, message: 'Item pembelian tidak boleh kosong' });

    const inv = genInv('PO', 'counterBeli');

    const doBeli = db.transaction(() => {
      let total = 0;
      const enriched = [];

      for (const item of items) {
        const obat = db.prepare('SELECT * FROM obat WHERE id = ?').get(item.obat_id);
        if (!obat) throw new Error(`Obat ID ${item.obat_id} tidak ditemukan`);
        const harga = item.harga_beli || obat.harga_beli;
        const subtotal = harga * item.jumlah;
        total += subtotal;
        enriched.push({ obat, jumlah: item.jumlah, harga, subtotal, expired_date: item.expired_date });
      }

      const dp = parseFloat(bayar_muka) || 0;
      const sisa = Math.max(0, total - dp);
      const status = sisa <= 0 ? 'lunas' : (dp > 0 ? 'sebagian' : 'kredit');

      const sup = supplier_id ? db.prepare('SELECT nama FROM supplier WHERE id=?').get(supplier_id) : null;
      const result = db.prepare(
        'INSERT INTO pembelian (inv,supplier_id,supplier_nama,total,keterangan,jatuh_tempo,bayar_muka,sisa_bayar,status_bayar) VALUES (?,?,?,?,?,?,?,?,?)'
      ).run(inv, supplier_id||null, sup?.nama||'', total, keterangan||'', jatuh_tempo||'', dp, sisa, status);

      const beliId = result.lastInsertRowid;
      for (const { obat, jumlah, harga, subtotal, expired_date } of enriched) {
        db.prepare('INSERT INTO pembelian_detail (pembelian_id,obat_id,nama_obat,jumlah,harga_beli,subtotal) VALUES (?,?,?,?,?,?)').run(
          beliId, obat.id, obat.nama, jumlah, harga, subtotal
        );
        db.prepare('UPDATE obat SET stok = stok + ?, harga_beli = ? WHERE id = ?').run(jumlah, harga, obat.id);
        if (expired_date) db.prepare('UPDATE obat SET expired_date = ? WHERE id = ?').run(expired_date, obat.id);
      }

      return beliId;
    });

    const beliId = doBeli();
    const p = db.prepare(`SELECT p.*, s.nama as supplier_nama FROM pembelian p LEFT JOIN supplier s ON p.supplier_id = s.id WHERE p.id=?`).get(beliId);
    res.status(201).json({ success: true, data: withDetail(p), message: 'Pembelian berhasil disimpan' });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

router.put('/:id/bayar', (req, res) => {
  try {
    const p = db.prepare('SELECT * FROM pembelian WHERE id = ?').get(req.params.id);
    if (!p) return res.status(404).json({ success: false, message: 'Pembelian tidak ditemukan' });
    const tambah = parseFloat(req.body.jumlah) || 0;
    const totalBayar = Math.min(p.bayar_muka + tambah, p.total);
    const sisa = Math.max(0, p.total - totalBayar);
    const status = sisa <= 0 ? 'lunas' : 'sebagian';
    db.prepare('UPDATE pembelian SET bayar_muka=?, sisa_bayar=?, status_bayar=? WHERE id=?').run(totalBayar, sisa, status, p.id);
    res.json({ success: true, message: `Pembayaran dicatat, sisa: Rp ${sisa.toLocaleString('id-ID')}` });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

module.exports = router;

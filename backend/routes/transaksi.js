const express = require('express');
const router = express.Router();
const { db, genInv } = require('../database');

const withDetail = (t) => ({
  ...t,
  detail: db.prepare(`SELECT td.*, o.satuan FROM transaksi_detail td JOIN obat o ON td.obat_id = o.id WHERE td.transaksi_id = ?`).all(t.id)
});

router.get('/', (req, res) => {
  try {
    const { dari, sampai, kasir, metode_bayar, limit } = req.query;
    let q = 'SELECT * FROM transaksi WHERE 1=1';
    const params = [];
    if (dari) { q += ' AND DATE(tanggal) >= ?'; params.push(dari); }
    if (sampai) { q += ' AND DATE(tanggal) <= ?'; params.push(sampai); }
    if (kasir) { q += ' AND kasir = ?'; params.push(kasir); }
    if (metode_bayar) { q += ' AND metode_bayar = ?'; params.push(metode_bayar); }
    q += ' ORDER BY tanggal DESC';
    if (limit) { q += ' LIMIT ?'; params.push(parseInt(limit)); }
    res.json({ success: true, data: db.prepare(q).all(...params).map(withDetail) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get('/:id', (req, res) => {
  try {
    const t = db.prepare('SELECT * FROM transaksi WHERE id = ?').get(req.params.id);
    if (!t) return res.status(404).json({ success: false, message: 'Transaksi tidak ditemukan' });
    res.json({ success: true, data: withDetail(t) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/', (req, res) => {
  try {
    const { kasir, kepada, pelanggan_id, klasifikasi, salesman, metode_bayar, diskon, bayar, items } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0)
      return res.status(400).json({ success: false, message: 'Keranjang belanja kosong' });

    const inv = genInv('TRX', 'counterTx');

    const doTx = db.transaction(() => {
      let sub = 0, laba = 0;
      const enriched = [];

      for (const item of items) {
        const obat = db.prepare('SELECT * FROM obat WHERE id = ?').get(item.obat_id);
        if (!obat) throw new Error(`Obat ID ${item.obat_id} tidak ditemukan`);
        if (obat.stok < item.jumlah) throw new Error(`Stok ${obat.nama} tidak mencukupi (sisa: ${obat.stok})`);
        const subtotal = obat.harga_jual * item.jumlah;
        const itemLaba = (obat.harga_jual - obat.harga_beli) * item.jumlah;
        sub += subtotal;
        laba += itemLaba;
        enriched.push({ obat, jumlah: item.jumlah, subtotal, itemLaba });
      }

      const disc = Math.min(diskon || 0, sub);
      const total = sub - disc;
      const labaBersih = laba - disc;
      const kembalian = (bayar || 0) - total;

      if (bayar < total) throw new Error('Pembayaran tidak mencukupi');

      const result = db.prepare(`INSERT INTO transaksi (inv,kasir,kepada,pelanggan_id,klasifikasi,salesman,metode_bayar,sub,diskon,total,bayar,kembalian,laba)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        inv, kasir||'Admin', kepada||'', pelanggan_id||'', klasifikasi||'Umum',
        salesman||'', metode_bayar||'Tunai', sub, disc, total, bayar||0, kembalian, labaBersih
      );

      const txId = result.lastInsertRowid;
      for (const { obat, jumlah, subtotal } of enriched) {
        db.prepare('INSERT INTO transaksi_detail (transaksi_id,obat_id,nama_obat,jumlah,harga_satuan,harga_beli,subtotal) VALUES (?,?,?,?,?,?,?)').run(
          txId, obat.id, obat.nama, jumlah, obat.harga_jual, obat.harga_beli, subtotal
        );
        db.prepare('UPDATE obat SET stok = stok - ? WHERE id = ?').run(jumlah, obat.id);
      }

      return txId;
    });

    const txId = doTx();
    res.status(201).json({ success: true, data: withDetail(db.prepare('SELECT * FROM transaksi WHERE id=?').get(txId)), message: 'Transaksi berhasil disimpan' });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

module.exports = router;

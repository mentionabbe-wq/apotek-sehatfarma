'use strict';
/* =====================================================================
   Impor data dari aplikasi lama (SehatFarma, backend/ + index.html)
   - Membaca apotek.db lama HANYA-BACA; file lama tidak diubah.
   - Data lama ada di tabel `store` (key "apotek:*", value JSON) + tabel supplier.
   - Hasil: dokumen data untuk aplikasi baru (apotek-dian-farma.html).
   ===================================================================== */
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

const day = s => (s ? String(s).slice(0, 10) : '');
const addDays = (s, n) => { const d = new Date((s || new Date().toISOString().slice(0, 10)) + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const uniq = a => [...new Set(a.filter(Boolean))];
const num = v => (Number.isFinite(+v) ? +v : 0);

function bacaLama(file) {
  const db = new DatabaseSync(file, { readOnly: true });
  const has = t => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t);
  const store = {};
  if (has('store')) for (const r of db.prepare('SELECT key, value FROM store').all()) { try { store[r.key] = JSON.parse(r.value); } catch { /* lewati */ } }
  const supplier = has('supplier') ? db.prepare('SELECT nama, telepon, alamat FROM supplier').all() : [];
  db.close();
  return { store, supplier };
}

function konversi({ store, supplier: supRows }) {
  const S = k => store['apotek:' + k];
  const OBAT = S('obat') || [], TX = S('transaksi') || [], BELI = S('pembelian') || [], PENG = S('pengeluaran') || [];
  const SALES = S('salesman') || [], KLAS = S('klasifikasi') || [], PEL = S('pelanggan') || [], SP = S('surat_pesanan') || [];
  const PIU = S('piutang_pel') || [], SET = S('pengaturan') || {};
  const today = new Date().toISOString().slice(0, 10);
  const ppn = num(SET.ppn) || 11, pkp = !!SET.pkp, inclusive = SET.inclusive !== false;

  /* --- obat --- */
  const idMap = {}, byNama = {};
  const obat = OBAT.map((o, i) => {
    const id = i + 1; idMap[o.id] = id; byNama[String(o.nama || '').toLowerCase()] = id;
    const isi = o.satuanBesar && num(o.isiPerBesar) > 1 ? num(o.isiPerBesar) : 1;
    const beli = num(o.beli), jual = num(o.jualKecil || o.jual);
    const jenis = String(o.jenis || 'Biasa');
    return {
      id, kode: o.kode || '', nama: o.nama || 'Tanpa nama', kategori: o.kategori || 'Umum',
      satuan: o.satuanKecil || o.satuan || 'Pcs', satuanBesar: isi > 1 ? o.satuanBesar : '', isi, jualBesar: isi > 1 ? num(o.jualBesar) : 0,
      beli, jual, stok: num(o.stok), min: num(o.min), batch: o.batch || '', ed: o.exp ? String(o.exp).slice(0, 7) : '',
      barcode: o.barcode || '', hargaMode: 'manual', margin: beli ? Math.round((jual / beli - 1) * 1000) / 10 : 0,
      online: true, resep: /keras|antibiotik/i.test(o.kategori || '') || jenis !== 'Biasa',
    };
  });

  /* --- kategori pelanggan --- */
  const katpel = KLAS.length ? KLAS.map((k, i) => ({ id: i + 1, nama: k.nama || 'Kategori ' + (i + 1), diskon: num(k.diskon) })) : [{ id: 1, nama: 'Umum', diskon: 0 }];
  if (!katpel.some(k => k.nama === 'Umum')) katpel.unshift({ id: 0, nama: 'Umum', diskon: 0 });
  const klasNama = id => (KLAS.find(k => k.id === id) || {}).nama || 'Umum';

  /* --- pelanggan --- */
  const pelanggan = [{ id: 1, nama: 'Pelanggan Umum', kategori: 'Umum', diskonOff: 0, telp: '-', alamat: '-', npwp: '', tempo: false, termin: 30, limit: 0, pin: '' }];
  for (const p of PEL) {
    const npwp = (String(p.catatan || '').match(/NPWP:\s*([\d.\-]+)/i) || [])[1] || '';
    pelanggan.push({ id: pelanggan.length + 1, nama: p.nama || 'Tanpa nama', kategori: klasNama(p.klasifikasiId), diskonOff: 0, telp: p.telepon || '-', alamat: p.alamat || '-', npwp: npwp.replace(/\D/g, ''), tempo: false, termin: 30, limit: 0, pin: '', catatan: p.catatan || '' });
  }
  const pastikanPel = nama => { if (nama && !pelanggan.some(p => p.nama === nama)) pelanggan.push({ id: pelanggan.length + 1, nama, kategori: 'Umum', diskonOff: 0, telp: '-', alamat: '-', npwp: '', tempo: false, termin: 30, limit: 0, pin: '' }); };

  /* --- piutang pelanggan (tempo) --- */
  const piutang = PIU.map(h => {
    const tgl = day(h.waktu) || today, lunas = h.status === 'lunas';
    pastikanPel(h.kepada);
    return { pihak: h.kepada || 'Pelanggan Umum', ref: h.inv, tgl, jumlah: num(h.total), jt: day(h.jatuhTempo) || addDays(tgl, 30), status: lunas ? 'Lunas' : 'Belum Lunas',
      bayar: lunas ? [{ tgl: day(h.lunas_at) || tgl, jumlah: num(h.total), akun: 'Kas' }] : [] };
  });
  for (const p of pelanggan) if (piutang.some(h => h.pihak === p.nama)) p.tempo = p.nama !== 'Pelanggan Umum';

  /* --- supplier --- */
  const supNama = uniq([...supRows.map(s => s.nama), ...BELI.map(b => b.supplier), ...SP.map(s => s.pbf)]);
  const supplier = supNama.map((nama, i) => {
    const r = supRows.find(s => s.nama === nama) || {}, sp = SP.find(s => s.pbf === nama) || {};
    return { id: i + 1, nama, telp: r.telepon || sp.telpPbf || '', alamat: r.alamat || sp.alamatPbf || '' };
  });

  /* --- penjualan --- */
  const kas = [];
  const sales = TX.map(t => {
    const tgl = day(t.time) || today, total = num(t.total);
    const pajak = pkp && inclusive ? Math.round(total * ppn / (100 + ppn)) : 0;
    const tempo = t.metodeBayar === 'Tempo' || t.lunas === false;
    if (!tempo && total > 0) kas.push({ tgl, uraian: 'Penjualan ' + t.inv, jenis: 'Pemasukan', akun: /tunai|cash/i.test(t.metodeBayar || 'Tunai') ? 'Kas' : 'Bank BCA', jumlah: total });
    pastikanPel(t.kepada);
    return {
      no: t.inv, tgl, pelanggan: t.kepada || 'Pelanggan Umum',
      items: (t.items || []).map(it => ({ id: byNama[String(it.nama || '').toLowerCase()] || 0, nama: it.nama, qty: num(it.qty), isi: num(it.qty) ? Math.max(1, Math.round(num(it.qtyKecil) / num(it.qty))) : 1, unit: it.unit || '', harga: num(it.harga) })),
      subtotal: num(t.sub) || total, diskon: num(t.disc), kategori: t.klasifikasi || 'Umum', diskonPct: 0, pajak,
      ppnMode: pajak ? 'include' : 'none', ppnRate: pajak ? ppn : 0, total, hpp: Math.max(0, total - num(t.laba)),
      metode: t.metodeBayar || 'Tunai', bayar: num(t.pay), trx: 1, salesman: t.salesmanNama || '', komisi: num(t.komisi), impor: true,
    };
  });
  for (const h of piutang) if (h.status === 'Lunas') kas.push({ tgl: h.bayar[0].tgl, uraian: 'Pelunasan ' + h.ref, jenis: 'Pemasukan', akun: 'Kas', jumlah: h.jumlah });

  /* --- pembelian & hutang supplier --- */
  const hutang = [];
  const purch = BELI.map(b => {
    const tgl = day(b.time) || today, total = num(b.total), sisa = b.status === 'lunas' ? 0 : num(b.sisa ?? total);
    if (total - sisa > 0) kas.push({ tgl, uraian: 'Pembelian ' + b.no + ' (' + (b.supplier || '') + ')', jenis: 'Pengeluaran', akun: 'Kas', jumlah: total - sisa });
    if (sisa > 0) hutang.push({ pihak: b.supplier || '-', ref: b.no, jumlah: sisa, jt: day(b.jatuhTempo) || addDays(tgl, 30), status: 'Belum Lunas' });
    return { no: b.no, tgl, supplier: b.supplier || '-', items: [], total, pajak: num(b.ppnNom), status: sisa > 0 ? 'Belum Lunas' : 'Lunas', rekap: true };
  });

  /* --- pengeluaran --- */
  for (const p of PENG) kas.push({ tgl: day(p.time) || today, uraian: [p.kategori, p.keterangan, p.penerima].filter(Boolean).join(' · ') || 'Pengeluaran', jenis: 'Pengeluaran', akun: 'Kas', jumlah: num(p.nominal) });
  kas.sort((a, b) => (a.tgl < b.tgl ? -1 : a.tgl > b.tgl ? 1 : 0));

  /* --- surat pesanan --- */
  const sp = SP.map(s => ({
    no: s.no || 'SP-LAMA', tgl: day(s.tgl) || day(s.time) || today, supplier: s.pbf || '-', jenis: s.jenis && s.jenis !== 'Biasa' ? s.jenis : 'Reguler',
    items: (s.items || []).map(it => ({ id: byNama[String(it.nama || '').toLowerCase()], nama: [it.nama, it.zat, it.bentuk].filter(Boolean).join(' '), jumlah: num(it.jumlah) || it.jumlah || '', satuan: it.satuan || '' })),
    status: 'Dipesan',
  }));

  /* --- salesman --- */
  const salesman = SALES.map((s, i) => ({ id: i + 1, nama: s.nama || 'Salesman', telp: s.telepon || '', komisi: num(s.komisiPersen ?? s.komisi) }));

  const rek = Array.isArray(SET.rekening) ? SET.rekening.filter(r => r && (r.bank || r.nomor)).map(r => [r.bank, r.nomor, r.atasNama ? 'a.n. ' + r.atasNama : ''].filter(Boolean).join(' ')).join('\n') : '';
  const config = {
    nama: SET.apotekNama || 'Apotek', alamat: [SET.apotekAlamat, SET.apotekKota].filter(Boolean).join(', '), telp: SET.apotekTelepon || '',
    ppn, ppnMode: inclusive ? 'include' : 'exclude', logo: SET.logo || '', apoteker: SET.penanggungJawab || '', sipa: SET.noSIPA || '',
    kota: String(SET.apotekKota || '').toUpperCase(), marginDefault: num(SET.defaultMargin) || 25,
    toko: { buka: true, ongkir: 10000, gratisOngkir: 0, minBelanja: 0, bayar: ['transfer', 'qris', 'cod'], rekening: rek, qris: SET.qris || '', wa: SET.apotekTelepon || '', jam: '', info: '' },
  };
  Object.keys(config).forEach(k => { if (config[k] === '') delete config[k]; });

  const satDefault = ['Strip', 'Tablet', 'Kapsul', 'Botol', 'Tube', 'Box', 'Dus', 'Pak', 'Sachet'];
  return {
    config, obat, sales, purch, kas, hutang, piutang, sp, supplier, pelanggan, katpel, salesman,
    kategori: uniq([...obat.map(o => o.kategori), 'Obat Bebas', 'Obat Keras', 'Antibiotik', 'Vitamin & Suplemen', 'Alat Kesehatan', 'BHP']),
    satuan: uniq([...obat.flatMap(o => [o.satuan, o.satuanBesar]), ...satDefault]),
    dokter: [], harga: [], jurnal: [], mutasi: [], retur: [], bonus: [], komisi: [],
    users: [{ nama: SET.operatorNama || 'Admin', username: 'admin', level: 'Admin', status: 'Aktif' }],
    akses: { Admin: {}, Kasir: { dashboard: 1, pos: 1, retur: 1 }, Gudang: { dashboard: 1, master: 1, pembelian: 1, persediaan: 1, barcode: 1 } },
    audit: [{ t: new Date().toISOString(), u: 'system', a: `Impor dari aplikasi lama: ${obat.length} obat, ${pelanggan.length - 1} pelanggan, ${sales.length} penjualan, ${purch.length} pembelian` }],
    backup: new Date().toISOString(),
    seq: { pj: num(S('counter')) || TX.length, pb: num(S('counterBeli')) || BELI.length + 1, rj: 1, fp: 0, sp: sp.length },
  };
}

/** Kembalikan dokumen data hasil impor, atau null bila tidak ada data lama. */
function imporDariLama(file) {
  if (!fs.existsSync(file)) return null;
  const lama = bacaLama(file);
  if (!lama.store['apotek:obat'] && !lama.store['apotek:transaksi'] && !lama.store['apotek:pelanggan']) return null;
  return konversi(lama);
}

module.exports = { imporDariLama, konversi };

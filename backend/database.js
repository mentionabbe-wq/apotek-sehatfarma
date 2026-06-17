const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const DATA_DIR = process.env.DB_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'apotek.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function addCol(table, col, type) {
  try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`); } catch (_) {}
}

function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pengguna (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      nama TEXT NOT NULL,
      role TEXT DEFAULT 'kasir',
      aktif INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS supplier (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nama TEXT NOT NULL,
      telepon TEXT DEFAULT '',
      alamat TEXT DEFAULT '',
      email TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS klasifikasi (
      id TEXT PRIMARY KEY,
      nama TEXT NOT NULL,
      warna TEXT DEFAULT '#6b7280',
      diskon REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS pelanggan (
      id TEXT PRIMARY KEY,
      nama TEXT NOT NULL,
      telepon TEXT DEFAULT '',
      alamat TEXT DEFAULT '',
      catatan TEXT DEFAULT '',
      klasifikasi_id TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS salesman (
      id TEXT PRIMARY KEY,
      nama TEXT NOT NULL,
      telepon TEXT DEFAULT '',
      email TEXT DEFAULT '',
      target REAL DEFAULT 0,
      komisi REAL DEFAULT 0,
      aktif INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS obat (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kode TEXT DEFAULT '',
      nama TEXT NOT NULL,
      kategori TEXT DEFAULT '',
      stok INTEGER DEFAULT 0,
      stok_min INTEGER DEFAULT 10,
      harga_beli REAL DEFAULT 0,
      harga_jual REAL DEFAULT 0,
      satuan TEXT DEFAULT 'tablet',
      expired_date TEXT,
      supplier_id INTEGER,
      lokasi TEXT DEFAULT '',
      keterangan TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (supplier_id) REFERENCES supplier(id)
    );

    CREATE TABLE IF NOT EXISTS transaksi (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      inv TEXT UNIQUE NOT NULL,
      tanggal DATETIME DEFAULT CURRENT_TIMESTAMP,
      kasir TEXT DEFAULT 'Admin',
      kepada TEXT DEFAULT '',
      pelanggan_id TEXT DEFAULT '',
      klasifikasi TEXT DEFAULT 'Umum',
      salesman TEXT DEFAULT '',
      metode_bayar TEXT DEFAULT 'Tunai',
      sub REAL DEFAULT 0,
      diskon REAL DEFAULT 0,
      total REAL DEFAULT 0,
      bayar REAL DEFAULT 0,
      kembalian REAL DEFAULT 0,
      laba REAL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS transaksi_detail (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaksi_id INTEGER NOT NULL,
      obat_id INTEGER NOT NULL,
      nama_obat TEXT DEFAULT '',
      jumlah INTEGER NOT NULL,
      harga_satuan REAL NOT NULL,
      harga_beli REAL DEFAULT 0,
      subtotal REAL NOT NULL,
      FOREIGN KEY (transaksi_id) REFERENCES transaksi(id) ON DELETE CASCADE,
      FOREIGN KEY (obat_id) REFERENCES obat(id)
    );

    CREATE TABLE IF NOT EXISTS pembelian (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      inv TEXT UNIQUE NOT NULL,
      tanggal DATETIME DEFAULT CURRENT_TIMESTAMP,
      supplier_id INTEGER,
      supplier_nama TEXT DEFAULT '',
      total REAL DEFAULT 0,
      keterangan TEXT DEFAULT '',
      FOREIGN KEY (supplier_id) REFERENCES supplier(id)
    );

    CREATE TABLE IF NOT EXISTS pembelian_detail (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pembelian_id INTEGER NOT NULL,
      obat_id INTEGER NOT NULL,
      nama_obat TEXT DEFAULT '',
      jumlah INTEGER NOT NULL,
      harga_beli REAL NOT NULL,
      subtotal REAL NOT NULL,
      FOREIGN KEY (pembelian_id) REFERENCES pembelian(id) ON DELETE CASCADE,
      FOREIGN KEY (obat_id) REFERENCES obat(id)
    );

    CREATE TABLE IF NOT EXISTS pengeluaran (
      id TEXT PRIMARY KEY,
      inv TEXT DEFAULT '',
      tanggal DATETIME DEFAULT CURRENT_TIMESTAMP,
      kategori TEXT DEFAULT 'Operasional',
      keterangan TEXT DEFAULT '',
      penerima TEXT DEFAULT '',
      nominal REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS opname (
      id TEXT PRIMARY KEY,
      inv TEXT DEFAULT '',
      tanggal DATETIME DEFAULT CURRENT_TIMESTAMP,
      petugas TEXT DEFAULT '',
      keterangan TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS opname_detail (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      opname_id TEXT NOT NULL,
      obat_id INTEGER NOT NULL,
      nama_obat TEXT DEFAULT '',
      stok_sistem INTEGER DEFAULT 0,
      stok_fisik INTEGER DEFAULT 0,
      selisih INTEGER DEFAULT 0,
      FOREIGN KEY (opname_id) REFERENCES opname(id) ON DELETE CASCADE,
      FOREIGN KEY (obat_id) REFERENCES obat(id)
    );

    CREATE TABLE IF NOT EXISTS pengaturan (
      key TEXT PRIMARY KEY,
      value TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS store (
      key TEXT PRIMARY KEY,
      value TEXT DEFAULT 'null',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migration: add columns to existing tables
  addCol('obat', 'kode', 'TEXT DEFAULT ""');
  addCol('obat', 'stok_min', 'INTEGER DEFAULT 10');
  addCol('obat', 'lokasi', 'TEXT DEFAULT ""');
  addCol('obat', 'keterangan', 'TEXT DEFAULT ""');
  addCol('transaksi', 'inv', 'TEXT');
  addCol('transaksi', 'kepada', 'TEXT DEFAULT ""');
  addCol('transaksi', 'pelanggan_id', 'TEXT DEFAULT ""');
  addCol('transaksi', 'klasifikasi', 'TEXT DEFAULT "Umum"');
  addCol('transaksi', 'salesman', 'TEXT DEFAULT ""');
  addCol('transaksi', 'metode_bayar', 'TEXT DEFAULT "Tunai"');
  addCol('transaksi', 'sub', 'REAL DEFAULT 0');
  addCol('transaksi', 'diskon', 'REAL DEFAULT 0');
  addCol('transaksi', 'laba', 'REAL DEFAULT 0');
  addCol('pembelian', 'inv', 'TEXT');
  addCol('pembelian', 'supplier_nama', 'TEXT DEFAULT ""');
  addCol('pembelian', 'jatuh_tempo', 'TEXT DEFAULT ""');
  addCol('pembelian', 'bayar_muka', 'REAL DEFAULT 0');
  addCol('pembelian', 'sisa_bayar', 'REAL DEFAULT 0');
  addCol('pembelian', 'status_bayar', 'TEXT DEFAULT "lunas"');
  addCol('pengguna', 'menus', 'TEXT DEFAULT "[]"');

  // Default users
  const userCount = db.prepare('SELECT COUNT(*) as c FROM pengguna').get();
  if (userCount.c === 0) {
    db.prepare('INSERT INTO pengguna (username,password,nama,role,menus) VALUES (?,?,?,?,?)')
      .run('admin', bcrypt.hashSync('admin123', 10), 'Administrator', 'admin', '["all"]');
    db.prepare('INSERT INTO pengguna (username,password,nama,role,menus) VALUES (?,?,?,?,?)')
      .run('kasir', bcrypt.hashSync('kasir123', 10), 'Kasir Utama', 'kasir',
        JSON.stringify(['dashboard','kasir','obat','stok','laporan']));
  }

  // Default klasifikasi
  const klasCount = db.prepare('SELECT COUNT(*) as c FROM klasifikasi').get();
  if (klasCount.c === 0) {
    const ins = db.prepare('INSERT INTO klasifikasi (id,nama,warna,diskon) VALUES (?,?,?,?)');
    ins.run('kl_umum', 'Umum', '#6b7280', 0);
    ins.run('kl_member', 'Member', '#0d9488', 5);
    ins.run('kl_grosir', 'Grosir', '#7c3aed', 10);
    ins.run('kl_reseller', 'Reseller', '#d97706', 15);
  }

  // Default supplier
  const supCount = db.prepare('SELECT COUNT(*) as c FROM supplier').get();
  if (supCount.c === 0) {
    const ins = db.prepare('INSERT INTO supplier (nama,telepon,alamat,email) VALUES (?,?,?,?)');
    ins.run('PT Kimia Farma', '021-5555001', 'Jl. Veteran No.9, Jakarta Pusat', 'order@kimiafarma.co.id');
    ins.run('PT Kalbe Farma', '021-4288-9999', 'Jl. Let. Jend. Suprapto Kav.4, Jakarta Pusat', 'procurement@kalbe.co.id');
    ins.run('PT Sanbe Farma', '022-6032218', 'Jl. Industri No.6, Leuwigajah, Cimahi', 'supply@sanbe.co.id');
  }

  // Default obat
  const obatCount = db.prepare('SELECT COUNT(*) as c FROM obat').get();
  if (obatCount.c === 0) {
    const ins = db.prepare('INSERT INTO obat (kode,nama,kategori,stok,stok_min,harga_beli,harga_jual,satuan,expired_date,supplier_id) VALUES (?,?,?,?,?,?,?,?,?,?)');
    ins.run('OBT001','Paracetamol 500mg','Analgesik',250,20,500,1200,'tablet','2026-12-31',1);
    ins.run('OBT002','Amoxicillin 500mg','Antibiotik',180,15,2500,5500,'kapsul','2026-08-15',1);
    ins.run('OBT003','Vitamin C 1000mg','Vitamin & Suplemen',300,30,3000,7000,'tablet','2027-03-31',2);
    ins.run('OBT004','Antasida DOEN','Antasida',120,10,1500,4000,'tablet','2026-10-20',2);
    ins.run('OBT005','OBH Combi Batuk','Obat Batuk',75,10,8000,15000,'botol','2026-06-30',3);
    ins.run('OBT006','Ibuprofen 400mg','Analgesik',8,10,1800,4500,'tablet','2026-11-15',1);
    ins.run('OBT007','Cetirizine 10mg','Antihistamin',95,10,1200,3500,'tablet','2027-01-31',2);
    ins.run('OBT008','Omeprazole 20mg','Antasida',5,10,3500,8000,'kapsul','2026-09-20',3);
    ins.run('OBT009','Metformin 500mg','Antidiabetik',200,20,1000,3000,'tablet','2027-06-30',1);
    ins.run('OBT010','Amlodipine 5mg','Antihipertensi',150,15,2000,5500,'tablet','2027-02-28',2);
  }

  // Default pengaturan
  const setData = {
    namaApotek: 'SehatFarma', alamat: 'Jl. Kesehatan No. 1', telepon: '08123456789',
    email: '', rekening: '', namaRekening: '', namaBank: '',
    pajak: '0', strukUkuran: 'a4',
    counterTx: '1', counterBeli: '1', counterPeng: '1', counterOpname: '1'
  };
  const insSet = db.prepare('INSERT OR IGNORE INTO pengaturan (key,value) VALUES (?,?)');
  for (const [k, v] of Object.entries(setData)) insSet.run(k, v);

  console.log('✓ Database siap');
}

function getCounter(key) {
  const row = db.prepare('SELECT value FROM pengaturan WHERE key = ?').get(key);
  return parseInt(row?.value || '1');
}

function nextCounter(key) {
  const n = getCounter(key);
  db.prepare('INSERT OR REPLACE INTO pengaturan (key,value) VALUES (?,?)').run(key, String(n + 1));
  return n;
}

function genInv(prefix, counterKey) {
  const n = nextCounter(counterKey);
  const d = new Date();
  const ym = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}`;
  return `${prefix}-${ym}-${String(n).padStart(4,'0')}`;
}

module.exports = { db, initDatabase, getCounter, nextCounter, genInv };

const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDatabase } = require('./database');
const { authMiddleware } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Public: auth only
app.use('/api/auth', require('./routes/auth'));

// Public: notifikasi dari apotek-online (tidak butuh token)
app.use('/api/store/notif', require('./routes/notif'));

// Public: produk untuk apotek-online (tidak butuh token)
app.use('/api/publik', require('./routes/publik'));

// Public: notif order (tidak butuh token — dipanggil dari apotek-online)
app.use('/api/order-online', require('./routes/orderonline'));

// Protected: semua route API lainnya
app.use('/api', authMiddleware);
app.use('/api/pengguna',   require('./routes/pengguna'));
app.use('/api/obat',       require('./routes/obat'));
app.use('/api/supplier',   require('./routes/supplier'));
app.use('/api/transaksi',  require('./routes/transaksi'));
app.use('/api/pembelian',  require('./routes/pembelian'));
app.use('/api/laporan',    require('./routes/laporan'));
app.use('/api/pelanggan',  require('./routes/pelanggan'));
app.use('/api/klasifikasi',require('./routes/klasifikasi'));
app.use('/api/salesman',   require('./routes/salesman'));
app.use('/api/pengeluaran',require('./routes/pengeluaran'));
app.use('/api/opname',     require('./routes/opname'));
app.use('/api/pengaturan', require('./routes/pengaturan'));
app.use('/api/store',     require('./routes/store'));

// 404 API
app.use('/api', (req, res) => {
  res.status(404).json({ success: false, message: 'Endpoint tidak ditemukan' });
});

// Catch-all SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

initDatabase();

app.listen(PORT, () => {
  console.log(`\n====================================`);
  console.log(`  ApotekPro API v2.0`);
  console.log(`  Port  : ${PORT}`);
  console.log(`  URL   : http://localhost:${PORT}`);
  console.log(`  Login : admin / admin123`);
  console.log(`====================================\n`);
});

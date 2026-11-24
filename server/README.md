# Server Apotek Dian Farma

Satu server untuk dua aplikasi:

| Alamat | Untuk | File |
|---|---|---|
| `/` (atau `/admin`) | Apoteker / admin | `frontend/apotek-dian-farma.html` |
| `/toko` | Pelanggan (toko online) | `frontend/toko.html` |

Tidak perlu `npm install`. Cukup **Node.js 22.13 atau lebih baru**, karena database memakai SQLite bawaan Node (`node:sqlite`).

## Update di CasaOS (mengganti aplikasi lama SehatFarma)

Sejak versi ini, image `ghcr.io/mentionabbe-wq/apotek-sehatfarma:latest` berisi aplikasi baru. Image ini dibangun dari `Dockerfile.standalone` oleh GitHub Actions setiap kali ada push ke `master`.

1. Push ke GitHub, misalnya dengan `UPLOAD KE GITHUB.bat`, lalu tunggu GitHub Actions selesai (sekitar 5–10 menit).
2. Di CasaOS, buka aplikasi **apotek-sehatfarma**, lalu pilih **Update** / **Rebuild**. Port **3002** dan folder data **tetap sama**.
3. Saat pertama jalan, server **mengimpor data lama** dari `/DATA/AppData/apotek-sehatfarma/data/apotek.db`: obat dan stok, satuan besar/kecil, harga, pelanggan dan klasifikasinya, salesman, supplier, penjualan, pembelian, hutang supplier, piutang tempo, pengeluaran, surat pesanan, dan pengaturan apotek. File lama **tidak diubah**. Data baru disimpan di `dianfarma.db` dalam folder yang sama.
4. Buka `http://<IP-SERVER>:3002/` dan login dengan **admin / admin123**, lalu ganti password. Password aplikasi lama tidak ikut pindah.
5. Periksa hal-hal berikut:
   - **Saldo kas:** yang diimpor hanya transaksi, tanpa saldo awal. Sesuaikan lewat Keuangan → Tambah Pemasukan, misalnya "Saldo awal kas".
   - **Obat wajib resep:** ditandai otomatis untuk kategori Obat Keras/Antibiotik dan jenis selain Biasa. Periksa di Data Obat.
   - **Pelanggan tempo:** pelanggan yang punya piutang otomatis diberi izin tempo. Atur limit dan PIN di data pelanggan.

**Kembali ke versi lama:** di CasaOS, ganti image ke `ghcr.io/mentionabbe-wq/apotek-sehatfarma:25ed7690dbe8171874197d999a8c311e72001122` (versi lama terakhir). Data lama (`apotek.db`) masih utuh.

Aplikasi **apotek-online** yang lama tidak lagi tersambung. Penggantinya adalah toko online bawaan di `/toko`.

## Menjalankan di komputer (tanpa CasaOS)

1. Klik dua kali **`JALANKAN DIAN FARMA.bat`** di folder utama. Server berjalan di port 3100.
2. Browser terbuka ke `http://localhost:3100/`. Login awal: **admin / admin123**.
3. Jika server belum punya data dan tidak ada `apotek.db` lama, data yang ada di browser diunggah saat login pertama.
4. Pelanggan membuka `http://<alamat-komputer>:3100/toko`.

Data tersimpan di `server/data/dianfarma.db`. Salin file ini untuk backup.

## Docker biasa

```
docker compose -f docker-compose.dianfarma.yml up -d --build
```

Sebelum menjalankan, ganti `ADMIN_PASSWORD`. Data disimpan di volume `dianfarma-data`.

## Agar toko bisa dibuka dari internet

Server berjalan di jaringan lokal. Agar pelanggan bisa membukanya dari luar, perlu VPS atau tunnel (misalnya Cloudflare Tunnel), ditambah domain dan **HTTPS**. HTTPS wajib karena ada data pelanggan, foto resep, dan tagihan.

## Alur pesanan online

1. Pelanggan memesan di toko. Obat keras wajib disertai foto resep, dan harga dihitung ulang di server.
2. Stok untuk pesanan yang masih **Baru** ditahan agar tidak terjual dua kali di toko.
3. Admin membuka **Toko Online → Pesanan → Detail**, lalu memeriksa resep dan bukti bayar, lalu klik **Proses Pesanan**. Saat itu stok dipotong, penjualan dibuat, dan kas (atau piutang untuk COD) serta jurnal dicatat.
4. Status berikutnya: **Dikirim** atau **Siap diambil**, lalu **Selesai**. Untuk COD, kas dicatat saat Selesai.
5. Pelanggan memantau status lewat **Cek Pesanan** (kode + HP), dan melihat sisa hutang tempo lewat **Tagihan** (HP + PIN).

## API (ringkas)

Publik: `GET /api/toko/info`, `GET /api/toko/produk`, `POST /api/toko/tagihan` (HP + PIN), `POST /api/toko/pesanan`, `GET /api/toko/pesanan/:kode?telp=`, `POST /api/toko/pesanan/:kode/bukti`

Akun pelanggan: `POST /api/akun/daftar`, `POST /api/akun/masuk`, `POST /api/akun/reset` (HP + PIN), lalu dengan token pelanggan: `GET /api/akun/saya`, `PUT /api/akun/profil`, `POST /api/akun/password`, `POST /api/akun/verifikasi`. Diskon member di checkout hanya untuk akun yang sudah terhubung lewat PIN.

Admin (Bearer token): `GET /api/admin/akun`, `POST /api/admin/akun/:telp/reset`, `DELETE /api/admin/akun/:telp`, `POST /api/auth/login`, `POST /api/auth/password`, `GET|PUT /api/state`, `GET /api/admin/orders`, `GET|PATCH /api/admin/orders/:kode`

# Server Apotek Dian Farma

Satu server untuk dua aplikasi:

| Alamat | Untuk | File |
|---|---|---|
| `http://localhost:3100/admin` | Apoteker / admin | `frontend/apotek-dian-farma.html` |
| `http://localhost:3100/` | Pelanggan (toko online) | `frontend/toko.html` |

Tidak perlu `npm install`. Cukup **Node.js 22.13 atau lebih baru**, karena database memakai SQLite bawaan Node (`node:sqlite`).

## Menjalankan di komputer apotek

1. Klik dua kali **`JALANKAN DIAN FARMA.bat`** di folder utama.
2. Browser terbuka ke halaman admin. Login awal: **admin / admin123**. Aplikasi langsung meminta Anda mengganti password.
3. Saat login pertama kali, data yang ada di browser diunggah ke server dan menjadi data utama.
4. Atur toko di menu **Toko Online → Pengaturan Toko** (rekening, QRIS, ongkir, WhatsApp).
5. Pelanggan membuka `http://<alamat-komputer>:3100/`.

Data tersimpan di `server/data/dianfarma.db`. Salin file ini untuk backup.

## Menjalankan dengan Docker

```
docker compose -f docker-compose.dianfarma.yml up -d --build
```

Sebelum menjalankan, ganti `ADMIN_PASSWORD` di file compose. Data disimpan di volume `dianfarma-data`.

## Agar toko bisa dibuka dari internet

Server ini berjalan di jaringan lokal. Agar pelanggan bisa membukanya dari luar, perlu salah satu dari:
- VPS / hosting yang menjalankan Node.js atau Docker, ditambah domain dan HTTPS (wajib, karena ada data pelanggan dan foto resep).
- Tunnel seperti Cloudflare Tunnel dari komputer apotek.

## Alur pesanan online

1. Pelanggan memesan di toko. Obat keras wajib disertai foto resep, dan harga dihitung ulang di server.
2. Stok untuk pesanan yang masih **Baru** ditahan agar tidak terjual dua kali di toko.
3. Admin membuka **Toko Online → Pesanan → Detail**, lalu memeriksa resep dan bukti bayar, lalu klik **Proses Pesanan**. Saat itu stok dipotong, penjualan dibuat, dan kas (atau piutang untuk COD) serta jurnal dicatat.
4. Status berikutnya: **Dikirim** atau **Siap diambil**, lalu **Selesai**. Untuk COD, kas dicatat saat Selesai.
5. Pelanggan memantau status lewat **Cek Pesanan** (kode pesanan + nomor HP).

## API (ringkas)

Publik: `GET /api/toko/info`, `GET /api/toko/produk`, `POST /api/toko/diskon`, `POST /api/toko/tagihan` (HP + PIN), `POST /api/toko/pesanan`, `GET /api/toko/pesanan/:kode?telp=`, `POST /api/toko/pesanan/:kode/bukti`

Admin (Bearer token): `POST /api/auth/login`, `POST /api/auth/password`, `GET|PUT /api/state`, `GET /api/admin/orders`, `GET|PATCH /api/admin/orders/:kode`

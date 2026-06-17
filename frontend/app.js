/* ============================================================
   ApotekPro - Frontend Application
   ============================================================ */

const API = 'http://localhost:3000/api';

// ===== STATE =====
let allObat = [];
let allSupplier = [];
let allPembelian = [];
let cart = [];
let laporanChart = null;
let laporanData = null;
let confirmCallback = null;
let pembelianRowCount = 0;

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  updateDateTime();
  setInterval(updateDateTime, 1000);
  initLaporanDefaults();
  setupNavigation();
  navigateTo('dashboard');
});

function updateDateTime() {
  const now = new Date();
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  const dateStr = now.toLocaleDateString('id-ID', options);
  const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const el = document.getElementById('current-datetime');
  if (el) el.textContent = `${dateStr} | ${timeStr}`;
}

function initLaporanDefaults() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  const today = now.toISOString().split('T')[0];
  document.getElementById('laporan-bulan').value = month;
  document.getElementById('laporan-tahun').value = year;
  document.getElementById('laporan-tanggal').value = today;
  onLaporanTipeChange();
}

// ===== NAVIGATION =====
function setupNavigation() {
  document.querySelectorAll('.nav-item[data-page]').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.page));
  });
}

const pageTitles = {
  dashboard: ['Dashboard', 'Ringkasan aktivitas apotek hari ini'],
  kasir: ['Kasir / POS', 'Proses transaksi penjualan'],
  obat: ['Data Obat', 'Manajemen stok dan data obat'],
  supplier: ['Supplier', 'Manajemen data supplier'],
  pembelian: ['Pembelian / Restock', 'Pembelian stok dari supplier'],
  laporan: ['Laporan Penjualan', 'Analitik dan laporan keuangan'],
};

function navigateTo(page) {
  // Update nav
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const navBtn = document.querySelector(`.nav-item[data-page="${page}"]`);
  if (navBtn) navBtn.classList.add('active');

  // Update pages
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const pageEl = document.getElementById(`page-${page}`);
  if (pageEl) pageEl.classList.add('active');

  // Update title
  const titles = pageTitles[page] || [page, ''];
  document.getElementById('page-title').textContent = titles[0];
  document.getElementById('page-subtitle').textContent = titles[1];

  // Load page data
  switch (page) {
    case 'dashboard': loadDashboard(); break;
    case 'kasir': loadKasirObat(); break;
    case 'obat': loadObat(); break;
    case 'supplier': loadSupplier(); break;
    case 'pembelian': loadPembelian(); break;
    case 'laporan': /* manual trigger */ break;
  }
}

// ===== HELPERS =====
function formatRp(n) {
  return 'Rp ' + Number(n || 0).toLocaleString('id-ID');
}

function formatDate(dt) {
  if (!dt) return '-';
  return new Date(dt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(dt) {
  if (!dt) return '-';
  return new Date(dt).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function stokBadge(stok) {
  if (stok <= 0) return `<span class="stok-empty">${stok} (Habis)</span>`;
  if (stok <= 10) return `<span class="stok-low">${stok} ⚠️</span>`;
  return `<span class="stok-ok">${stok}</span>`;
}

async function apiFetch(url, options = {}) {
  try {
    const res = await fetch(API + url, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Terjadi kesalahan');
    return data;
  } catch (err) {
    throw err;
  }
}

// ===== TOAST =====
function showToast(message, type = 'info') {
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type]}</span>
    <span class="toast-msg">${message}</span>
    <button class="toast-close" onclick="this.parentElement.remove()">✕</button>
  `;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'toastOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ===== MODALS =====
function openModal(id) {
  document.getElementById(id).classList.add('open');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

// Close modal on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal(overlay.id);
  });
});

function showConfirm(title, msg, callback, icon = '⚠️') {
  document.getElementById('confirm-icon').textContent = icon;
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-msg').textContent = msg;
  confirmCallback = callback;
  document.getElementById('confirm-btn').onclick = () => {
    closeModal('modal-confirm');
    if (confirmCallback) confirmCallback();
  };
  openModal('modal-confirm');
}

// ===== DASHBOARD =====
async function loadDashboard() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const [laporanHarian, stokMenipis, obatData] = await Promise.all([
      apiFetch(`/laporan/harian?tanggal=${today}`),
      apiFetch('/laporan/stok-menipis'),
      apiFetch('/obat'),
    ]);

    const s = laporanHarian.data.summary;
    document.getElementById('stat-penjualan').textContent = formatRp(s.total_penjualan);
    document.getElementById('stat-penjualan-sub').textContent = `${s.total_transaksi} transaksi hari ini`;
    document.getElementById('stat-transaksi').textContent = s.total_transaksi;
    document.getElementById('stat-transaksi-sub').textContent = `Rata-rata ${formatRp(s.rata_rata)}`;
    document.getElementById('stat-stok-menipis').textContent = stokMenipis.data.length;
    document.getElementById('stat-total-obat').textContent = obatData.data.length;

    // Recent transaksi
    const transaksiRes = await apiFetch('/transaksi?limit=8');
    const tbody = document.getElementById('dashboard-transaksi-tbody');
    if (transaksiRes.data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state" style="padding:30px"><div class="icon">🧾</div><p>Belum ada transaksi hari ini</p></div></td></tr>`;
    } else {
      tbody.innerHTML = transaksiRes.data.map(t => `
        <tr>
          <td><span class="badge badge-blue">#${t.id}</span></td>
          <td>${formatDateTime(t.tanggal)}</td>
          <td style="font-weight:600;color:#2563eb">${formatRp(t.total)}</td>
          <td>${formatRp(t.bayar)}</td>
          <td>${t.kasir}</td>
        </tr>
      `).join('');
    }

    // Stok menipis
    const stokTbody = document.getElementById('dashboard-stok-tbody');
    if (stokMenipis.data.length === 0) {
      stokTbody.innerHTML = `<tr><td colspan="2"><div class="empty-state" style="padding:24px"><div class="icon" style="font-size:32px">✅</div><p>Semua stok aman</p></div></td></tr>`;
    } else {
      stokTbody.innerHTML = stokMenipis.data.slice(0, 8).map(o => `
        <tr>
          <td>${o.nama}</td>
          <td>${stokBadge(o.stok)}</td>
        </tr>
      `).join('');
    }
  } catch (err) {
    showToast('Gagal memuat dashboard: ' + err.message, 'error');
  }
}

// ===== KASIR =====
async function loadKasirObat() {
  try {
    const res = await apiFetch('/obat');
    allObat = res.data;
    renderKasirTable(allObat);
  } catch (err) {
    showToast('Gagal memuat data obat: ' + err.message, 'error');
  }
}

function renderKasirTable(data) {
  const tbody = document.getElementById('kasir-obat-tbody');
  document.getElementById('products-count').textContent = `${data.length} item`;
  if (data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state" style="padding:30px"><div class="icon">💊</div><p>Tidak ada obat ditemukan</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = data.map(o => `
    <tr>
      <td><strong>${o.nama}</strong></td>
      <td><span class="badge badge-blue">${o.kategori || '-'}</span></td>
      <td>${stokBadge(o.stok)}</td>
      <td style="font-weight:600">${formatRp(o.harga_jual)}</td>
      <td>
        <button class="btn btn-primary btn-sm" onclick="addToCart(${o.id})" ${o.stok <= 0 ? 'disabled' : ''}>
          ${o.stok <= 0 ? 'Habis' : '+ Keranjang'}
        </button>
      </td>
    </tr>
  `).join('');
}

// Kasir search
const kasirSearch = document.getElementById('kasir-search');
if (kasirSearch) {
  kasirSearch.addEventListener('input', function () {
    const q = this.value.toLowerCase().trim();
    const results = document.getElementById('kasir-results');
    if (!q) { results.style.display = 'none'; renderKasirTable(allObat); return; }
    const filtered = allObat.filter(o =>
      o.nama.toLowerCase().includes(q) || (o.kategori || '').toLowerCase().includes(q)
    );
    renderKasirTable(filtered);
    if (filtered.length > 0) {
      results.innerHTML = filtered.slice(0, 6).map(o => `
        <div class="product-result-item" onclick="addToCartById(${o.id}); document.getElementById('kasir-search').value=''; document.getElementById('kasir-results').style.display='none';">
          <div><div class="pname">${o.nama}</div><div class="pinfo">${o.kategori || ''} · Stok: ${o.stok}</div></div>
          <div class="pprice">${formatRp(o.harga_jual)}</div>
        </div>
      `).join('');
      results.style.display = 'block';
    } else {
      results.style.display = 'none';
    }
  });

  kasirSearch.addEventListener('blur', () => {
    setTimeout(() => { document.getElementById('kasir-results').style.display = 'none'; }, 200);
  });
}

function addToCart(id) {
  const obat = allObat.find(o => o.id === id);
  if (!obat) return;
  addToCartById(id);
}

function addToCartById(id) {
  const obat = allObat.find(o => o.id === id);
  if (!obat) return;
  if (obat.stok <= 0) { showToast(`Stok ${obat.nama} sudah habis`, 'error'); return; }

  const existing = cart.find(c => c.obat_id === id);
  if (existing) {
    if (existing.jumlah >= obat.stok) {
      showToast(`Stok ${obat.nama} tidak mencukupi`, 'warning'); return;
    }
    existing.jumlah++;
    existing.subtotal = existing.jumlah * existing.harga_satuan;
  } else {
    cart.push({ obat_id: id, nama: obat.nama, harga_satuan: obat.harga_jual, jumlah: 1, subtotal: obat.harga_jual, stok: obat.stok });
  }
  renderCart();
}

function removeFromCart(id) {
  cart = cart.filter(c => c.obat_id !== id);
  renderCart();
}

function updateQty(id, delta) {
  const item = cart.find(c => c.obat_id === id);
  if (!item) return;
  const newQty = item.jumlah + delta;
  if (newQty <= 0) { removeFromCart(id); return; }
  if (newQty > item.stok) { showToast('Melebihi stok tersedia', 'warning'); return; }
  item.jumlah = newQty;
  item.subtotal = newQty * item.harga_satuan;
  renderCart();
}

function clearCart() {
  if (cart.length === 0) return;
  cart = [];
  document.getElementById('bayar-input').value = '';
  renderCart();
}

function renderCart() {
  const container = document.getElementById('cart-items');
  const emptyEl = document.getElementById('cart-empty');

  if (cart.length === 0) {
    container.innerHTML = `
      <div class="cart-empty" id="cart-empty">
        <div class="icon">🛒</div>
        <p>Keranjang masih kosong</p>
        <small>Cari dan klik obat untuk menambahkan</small>
      </div>`;
    document.getElementById('cart-subtotal').textContent = formatRp(0);
    document.getElementById('cart-total').textContent = formatRp(0);
    document.getElementById('cart-kembalian').textContent = formatRp(0);
    return;
  }

  container.innerHTML = cart.map(item => `
    <div class="cart-item">
      <div class="cart-item-info">
        <div class="name">${item.nama}</div>
        <div class="price">${formatRp(item.harga_satuan)} / item</div>
      </div>
      <div class="cart-item-qty">
        <button class="qty-btn" onclick="updateQty(${item.obat_id}, -1)">−</button>
        <span class="qty-val">${item.jumlah}</span>
        <button class="qty-btn" onclick="updateQty(${item.obat_id}, 1)">+</button>
      </div>
      <div class="cart-item-subtotal">${formatRp(item.subtotal)}</div>
      <button class="cart-remove" onclick="removeFromCart(${item.obat_id})">🗑️</button>
    </div>
  `).join('');

  const total = cart.reduce((s, i) => s + i.subtotal, 0);
  document.getElementById('cart-subtotal').textContent = formatRp(total);
  document.getElementById('cart-total').textContent = formatRp(total);
  updateKembalian();
}

function updateKembalian() {
  const total = cart.reduce((s, i) => s + i.subtotal, 0);
  const bayar = parseFloat(document.getElementById('bayar-input').value) || 0;
  const kembalian = bayar - total;
  const el = document.getElementById('cart-kembalian');
  el.textContent = formatRp(Math.max(0, kembalian));
  el.style.color = kembalian < 0 ? '#dc2626' : '#16a34a';
}

async function prosesTransaksi() {
  if (cart.length === 0) { showToast('Keranjang belanja kosong', 'warning'); return; }
  const total = cart.reduce((s, i) => s + i.subtotal, 0);
  const bayar = parseFloat(document.getElementById('bayar-input').value) || 0;
  if (!bayar) { showToast('Masukkan nominal pembayaran', 'warning'); return; }
  if (bayar < total) { showToast('Pembayaran kurang dari total', 'error'); return; }

  const btn = document.getElementById('btn-bayar');
  btn.disabled = true;
  btn.textContent = '⏳ Memproses...';

  try {
    const res = await apiFetch('/transaksi', {
      method: 'POST',
      body: JSON.stringify({ items: cart.map(c => ({ obat_id: c.obat_id, jumlah: c.jumlah })), bayar, kasir: 'Admin' }),
    });
    const trx = res.data;
    showToast('Transaksi berhasil!', 'success');
    showStruk(trx);
    // Reset cart and reload obat stok
    cart = [];
    document.getElementById('bayar-input').value = '';
    renderCart();
    loadKasirObat();
  } catch (err) {
    showToast('Gagal: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '✅ Proses Transaksi';
  }
}

function showStruk(trx) {
  const body = document.getElementById('struk-body');
  const tanggal = new Date(trx.tanggal).toLocaleString('id-ID', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  body.innerHTML = `
    <div class="struk">
      <div class="struk-header">
        <h2>APOTEK PRO</h2>
        <p>Jl. Kesehatan No. 1, Jakarta</p>
        <p>Telp: 021-12345678</p>
      </div>
      <hr class="struk-divider" />
      <div class="struk-item"><span>No. Struk</span><span>#${trx.id}</span></div>
      <div class="struk-item"><span>Tanggal</span><span>${tanggal}</span></div>
      <div class="struk-item"><span>Kasir</span><span>${trx.kasir}</span></div>
      <hr class="struk-divider" />
      ${(trx.detail || []).map(d => `
        <div class="struk-item"><span>${d.obat_nama}</span><span></span></div>
        <div class="struk-item" style="padding-left:12px">
          <span>${d.jumlah} x ${formatRp(d.harga_satuan)}</span>
          <span>${formatRp(d.subtotal)}</span>
        </div>
      `).join('')}
      <div class="struk-total"><span>TOTAL</span><span>${formatRp(trx.total)}</span></div>
      <div class="struk-item" style="margin-top:6px"><span>Bayar</span><span>${formatRp(trx.bayar)}</span></div>
      <div class="struk-item" style="font-weight:700;color:#16a34a"><span>Kembalian</span><span>${formatRp(trx.kembalian)}</span></div>
      <hr class="struk-divider" />
      <div class="struk-footer"><p>Terima kasih telah berbelanja!</p><p>Semoga lekas sembuh 💊</p></div>
    </div>
  `;
  openModal('modal-struk');
}

function printStruk() {
  const content = document.getElementById('struk-body').innerHTML;
  const win = window.open('', '_blank', 'width=380,height=600');
  win.document.write(`<html><head><title>Struk</title><style>
    body{font-family:'Courier New',monospace;font-size:13px;padding:20px;max-width:320px}
    .struk-item{display:flex;justify-content:space-between;margin-bottom:4px}
    .struk-total{display:flex;justify-content:space-between;font-weight:700;font-size:16px;margin:8px 0;padding-top:8px;border-top:2px solid #000}
    hr{border:none;border-top:1px dashed #999;margin:10px 0}
    .struk-header{text-align:center;margin-bottom:12px}
    .struk-footer{text-align:center;margin-top:12px;color:#666}
  </style></head><body>${content}</body></html>`);
  win.document.close();
  win.print();
}

// ===== OBAT =====
async function loadObat() {
  try {
    const [obatRes, supplierRes] = await Promise.all([apiFetch('/obat'), apiFetch('/supplier')]);
    allObat = obatRes.data;
    allSupplier = supplierRes.data;
    populateSupplierDropdowns();
    populateKategoriFilter();
    renderObatTable(allObat);
  } catch (err) {
    showToast('Gagal memuat data: ' + err.message, 'error');
  }
}

function populateSupplierDropdowns() {
  const opts = `<option value="">-- Pilih Supplier --</option>` + allSupplier.map(s => `<option value="${s.id}">${s.nama}</option>`).join('');
  ['obat-supplier', 'pembelian-supplier'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = opts;
  });
}

function populateKategoriFilter() {
  const kategoris = [...new Set(allObat.map(o => o.kategori).filter(Boolean))].sort();
  const sel = document.getElementById('obat-kategori-filter');
  sel.innerHTML = `<option value="">Semua Kategori</option>` + kategoris.map(k => `<option value="${k}">${k}</option>`).join('');
}

function filterObat() {
  const q = document.getElementById('obat-search').value.toLowerCase();
  const kat = document.getElementById('obat-kategori-filter').value;
  const filtered = allObat.filter(o => {
    const matchQ = !q || o.nama.toLowerCase().includes(q) || (o.kategori || '').toLowerCase().includes(q);
    const matchKat = !kat || o.kategori === kat;
    return matchQ && matchKat;
  });
  renderObatTable(filtered);
}

function renderObatTable(data) {
  const tbody = document.getElementById('obat-tbody');
  if (data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10"><div class="empty-state"><div class="icon">💊</div><h3>Tidak ada obat</h3><p>Tambah obat baru atau ubah filter pencarian</p></div></td></tr>`;
    return;
  }
  const today = new Date().toISOString().split('T')[0];
  tbody.innerHTML = data.map((o, i) => {
    const isExpired = o.expired_date && o.expired_date < today;
    const nearExpiry = o.expired_date && !isExpired && o.expired_date <= new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0];
    return `
    <tr>
      <td>${i + 1}</td>
      <td><strong>${o.nama}</strong></td>
      <td>${o.kategori ? `<span class="badge badge-blue">${o.kategori}</span>` : '-'}</td>
      <td>${stokBadge(o.stok)}</td>
      <td>${formatRp(o.harga_beli)}</td>
      <td style="font-weight:600;color:#2563eb">${formatRp(o.harga_jual)}</td>
      <td><span class="badge badge-gray">${o.satuan}</span></td>
      <td>${o.expired_date ? `<span class="${isExpired ? 'stok-empty' : nearExpiry ? 'stok-low' : ''}">${formatDate(o.expired_date)}</span>` : '-'}</td>
      <td>${o.supplier_nama || '-'}</td>
      <td>
        <div style="display:flex;gap:4px">
          <button class="btn btn-outline btn-sm btn-icon" title="Edit" onclick="editObat(${o.id})">✏️</button>
          <button class="btn btn-danger btn-sm btn-icon" title="Hapus" onclick="deleteObat(${o.id}, '${o.nama}')">🗑️</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function openObatModal(id = null) {
  document.getElementById('modal-obat-title').textContent = id ? 'Edit Obat' : 'Tambah Obat';
  document.getElementById('obat-id').value = '';
  document.getElementById('obat-nama').value = '';
  document.getElementById('obat-kategori').value = '';
  document.getElementById('obat-stok').value = '';
  document.getElementById('obat-satuan').value = 'tablet';
  document.getElementById('obat-harga-beli').value = '';
  document.getElementById('obat-harga-jual').value = '';
  document.getElementById('obat-expired').value = '';
  document.getElementById('obat-supplier').value = '';
  openModal('modal-obat');
}

async function editObat(id) {
  try {
    const res = await apiFetch(`/obat/${id}`);
    const o = res.data;
    document.getElementById('modal-obat-title').textContent = 'Edit Obat';
    document.getElementById('obat-id').value = o.id;
    document.getElementById('obat-nama').value = o.nama;
    document.getElementById('obat-kategori').value = o.kategori || '';
    document.getElementById('obat-stok').value = o.stok;
    document.getElementById('obat-satuan').value = o.satuan;
    document.getElementById('obat-harga-beli').value = o.harga_beli;
    document.getElementById('obat-harga-jual').value = o.harga_jual;
    document.getElementById('obat-expired').value = o.expired_date || '';
    document.getElementById('obat-supplier').value = o.supplier_id || '';
    openModal('modal-obat');
  } catch (err) {
    showToast('Gagal memuat data obat: ' + err.message, 'error');
  }
}

async function saveObat() {
  const id = document.getElementById('obat-id').value;
  const nama = document.getElementById('obat-nama').value.trim();
  if (!nama) { showToast('Nama obat wajib diisi', 'warning'); return; }

  const payload = {
    nama,
    kategori: document.getElementById('obat-kategori').value.trim(),
    stok: parseInt(document.getElementById('obat-stok').value) || 0,
    satuan: document.getElementById('obat-satuan').value,
    harga_beli: parseFloat(document.getElementById('obat-harga-beli').value) || 0,
    harga_jual: parseFloat(document.getElementById('obat-harga-jual').value) || 0,
    expired_date: document.getElementById('obat-expired').value || null,
    supplier_id: document.getElementById('obat-supplier').value || null,
  };

  try {
    if (id) {
      await apiFetch(`/obat/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      showToast('Obat berhasil diperbarui', 'success');
    } else {
      await apiFetch('/obat', { method: 'POST', body: JSON.stringify(payload) });
      showToast('Obat berhasil ditambahkan', 'success');
    }
    closeModal('modal-obat');
    loadObat();
  } catch (err) {
    showToast('Gagal menyimpan: ' + err.message, 'error');
  }
}

function deleteObat(id, nama) {
  showConfirm('Hapus Obat', `Hapus "${nama}" dari data obat?`, async () => {
    try {
      await apiFetch(`/obat/${id}`, { method: 'DELETE' });
      showToast('Obat berhasil dihapus', 'success');
      loadObat();
    } catch (err) {
      showToast('Gagal menghapus: ' + err.message, 'error');
    }
  }, '🗑️');
}

// ===== SUPPLIER =====
async function loadSupplier() {
  try {
    const res = await apiFetch('/supplier');
    allSupplier = res.data;
    renderSupplierTable(allSupplier);
  } catch (err) {
    showToast('Gagal memuat supplier: ' + err.message, 'error');
  }
}

function filterSupplier() {
  const q = document.getElementById('supplier-search').value.toLowerCase();
  const filtered = allSupplier.filter(s => s.nama.toLowerCase().includes(q) || (s.email || '').toLowerCase().includes(q));
  renderSupplierTable(filtered);
}

function renderSupplierTable(data) {
  const tbody = document.getElementById('supplier-tbody');
  if (data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="icon">🏭</div><h3>Tidak ada supplier</h3></div></td></tr>`;
    return;
  }
  tbody.innerHTML = data.map((s, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><strong>${s.nama}</strong></td>
      <td>${s.telepon || '-'}</td>
      <td>${s.email ? `<a href="mailto:${s.email}" style="color:#2563eb">${s.email}</a>` : '-'}</td>
      <td style="max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${s.alamat || '-'}</td>
      <td>
        <div style="display:flex;gap:4px">
          <button class="btn btn-outline btn-sm btn-icon" onclick="editSupplier(${s.id})">✏️</button>
          <button class="btn btn-danger btn-sm btn-icon" onclick="deleteSupplier(${s.id}, '${s.nama}')">🗑️</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function openSupplierModal() {
  document.getElementById('modal-supplier-title').textContent = 'Tambah Supplier';
  document.getElementById('supplier-id').value = '';
  document.getElementById('supplier-nama').value = '';
  document.getElementById('supplier-telepon').value = '';
  document.getElementById('supplier-email').value = '';
  document.getElementById('supplier-alamat').value = '';
  openModal('modal-supplier');
}

async function editSupplier(id) {
  try {
    const res = await apiFetch(`/supplier/${id}`);
    const s = res.data;
    document.getElementById('modal-supplier-title').textContent = 'Edit Supplier';
    document.getElementById('supplier-id').value = s.id;
    document.getElementById('supplier-nama').value = s.nama;
    document.getElementById('supplier-telepon').value = s.telepon || '';
    document.getElementById('supplier-email').value = s.email || '';
    document.getElementById('supplier-alamat').value = s.alamat || '';
    openModal('modal-supplier');
  } catch (err) {
    showToast('Gagal memuat data: ' + err.message, 'error');
  }
}

async function saveSupplier() {
  const id = document.getElementById('supplier-id').value;
  const nama = document.getElementById('supplier-nama').value.trim();
  if (!nama) { showToast('Nama supplier wajib diisi', 'warning'); return; }

  const payload = {
    nama,
    telepon: document.getElementById('supplier-telepon').value.trim(),
    email: document.getElementById('supplier-email').value.trim(),
    alamat: document.getElementById('supplier-alamat').value.trim(),
  };

  try {
    if (id) {
      await apiFetch(`/supplier/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      showToast('Supplier berhasil diperbarui', 'success');
    } else {
      await apiFetch('/supplier', { method: 'POST', body: JSON.stringify(payload) });
      showToast('Supplier berhasil ditambahkan', 'success');
    }
    closeModal('modal-supplier');
    loadSupplier();
  } catch (err) {
    showToast('Gagal menyimpan: ' + err.message, 'error');
  }
}

function deleteSupplier(id, nama) {
  showConfirm('Hapus Supplier', `Hapus supplier "${nama}"?`, async () => {
    try {
      await apiFetch(`/supplier/${id}`, { method: 'DELETE' });
      showToast('Supplier berhasil dihapus', 'success');
      loadSupplier();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }, '🗑️');
}

// ===== PEMBELIAN =====
async function loadPembelian() {
  try {
    const [pembelianRes, supplierRes, obatRes] = await Promise.all([
      apiFetch('/pembelian'), apiFetch('/supplier'), apiFetch('/obat'),
    ]);
    allPembelian = pembelianRes.data;
    allSupplier = supplierRes.data;
    allObat = obatRes.data;
    populateSupplierDropdowns();
    renderPembelianTable(allPembelian);
  } catch (err) {
    showToast('Gagal memuat pembelian: ' + err.message, 'error');
  }
}

function renderPembelianTable(data) {
  const tbody = document.getElementById('pembelian-tbody');
  if (data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="icon">📦</div><h3>Belum ada pembelian</h3></div></td></tr>`;
    return;
  }
  tbody.innerHTML = data.map((p, i) => `
    <tr>
      <td><span class="badge badge-purple">#${p.id}</span></td>
      <td>${formatDateTime(p.tanggal)}</td>
      <td>${p.supplier_nama || '-'}</td>
      <td style="font-weight:600;color:#2563eb">${formatRp(p.total)}</td>
      <td>${p.keterangan || '-'}</td>
      <td>
        <button class="btn btn-outline btn-sm" onclick="showPembelianDetail(${p.id})">Lihat Detail</button>
      </td>
    </tr>
  `).join('');
}

function openPembelianModal() {
  document.getElementById('pembelian-supplier').value = '';
  document.getElementById('pembelian-keterangan').value = '';
  const itemsContainer = document.getElementById('pembelian-items');
  itemsContainer.innerHTML = `
    <div class="purchase-item-row purchase-item-header">
      <span>Obat</span><span>Jumlah</span><span>Harga Beli</span><span>Subtotal</span><span></span>
    </div>
  `;
  pembelianRowCount = 0;
  document.getElementById('pembelian-total-display').textContent = 'Rp 0';
  addPembelianRow();
  openModal('modal-pembelian');
}

function addPembelianRow() {
  pembelianRowCount++;
  const rowId = pembelianRowCount;
  const obatOptions = allObat.map(o => `<option value="${o.id}" data-harga="${o.harga_beli}">${o.nama}</option>`).join('');
  const row = document.createElement('div');
  row.className = 'purchase-item-row';
  row.id = `pembelian-row-${rowId}`;
  row.innerHTML = `
    <select class="form-control" id="pr-obat-${rowId}" onchange="onPembelianObatChange(${rowId})">
      <option value="">-- Pilih Obat --</option>
      ${obatOptions}
    </select>
    <input type="number" class="form-control" id="pr-jumlah-${rowId}" placeholder="0" min="1" value="1" oninput="updatePembelianSubtotal(${rowId})" />
    <input type="number" class="form-control" id="pr-harga-${rowId}" placeholder="0" min="0" oninput="updatePembelianSubtotal(${rowId})" />
    <input type="text" class="form-control" id="pr-subtotal-${rowId}" readonly value="Rp 0" style="background:#f8fafc;font-weight:600" />
    <button class="btn btn-danger btn-sm btn-icon" onclick="removePembelianRow(${rowId})">✕</button>
  `;
  document.getElementById('pembelian-items').appendChild(row);
}

function onPembelianObatChange(rowId) {
  const sel = document.getElementById(`pr-obat-${rowId}`);
  const opt = sel.selectedOptions[0];
  if (opt && opt.dataset.harga) {
    document.getElementById(`pr-harga-${rowId}`).value = opt.dataset.harga;
    updatePembelianSubtotal(rowId);
  }
}

function updatePembelianSubtotal(rowId) {
  const jumlah = parseFloat(document.getElementById(`pr-jumlah-${rowId}`).value) || 0;
  const harga = parseFloat(document.getElementById(`pr-harga-${rowId}`).value) || 0;
  const subtotal = jumlah * harga;
  document.getElementById(`pr-subtotal-${rowId}`).value = formatRp(subtotal);
  updatePembelianTotal();
}

function removePembelianRow(rowId) {
  const row = document.getElementById(`pembelian-row-${rowId}`);
  if (row) row.remove();
  updatePembelianTotal();
}

function updatePembelianTotal() {
  let total = 0;
  for (let i = 1; i <= pembelianRowCount; i++) {
    const jumlahEl = document.getElementById(`pr-jumlah-${i}`);
    const hargaEl = document.getElementById(`pr-harga-${i}`);
    if (jumlahEl && hargaEl) {
      total += (parseFloat(jumlahEl.value) || 0) * (parseFloat(hargaEl.value) || 0);
    }
  }
  document.getElementById('pembelian-total-display').textContent = formatRp(total);
}

async function savePembelian() {
  const supplier_id = document.getElementById('pembelian-supplier').value || null;
  const keterangan = document.getElementById('pembelian-keterangan').value.trim();

  const items = [];
  for (let i = 1; i <= pembelianRowCount; i++) {
    const obatEl = document.getElementById(`pr-obat-${i}`);
    const jumlahEl = document.getElementById(`pr-jumlah-${i}`);
    const hargaEl = document.getElementById(`pr-harga-${i}`);
    if (!obatEl) continue;
    const obat_id = parseInt(obatEl.value);
    const jumlah = parseInt(jumlahEl.value);
    const harga_beli = parseFloat(hargaEl.value) || 0;
    if (obat_id && jumlah > 0) items.push({ obat_id, jumlah, harga_beli });
  }

  if (items.length === 0) { showToast('Tambahkan minimal satu item pembelian', 'warning'); return; }

  try {
    await apiFetch('/pembelian', { method: 'POST', body: JSON.stringify({ supplier_id, items, keterangan }) });
    showToast('Pembelian berhasil disimpan, stok telah diperbarui', 'success');
    closeModal('modal-pembelian');
    loadPembelian();
  } catch (err) {
    showToast('Gagal menyimpan pembelian: ' + err.message, 'error');
  }
}

async function showPembelianDetail(id) {
  try {
    const res = await apiFetch(`/pembelian/${id}`);
    const p = res.data;
    const body = document.getElementById('pembelian-detail-body');
    body.innerHTML = `
      <div class="detail-grid" style="margin-bottom:20px">
        <div class="detail-item"><span class="label">No. Pembelian</span><span class="value">#${p.id}</span></div>
        <div class="detail-item"><span class="label">Tanggal</span><span class="value">${formatDateTime(p.tanggal)}</span></div>
        <div class="detail-item"><span class="label">Supplier</span><span class="value">${p.supplier_nama || '-'}</span></div>
        <div class="detail-item"><span class="label">Total</span><span class="value" style="color:#2563eb;font-weight:700">${formatRp(p.total)}</span></div>
        ${p.keterangan ? `<div class="detail-item" style="grid-column:span 2"><span class="label">Keterangan</span><span class="value">${p.keterangan}</span></div>` : ''}
      </div>
      <h4 style="font-size:14px;font-weight:600;margin-bottom:12px">Item Pembelian</h4>
      <div class="table-wrapper">
        <table>
          <thead>
            <tr><th>#</th><th>Nama Obat</th><th>Satuan</th><th>Jumlah</th><th>Harga Beli</th><th>Subtotal</th></tr>
          </thead>
          <tbody>
            ${(p.detail || []).map((d, i) => `
              <tr>
                <td>${i + 1}</td>
                <td>${d.obat_nama}</td>
                <td><span class="badge badge-gray">${d.satuan}</span></td>
                <td>${d.jumlah}</td>
                <td>${formatRp(d.harga_beli)}</td>
                <td style="font-weight:600">${formatRp(d.subtotal)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
    openModal('modal-pembelian-detail');
  } catch (err) {
    showToast('Gagal memuat detail: ' + err.message, 'error');
  }
}

// ===== LAPORAN =====
function onLaporanTipeChange() {
  const tipe = document.getElementById('laporan-tipe').value;
  document.getElementById('laporan-tanggal-group').style.display = tipe === 'harian' ? '' : 'none';
  document.getElementById('laporan-bulan-group').style.display = tipe === 'bulanan' ? '' : 'none';
  document.getElementById('laporan-tahun-group').style.display = tipe === 'bulanan' ? '' : 'none';
}

async function loadLaporan() {
  const tipe = document.getElementById('laporan-tipe').value;
  try {
    let res;
    if (tipe === 'harian') {
      const tanggal = document.getElementById('laporan-tanggal').value;
      if (!tanggal) { showToast('Pilih tanggal laporan', 'warning'); return; }
      res = await apiFetch(`/laporan/harian?tanggal=${tanggal}`);
      laporanData = res.data;
      renderLaporanHarian(laporanData);
    } else {
      const bulan = document.getElementById('laporan-bulan').value;
      const tahun = document.getElementById('laporan-tahun').value;
      res = await apiFetch(`/laporan/bulanan?bulan=${bulan}&tahun=${tahun}`);
      laporanData = res.data;
      renderLaporanBulanan(laporanData);
    }
  } catch (err) {
    showToast('Gagal memuat laporan: ' + err.message, 'error');
  }
}

function renderLaporanHarian(data) {
  const s = data.summary;
  document.getElementById('lap-total-penjualan').textContent = formatRp(s.total_penjualan);
  document.getElementById('lap-total-transaksi').textContent = s.total_transaksi;
  document.getElementById('lap-rata-rata').textContent = formatRp(s.rata_rata);
  document.getElementById('laporan-stats').style.display = 'grid';
  document.getElementById('laporan-chart-card').style.display = 'none';
  document.getElementById('laporan-table-card').style.display = '';
  renderTopObatTable(data.top_obat);
}

function renderLaporanBulanan(data) {
  const s = data.summary;
  document.getElementById('lap-total-penjualan').textContent = formatRp(s.total_penjualan);
  document.getElementById('lap-total-transaksi').textContent = s.total_transaksi;
  document.getElementById('lap-rata-rata').textContent = formatRp(s.rata_rata);
  document.getElementById('laporan-stats').style.display = 'grid';
  document.getElementById('laporan-chart-card').style.display = '';
  document.getElementById('laporan-table-card').style.display = '';

  // Chart
  const labels = data.per_hari.map(d => {
    const dt = new Date(d.tanggal);
    return dt.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
  });
  const values = data.per_hari.map(d => d.total_penjualan || 0);

  const ctx = document.getElementById('laporan-chart').getContext('2d');
  if (laporanChart) laporanChart.destroy();
  laporanChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Penjualan (Rp)',
        data: values,
        backgroundColor: 'rgba(37,99,235,0.7)',
        borderColor: '#2563eb',
        borderWidth: 1,
        borderRadius: 4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => formatRp(ctx.parsed.y),
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { callback: (v) => 'Rp ' + Number(v).toLocaleString('id-ID') },
          grid: { color: '#f1f5f9' },
        },
        x: { grid: { display: false } },
      },
    },
  });

  renderTopObatTable(data.top_obat);
}

function renderTopObatTable(data) {
  const tbody = document.getElementById('laporan-terlaris-tbody');
  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state" style="padding:30px"><div class="icon">📊</div><p>Tidak ada data penjualan</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = data.map((o, i) => `
    <tr>
      <td>${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</td>
      <td><strong>${o.nama}</strong></td>
      <td><span class="badge badge-gray">${o.satuan}</span></td>
      <td style="font-weight:600">${o.total_terjual}</td>
      <td style="font-weight:600;color:#2563eb">${formatRp(o.total_pendapatan)}</td>
    </tr>
  `).join('');
}

function exportCSV() {
  if (!laporanData) { showToast('Tampilkan laporan terlebih dahulu', 'warning'); return; }
  const tipe = document.getElementById('laporan-tipe').value;
  let csvContent = '';
  let filename = '';

  if (tipe === 'harian') {
    filename = `laporan_harian_${laporanData.tanggal}.csv`;
    csvContent = 'No,Tanggal,Total,Bayar,Kembalian,Kasir\n';
    csvContent += (laporanData.transaksi || []).map((t, i) =>
      `${i+1},"${formatDateTime(t.tanggal)}","${formatRp(t.total)}","${formatRp(t.bayar)}","${formatRp(t.kembalian)}","${t.kasir}"`
    ).join('\n');
  } else {
    filename = `laporan_bulanan_${laporanData.periode}.csv`;
    csvContent = 'Tanggal,Jumlah Transaksi,Total Penjualan\n';
    csvContent += (laporanData.per_hari || []).map(d =>
      `"${d.tanggal}","${d.jumlah_transaksi}","${formatRp(d.total_penjualan)}"`
    ).join('\n');
  }

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  showToast('File CSV berhasil diunduh', 'success');
}

// ===== KEYBOARD SHORTCUTS =====
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
  }
});

# 📖 PANDUAN PENGGUNA — Kastriva Smart Kasir

Selamat datang di Kastriva Smart Kasir! Dokumen ini adalah panduan lengkap untuk pemilik,
kasir, dan dapur. Panduan yang sama juga tersedia **di dalam aplikasi**: klik tombol **?**
di pojok kanan atas (di sebelah kiri ikon lonceng).

---

## 1. Mulai Cepat

1. **Masuk** dengan username & password admin (diatur lewat `ADMIN_USERNAME` dan
   `ADMIN_PASSWORD_HASH` di Vercel).
2. Buka **Pengaturan** → isi nama toko, pajak (%), dan service charge (%). Angka ini
   otomatis dipakai di POS, struk, dan halaman customer.
3. Tambahkan menu di halaman **Menu**, lalu tambahkan meja di halaman **Meja**.
4. Coba transaksi pertama di **POS**: pilih menu → Bayar Sekarang → struk muncul.
5. Semua data tersimpan di Google Sheets (sheet Orders, Menu, Tables, dll) — bisa dibuka
   langsung untuk pengecekan atau cadangan manual.

---

## 2. POS & Pembayaran (halaman utama kasir)

- Cari menu lewat kolom pencarian atau filter kategori. Klik menu untuk memasukkan ke
  keranjang; atur jumlah dengan tombol − / +.
- Pilih **meja** untuk dine-in, atau biarkan **Takeaway**. Isi diskon rupiah bila ada.
- Klik **Bayar Sekarang** → pilih metode:
  - **Tunai**: ketik uang yang diterima — kembalian dihitung otomatis. Tombol
    *Pas / 20rb / 50rb / 100rb* mempercepat input.
  - **QRIS / Debit / E-Wallet / Transfer**: dicatat senilai total tagihan.
- Setelah konfirmasi, **struk** muncul. Klik **Cetak Struk** — hanya petak struk yang
  tercetak, bukan seluruh halaman.
- **Tahan** = simpan keranjang sementara (misal pelanggan masih menambah pesanan).
  **Panggil (n)** = buka kembali daftar pesanan yang ditahan. Tersimpan di perangkat kasir.
- Stok menu otomatis berkurang tiap transaksi. Menu dengan stok 0 otomatis tidak bisa
  dipesan dan ditandai "Habis".

## 3. Pesanan (antrian omnichannel)

- Semua order dari POS, QR customer, dan WhatsApp masuk di sini.
- Filter per status (default: **Aktif**), cari berdasarkan ID / nama pelanggan / meja.
- Klik chevron **▾** di baris order untuk melihat rincian item.
- Ubah status lewat dropdown: `NEW → CONFIRMED → COOKING → READY → SERVED → PAID`
  (atau `CANCELLED`).
- Order yang belum lunas memiliki tombol **Bayar** — cocok untuk order QR yang dibayar
  langsung di kasir. Pembayaran tercatat lengkap dengan metode & kembalian.
- Daftar menyegarkan otomatis setiap 15 detik.

## 4. Dapur (Kitchen Display)

- Empat kolom alur: `NEW → CONFIRMED → COOKING → READY`, tombol satu-klik **Lanjut**.
- Angka merah = umur tiket 15 menit atau lebih (perlu diprioritaskan).
- Catatan per item dari pelanggan tampil di tiket.
- Menyegarkan otomatis setiap 12 detik.

## 5. Meja & QR Order

- **Meja**: tambah meja baru (kode + jumlah kursi). Status okupansi terisi **otomatis**
  dari pesanan aktif dan kembali kosong setelah order lunas/dibatalkan (atau klik
  **Kosongkan**).
- Tombol **QR** pada tiap meja menampilkan QR code — cetak dan tempel di meja. Tamu yang
  scan langsung membuka menu digital meja tersebut.
- Halaman **QR & Online** menyediakan QR + URL per meja untuk disalin/disebar.
- Order tamu masuk otomatis ke **Pesanan** dengan channel `QR`. Harga, pajak, dan service
  dihitung di server — tamu tidak bisa memanipulasinya.

## 6. Menu

- Tambah/edit menu: nama, kategori (pilih, atau ketik kategori baru), harga, modal, stok,
  emoji, deskripsi. **Kolom stok kosong = tidak dilacak.**
- Kolom **Margin** dihitung otomatis dari harga dan modal.
- Klik badge **AKTIF/OFF** untuk menampilkan/menyembunyikan menu di POS & halaman customer
  tanpa menghapusnya.
- **Hapus** permanen — dipakai untuk menu yang salah input.

## 7. Inventory (bahan baku)

- Daftar bahan: stok, satuan, par level, harga modal.
- Badge **RESTOCK** menyala saat stok ≤ par level; jumlahnya tampil sebagai
  "Stok kritis" di Dashboard.
- Cocok untuk memantau bahan pokok (beras, daging, susu, dst).

## 8. Reservasi, Pelanggan & Staff

- **Reservasi**: simpan booking (nama, telepon, jumlah orang, waktu, catatan).
  Status: `BOOKED → CONFIRMED → SEATED` atau `CANCELLED`.
- **Pelanggan**: tercatat otomatis dari setiap order yang menyertakan nomor telepon —
  jumlah kunjungan dan total belanja terakumulasi sendiri.
- **Staff**: tambah/edit/hapus langsung dari aplikasi (tombol **+ Staff**). Isi nama,
  role (Kasir/Manager/Kitchen/Waiter/dll), dan **PIN kasir 4–8 digit** — PIN tersimpan
  sebagai hash sehingga tidak bisa dilihat ulang; untuk mengganti, isi PIN baru saat edit.
  Klik badge **AKTIF/OFF** untuk menonaktifkan staff tanpa menghapusnya.

## 9. Laporan

- Pilih rentang: **Hari Ini / 7 Hari / 30 Hari**.
- Angka tersedia: order, gross sales, diskon, pajak, service, net sales, rata-rata check.
- **Payment mix** per metode (Tunai/QRIS/Debit/E-Wallet), **tren harian**, dan
  **menu terlaris**.
- Tombol **CSV** mengunduh rekap untuk Excel / Google Spreadsheet.

## 10. PWA & Mode Offline

- Klik kartu **Pasang** (atau menu browser → *Install app*) agar aplikasi terpasang di
  home screen dan terbuka layar penuh seperti aplikasi native.
- Saat internet putus: aplikasi tetap terbuka. Pesanan pelanggan yang dibuat saat offline
  masuk **antrean otomatis** dan terkirim begitu koneksi kembali.
- Menu digital pelanggan tetap tampil offline (cache otomatis).
- Setelah deploy versi baru, refresh halaman sekali untuk memuat versi terbaru.

## 11. Tips & Troubleshooting

| Gejala | Solusi |
| --- | --- |
| "Backend belum terhubung" | Periksa `GAS_WEB_APP_URL` & `GAS_API_KEY` di Vercel; pastikan Apps Script ter-deploy versi terbaru. |
| Setelah edit `gas/Code.gs` | Apps Script → Deploy → **Manage deployments** → Edit → **New version** → Deploy (URL tidak berubah). |
| Ganti password admin | `npm run auth:hash -- 'password-baru'` → perbarui `ADMIN_PASSWORD_HASH` di Vercel → redeploy. |
| Login gagal di HTTP lokal | Biarkan `AUTH_COOKIE_SECURE` kosong (mengikuti protokol). |
| Lupa password | Buat hash baru seperti di atas; mengganti `AUTH_SECRET` juga memaksa semua perangkat logout. |

**Cadangkan data**: seluruh data bisnis ada di Google Sheets — salin spreadsheet secara
berkala (File → Make a copy) sebagai backup.

---

*Kastriva Smart Kasir — Enterprise POS berbasis Next.js + Google Apps Script + Google Sheets.*

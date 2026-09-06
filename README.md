# Kastriva Smart Kasir — Enterprise POS + Google Apps Script Backend

Frontend: Next.js 15 (App Router) / Vercel
Backend: Google Apps Script Web App
Database: Google Sheets
PWA: aktif (service worker disajikan dari `/sw.js`)

> 📖 **Panduan pemakaian untuk pengguna akun (pembeli aplikasi):** lihat [`PANDUAN.md`](./PANDUAN.md)
> atau klik tombol **?** di pojok kanan atas aplikasi (di sebelah kiri ikon lonceng) — panduan yang
> sama tersedia langsung di dalam aplikasi.

## Arsitektur

```
Customer / Kasir  →  Next.js (Vercel)  →  /api/orders, /api/gas  →  Google Apps Script  →  Google Sheets
```

Browser tidak pernah memanggil Apps Script langsung, sehingga `GAS_WEB_APP_URL` dan `GAS_API_KEY` tidak
ikut ke client bundle.

### Pembagian akses

Halaman internal (`/` dan `/kasir`) dilindungi `middleware.ts`: tanpa session yang sah,
permintaan dialihkan ke `/login`. Rute publik (`/customer/**`, `/offline`, `/api/**`, aset)
tidak lewat middleware.

Session berupa cookie `kastriva_session` — token HMAC-SHA256 bertanda tangan, `HttpOnly`,
`SameSite=Lax`, dan `Secure` otomatis saat diakses lewat HTTPS. Middleware bersikap
fail-closed: bila `AUTH_SECRET` atau `ADMIN_PASSWORD_HASH` belum diisi, halaman internal
tidak terbuka melainkan mengarah ke `/login?setup=1` yang menjelaskan cara konfigurasinya.

Endpoint auth:

| Endpoint | Metode | Fungsi |
| --- | --- | --- |
| `/api/auth/login` | POST | verifikasi username + password, terbitkan cookie session |
| `/api/auth/logout` | POST | hapus cookie session |
| `/api/auth/session` | GET | status session untuk kebutuhan UI |

Password disimpan sebagai hash scrypt, bukan teks polos. Login dibatasi 10 percobaan
per IP setiap 15 menit, respons gagal ditahan minimal 400 ms, dan permintaan dengan
`Origin` lintas situs ditolak (403).

### Pembagian akses API

| Kelompok | Action | Kredensial |
| --- | --- | --- |
| Publik | `health`, `getMenu`, `getTables`, `getSettings`, `createOrder` | tidak perlu |
| Admin | `getOrders`, `getOrder`, `updateOrderStatus`, `payOrder`, `getCustomers`, `getInventory`, `getReservations`, `getStaff`, `getCategories`, `getReport`, `saveMenu`, `saveCategory`, `saveTable`, `saveInventory`, `saveReservation`, `saveCustomer`, `saveSettings`, `deleteData`, `deleteMenu`, `audit` | header `x-admin-token` / `Authorization: Bearer <ADMIN_API_TOKEN>` **atau** cookie session login |

UI admin memakai cookie session — `ADMIN_API_TOKEN` hanya untuk integrasi non-browser
(skor, dashboard pihak ketiga, skrip). Action di luar daftar ditolak 400 sebelum menyentuh
Apps Script.

Harga tidak pernah dipercaya dari client: `createOrder` hanya menerima `menuItemId` dan `qty`,
lalu Apps Script menghitung ulang subtotal, pajak, service, dan stok dari sheet. Diskon hanya
dihormati bila proxy server menandai payload `_admin` (request dari kasir yang sedang login);
pelanggan QR selalu diskon 0. Stok menu yang terlacak otomatis berkurang dan order dengan stok
kurang ditolak.

### Fitur kasir (halaman internal)

- **POS**: grid menu real-time dengan indikator stok, filter kategori, pencarian, diskon nominal,
  pilihan meja/takeaway, pesanan ditahan (hold/recall di localStorage).
- **Pembayaran**: Tunai (hitung kembalian + tombol nominal cepat), QRIS, Debit/Kartu, E-Wallet,
  Transfer — dicatat via action `payOrder`, status otomatis `PAID`.
- **Struk**: modal struk siap cetak (CSS `@media print`), data pembayaran & kembalian ikut.
- **Pesanan**: antrian omnichannel dengan filter status, pencarian, rincian item, ubah status,
  dan pembayaran lanjutan untuk order yang belum lunas.
- **Dapur (KDS)**: 4 kolom status, umur tiket, tiket >15 menit disorot merah, tombol lanjut status.
- **Meja**: status okupansi otomatis dari pesanan aktif, QR per meja, tambah/kosongkan meja.
- **Menu/Inventory/Reservasi**: CRUD langsung ke sheet via `saveMenu`, `saveCategory`,
  `saveInventory`, `saveReservation`, `deleteData` (whitelist sheet).
- **Laporan**: rekap hari ini/7/30 hari dari action `getReport` — net sales, pajak, service,
  payment mix, menu terlaris, tren harian, export CSV.
- **Pengaturan**: nama toko, pajak, service charge tersimpan ke sheet Stores via `saveSettings`.

## Menyiapkan login

```bash
# 1. Buat hash password (password tidak masuk shell history bila diketik dari stdin)
npm run auth:hash
# atau langsung:
npm run auth:hash -- 'password-anda'

# 2. Butuh AUTH_SECRET baru saja?
npm run auth:hash -- --secret
```

Salin `ADMIN_PASSWORD_HASH` dan `AUTH_SECRET` yang tercetak ke environment server
(`.env.local` untuk lokal, Environment Variables untuk Vercel), lalu restart/redeploy.
Username default `admin`, ubah lewat `ADMIN_USERNAME`.

## Setup Google Apps Script

1. Buat Google Spreadsheet baru, misalnya `Kastriva Smart Kasir DB`.
2. Buka **Extensions → Apps Script**.
3. Tempel isi `gas/Code.gs`, dan `gas/appsscript.json` sebagai manifest (aktifkan tampilan manifest di Project Settings).
4. **Project Settings → Script properties** → tambahkan `GAS_API_KEY` = secret acak panjang.
   Tanpa properti ini semua request ditolak (fail-closed), ini disengaja.
5. Jalankan fungsi `setupDatabase()` sekali dan izinkan akses.
6. **Deploy → New deployment → Web app**, Execute as **Me**, Who has access **Anyone**.
7. Salin URL `/exec`.

`setupDatabase()` aman dijalankan berulang: sheet yang sudah ada tidak dihapus, kolom yang kurang
ditambahkan di belakang.

## Environment variables (Vercel / `.env.local`)

```text
AUTH_SECRET=string-acak-minimal-32-karakter
ADMIN_PASSWORD_HASH=scrypt$16384$8$1$...$...
ADMIN_USERNAME=admin
SESSION_TTL_HOURS=8
GAS_WEB_APP_URL=https://script.google.com/macros/s/DEPLOYMENT_ID/exec
GAS_API_KEY=sama-dengan-script-property
ADMIN_API_TOKEN=token-acak-panjang
GAS_TIMEOUT_MS=15000
NEXT_PUBLIC_STORE_NAME=Kastriva Smart Kasir
NEXT_PUBLIC_STORE_ID=kastriva
NEXT_PUBLIC_CASHIER_WHATSAPP=628xxxxxxxxxx
NEXT_PUBLIC_CURRENCY=IDR
```

`AUTH_COOKIE_SECURE` opsional: kosongkan agar flag `Secure` mengikuti protokol permintaan
(berguna untuk instalasi lokal via HTTP), atau set `true` untuk mewajibkan HTTPS.

Semua nilai `NEXT_PUBLIC_*` ikut ke browser, jadi jangan menaruh secret di sana.
Contoh lengkap ada di `.env.example`. Setelah mengubah env, redeploy.

## Perintah

```bash
npm install
npm run dev        # http://localhost:3000
npm run typecheck  # tsc --noEmit
npm run lint       # eslint .
npm run test       # node --test tests/**/*.test.mjs
npm run build
npm run verify     # typecheck + lint + test + build
```

`npm run test` menjalankan tes Node bawaan: autentikasi (`tests/auth.test.mjs`), validasi input
route API (`tests/api-validation.test.mjs`), dan logika Apps Script lewat stub Google Sheets
(`tests/gas-backend.test.mjs`), jadi backend bisa diuji tanpa Google.
Butuh Node ≥ 22.18 (import `.ts` langsung tanpa build step).

## Sheet yang dibuat otomatis

Stores, Tables, Categories, Menu, Orders, OrderItems, Customers, Reservations, Inventory, Staff,
AuditLog, Settings.

## QR customer

```text
/customer/<storeId>/<tableCode>
/customer/kastriva/meja-01
```

Kedua segmen divalidasi dengan pola `^[a-z0-9][a-z0-9-]{0,31}$`; nilai lain menghasilkan 404.
QR digenerate lokal dengan paket `qrcode` (tidak ada URL toko yang dikirim ke layanan QR pihak ketiga)
dan tetap berfungsi offline. Halaman `/kasir` bisa membuat QR untuk kode meja apa pun.

Alur pelanggan: pilih menu → pesanan disimpan lewat `/api/orders` → WhatsApp kasir terbuka dengan
rincian pesanan. Isi keranjang disimpan di `localStorage` agar tidak hilang saat halaman dimuat ulang.

## Catatan operasional

- Rate limit pada route API dan login bersifat per instance proses (best effort), bukan pengganti WAF.
  Untuk beban tinggi gunakan rate limit terdistribusi (mis. Upstash/Vercel KV).
- PWA: installable (kartu instalasi otomatis), shell offline, dan menu publik ter-cache network-first.
  Order pelanggan yang dibuat saat offline masuk antrean localStorage dan terkirim otomatis ketika
  koneksi kembali.
- Login memakai satu akun admin dari environment variable. Untuk beberapa staf dengan peran
  berbeda (kasir, dapur, manajer), sheet `Staff` sudah punya kolom `role` dan `pinHash`
  sebagai dasar pengembangan berikutnya.
- Mengganti `AUTH_SECRET` otomatis membatalkan semua session yang sedang berjalan —
  pakai itu bila perlu memaksa semua perangkat logout.
- Google Apps Script + Sheets punya kuota harian. Cocok untuk restoran kecil/menengah;
  untuk multi-cabang dengan traffic besar gunakan database dedicated.

## Logo

`public/brand/logo.png` dan seluruh ikon PWA di `public/icons/`.

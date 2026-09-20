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
| `/api/auth/login` | POST | login Pemilik/Admin dengan username + password |
| `/api/auth/staff` | GET | daftar staff aktif yang memiliki PIN (tanpa hash PIN) |
| `/api/auth/staff` | POST | verifikasi staff + PIN dan terbitkan session role-based |
| `/api/auth/logout` | POST | hapus cookie session |
| `/api/auth/session` | GET | identitas session, role, staffId, storeId, dan masa berlaku |

Password disimpan sebagai hash scrypt, bukan teks polos. Login dibatasi 10 percobaan
per IP setiap 15 menit, respons gagal ditahan minimal 400 ms, dan permintaan dengan
`Origin` lintas situs ditolak (403).

### Pembagian akses API

Permission diperiksa **di server**, bukan hanya dengan menyembunyikan menu UI.

| Role | Akses utama |
| --- | --- |
| **Admin** | seluruh fitur, pengaturan, staff, refund, laporan, inventory |
| **Manager** | seluruh fitur operasional termasuk refund, staff, laporan, inventory |
| **Cashier/Kasir** | POS, pembayaran, pesanan, pelanggan, reservasi, shift |
| **Kitchen / Barista** | pesanan dapur (`CONFIRMED → COOKING → READY`) dan shift |
| **Waiter** | pesanan, meja, reservasi, pelanggan, shift; tidak dapat refund/pembayaran |
| **Staff** | pesanan dasar dan shift |

Action publik tetap terbatas pada `health`, `getMenu`, `getTables`, `getSettings`, dan `createOrder`.
Request publik yang mencoba menyamar sebagai channel POS dipaksa kembali menjadi channel `QR`.
`ADMIN_API_TOKEN` tetap tersedia untuk integrasi server-to-server dan selalu dianggap role Admin.

Harga tidak pernah dipercaya dari client: `createOrder` hanya menerima `menuItemId` dan `qty`,
lalu Apps Script menghitung ulang subtotal, pajak, service, dan stok dari sheet. Diskon hanya
dihormati bila proxy server menandai payload `_admin` (request dari kasir yang sedang login);
pelanggan QR selalu diskon 0. Stok menu yang terlacak otomatis berkurang dan order dengan stok
kurang ditolak. Setiap order dari UI membawa `clientOrderId` idempotent agar retry jaringan tidak
membuat transaksi ganda atau mengurangi stok dua kali.

### Fitur kasir (halaman internal)

- **POS**: grid menu real-time dengan indikator stok, filter kategori, pencarian, diskon nominal/% ,
  promo, voucher, member/loyalty point, pilihan meja/takeaway, dan pesanan ditahan (hold/recall di localStorage).
- **Pembayaran**: Tunai, QRIS, Debit/Kartu, E-Wallet, Transfer, serta **Split Payment** sampai 5 metode.
  Setiap alokasi disimpan sebagai baris tersendiri di sheet `Payments`, sehingga laporan payment mix dan
  rekonsiliasi shift tetap akurat. Pembayaran kedua untuk order yang sama ditolak backend.
- **Struk**: modal struk siap cetak, Browser Print fallback, dan direct ESC/POS untuk printer USB/serial atau BLE yang kompatibel.
- **Pesanan**: antrian omnichannel dengan filter status, pencarian, rincian item, state machine
  `NEW → CONFIRMED → COOKING → READY → SERVED`; `PAID` hanya lewat pembayaran. Cancel/void
  wajib alasan dan mengembalikan stok. Order PAID dapat di-refund penuh dengan alasan dan opsi restock.
- **Dapur (KDS)**: 4 kolom status, umur tiket, tiket >15 menit disorot merah, tombol lanjut status, serta kitchen ticket manual/otomatis ke printer yang dikonfigurasi.
- **Meja**: status okupansi otomatis dari pesanan aktif, QR per meja, tambah/kosongkan meja.
- **Menu/Inventory/Reservasi**: CRUD master data langsung ke backend. Menu mendukung **barcode/SKU unik** dan pengisian lewat kamera. **Inventory Pro** menambahkan Stock Movement Ledger, supplier, purchase/restock, stock opname, waste/adjustment, dan Recipe/BOM yang mengurangi bahan otomatis saat penjualan.
- **Laporan**: rekap hari ini/7/30 hari dari action `getReport` — penjualan hanya dari transaksi
  `PAID`, outstanding dipisahkan, refund dilaporkan terpisah, plus pajak, service, **COGS, Gross Profit, Gross Margin**, payment mix, menu terlaris, tren harian, dan export CSV.
- **Pengaturan**: nama toko, pajak, service charge tersimpan ke sheet Stores via `saveSettings`.


## Transaction Safety — Stage 1

Versi ini sudah menerapkan pengamanan transaksi berikut:

- autentikasi action admin selalu di-`await` sebelum request diteruskan ke Apps Script;
- session browser admin dapat dipakai tanpa harus mengekspos `ADMIN_API_TOKEN` ke client;
- state machine mencegah loncat/mundur status dan mencegah `PAID` lewat dropdown;
- double payment ditolak;
- `clientOrderId` membuat create-order idempotent saat retry/offline queue;
- `CANCELLED` wajib alasan dan mengembalikan stok tepat satu kali;
- `REFUNDED` hanya dari order `PAID`, wajib alasan, dengan opsi mengembalikan stok;
- laporan penjualan hanya menghitung order `PAID`; order aktif masuk `outstandingSales`, refund
  masuk `refundedSales`;
- schema Orders akan menambahkan kolom Stage 1 secara aman saat mutasi order pertama, namun
  setelah mengganti `gas/Code.gs` tetap disarankan menjalankan `setupDatabase()` sekali.


## Staff & Shift — Stage 2

Stage 2 menambahkan identitas operator dan rekonsiliasi kas yang benar-benar terhubung ke transaksi:

- login **Staff / Kasir** terpisah dari login Pemilik/Admin;
- daftar login hanya menampilkan staff aktif yang sudah memiliki PIN;
- PIN diverifikasi di backend dan hash PIN tidak pernah dikirim ke browser;
- session menyimpan `staffId`, nama, role, dan `storeId`;
- permission API diperiksa berdasarkan role, jadi pembatasan tetap berlaku walaupun request dibuat lewat DevTools;
- halaman **Shift** untuk buka/tutup shift dengan `registerId` dan modal awal;
- satu staff hanya boleh memiliki satu shift `OPEN` pada satu waktu;
- transaksi POS dan pembayaran oleh staff membutuhkan shift aktif;
- order menyimpan `staffId`, `staffName`, `shiftId`, dan `registerId`;
- penutupan shift menghitung `expectedCash = openingCash + cashSales - cashRefunds`;
- uang fisik (`closingCash`) dibandingkan dengan expected cash dan disimpan sebagai `difference`;
- audit log transaksi dan shift memakai identitas staff sebenarnya;
- role Kitchen/Barista tidak dapat refund/bayar, role Waiter tidak dapat refund/bayar, dan Refund hanya Manager/Admin.

Setelah mengganti `gas/Code.gs`, jalankan `setupDatabase()` sekali. Fungsi ini akan membuat sheet
`Shifts` dan menambahkan kolom Stage 2 ke `Orders` tanpa menghapus data lama.

## Inventory Pro — Stage 3

Stage 3 menambahkan inventory yang dapat diaudit dan terhubung langsung ke transaksi:

- **Stock Movement Ledger** append-only untuk `INITIAL`, `PURCHASE`, `SALE`, `RETURN`, `OPNAME`, `WASTE`, dan `ADJUSTMENT`;
- **Supplier** sebagai master pemasok;
- **Purchase** memakai alur `DRAFT → RECEIVED` atau `DRAFT → CANCELLED`; DRAFT belum mengubah stok;
- saat purchase diterima, stok bertambah dan `cost` bahan dihitung ulang dengan **weighted-average cost**;
- **Stock Opname** menetapkan stok fisik, **Waste** mengurangi stok dengan alasan, dan **Adjustment** menerima koreksi +/-;
- **Recipe/BOM** menghubungkan menu ke satu atau lebih bahan beserta qty per porsi;
- order otomatis mengecek kecukupan stok bahan sebelum ditulis, lalu mengurangi bahan berdasarkan BOM;
- cancel atau refund dengan restock mengembalikan bahan berdasarkan movement SALE asli sehingga tetap benar walau resep kemudian berubah;
- `OrderItems.cost` menyimpan **cost snapshot** pada saat order dibuat; laporan memakai snapshot ini untuk COGS historis;
- laporan menampilkan **COGS, Gross Profit, dan Gross Margin**;
- perubahan average cost bahan otomatis menghitung ulang `Menu.cost` untuk menu yang memakai bahan tersebut.

Setelah upgrade, jalankan `setupDatabase()` sekali. Stage 3 menambahkan sheet `Suppliers`, `Purchases`,
`PurchaseItems`, `Recipes`, `StockMovements` dan kolom `cost` pada `OrderItems` tanpa menghapus data lama.

## Hardware POS — Stage 4

Stage 4 menambahkan integrasi perangkat kasir tanpa memindahkan credential backend ke browser:

- field **barcode/SKU** pada Menu, dinormalisasi dan divalidasi unik per store di Apps Script;
- scanner USB/Bluetooth yang bekerja sebagai **keyboard-wedge** dapat menambahkan item langsung ke keranjang;
- scanner kamera HP menggunakan `BarcodeDetector` bila browser mendukung, dengan fallback scanner USB/manual;
- halaman **Perangkat** menyimpan konfigurasi printer/scanner **lokal per perangkat** (`localStorage`), sehingga PC kasir dan layar dapur dapat memiliki konfigurasi berbeda;
- direct printing ESC/POS melalui **Web Serial** untuk printer USB/serial yang didukung browser;
- direct printing melalui **Web Bluetooth Low Energy (GATT)** untuk printer BLE dengan service/characteristic UUID yang sesuai;
- **Browser Print** tetap tersedia sebagai fallback universal;
- receipt printer mendukung lebar 58/80 mm, auto-cut jika printer mendukung, dan auto-print setelah pembayaran;
- kitchen printer dapat terpisah atau memakai printer struk yang sama; QR order dapat auto-print sekali saat KDS sedang aktif;
- cash drawer dapat dibuka otomatis pada pembayaran tunai melalui perintah pulse ESC/POS ke port drawer pada printer;
- ID kitchen ticket yang sudah dicetak disimpan lokal agar polling KDS tidak mencetak order yang sama berulang.

Catatan kompatibilitas: Web Serial/Web Bluetooth/kamera memerlukan **HTTPS** (localhost juga dianggap secure context).
Banyak printer Bluetooth murah memakai **Bluetooth Classic/SPP**, yang tidak dapat diakses langsung oleh Web Bluetooth;
untuk perangkat tersebut gunakan driver OS + Browser Print, atau gunakan jalur serial/COM jika printer terekspos sebagai serial.
Koneksi langsung printer biasanya perlu dihubungkan kembali setelah browser/perangkat direstart, walaupun konfigurasinya tetap tersimpan.

Setelah mengganti `gas/Code.gs`, jalankan `setupDatabase()` sekali agar kolom `barcode` ditambahkan ke sheet `Menu` tanpa menghapus data lama.


### Promo, Voucher, Membership & Split Bill (Stage 5)

- Promo dan voucher dihitung ulang di Apps Script; nilai total dari browser tidak dipercaya. Promo mendukung
  persen/nominal, minimum belanja, batas diskon, periode aktif, dan status aktif/nonaktif.
- Voucher mempunyai kode unik per store, periode berlaku, minimum belanja, maksimum diskon, serta usage limit.
  Kuota voucher dikonsumsi saat order dibuat dan dilepas kembali bila order dibatalkan sebelum pembayaran.
- Customer dengan nomor telepon dapat menjadi member otomatis. Loyalty dapat dikonfigurasi dari menu
  **Promo & Loyalty**: nominal belanja per poin, nilai rupiah per poin, dan maksimum persen tagihan yang dapat diredeem.
- Redeem poin direservasi saat order dibuat, poin baru diberikan hanya setelah order `PAID`, dan refund membalik
  poin hasil transaksi sekaligus mengembalikan poin yang diredeem. Semua mutasi masuk `LoyaltyTransactions`.
- **Split Bill** memindahkan sebagian item/qty ke order baru tanpa mengurangi stok kedua kali. Untuk menjaga
  pembagian diskon tetap deterministik, split bill dilakukan **sebelum** promo/voucher/diskon/redeem poin diterapkan.
- Snapshot `OrderIngredientUsage` ikut dipisah per item, sehingga cancel/refund setelah split mengembalikan bahan
  persis sesuai porsi masing-masing bill walaupun resep berubah setelah transaksi.


## Multi Outlet, Owner Dashboard & SaaS — Stage 6

Stage 6 mengubah instalasi POS menjadi fondasi SaaS multi-outlet yang tetap memakai Google Sheets sebagai cloud source of truth:

- **isolasi outlet server-side**: session staff/manager selalu dipaksa ke `storeId` miliknya; mengubah payload lewat DevTools tidak membuka data outlet lain;
- Owner/Admin dapat memilih outlet aktif dari header dan melihat **Owner Dashboard** agregat lintas outlet;
- laporan Stage 1–5 sekarang selalu difilter `storeId`, menutup bug lama yang dapat mencampur omzet antar-outlet;
- menu publik, setting, tabel, QR ordering, inventory, staff, promo, voucher, shift, laporan, dan transaksi mengikuti outlet aktif;
- **Advanced Analytics** per outlet: paid orders, unique/repeat customer, repeat rate, penjualan per jam, hari, channel, staff, dan kategori;
- **Cloud Sync Status** menampilkan waktu server, perubahan terakhir, dan jumlah data utama; Google Sheets tetap menjadi source of truth cloud antar-perangkat;
- **Backup JSON** per outlet dapat diunduh oleh Owner/Admin, lengkap dengan checksum SHA-256; backup memuat data master/transaksi outlet dan child rows terkait;
- **14-day trial** dibuat otomatis per instalasi ketika `setupDatabase()` pertama kali menyiapkan sheet Subscription;
- setelah trial berakhir, operasi tulis/transaksi diblokir sampai lisensi aktif, sementara data tetap dapat dibaca dan backup/lisensi masih dapat diakses;
- paket lisensi `STARTER`, `PRO`, dan `BUSINESS` membawa masa aktif + batas outlet;
- kode lisensi `KSP1` ditandatangani HMAC-SHA256 di server dan **terikat ke Installation ID**, sehingga tidak dapat dipakai di instalasi lain;
- `LICENSE_SIGNING_SECRET` hanya boleh berada di server/mesin penerbit lisensi, tidak pernah memakai prefix `NEXT_PUBLIC_`.

Stage 6 menambahkan sheet `Subscriptions`; total schema menjadi **24 sheet**. Upgrade tetap kompatibel dengan data lama karena `setupDatabase()` hanya menambahkan sheet/kolom yang belum ada.

### Membuat kode lisensi

1. Pelanggan membuka **Owner & SaaS** lalu mengirimkan `Installation ID`.
2. Di mesin penerbit lisensi, set `LICENSE_SIGNING_SECRET` yang sama dengan environment Vercel instalasi tersebut.
3. Buat kode, misalnya paket PRO 365 hari, maksimum 5 outlet:

```powershell
$env:LICENSE_SIGNING_SECRET="secret-acak-minimal-32-karakter"
npm run license:make -- PRO 365 5 CUSTOMER-001 INST-XXXXXXXXXXXXXX
```

4. Salin output `KSP1....` ke pelanggan. Pelanggan memasukkannya pada **Owner & SaaS → Subscription → Aktifkan Lisensi**.

> `LICENSE_SIGNING_SECRET` adalah secret penerbit lisensi. Jangan taruh di source code, Google Sheet, browser, atau variable `NEXT_PUBLIC_*`.

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
LICENSE_SIGNING_SECRET=secret-lisensi-acak-minimal-32-karakter
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
(`tests/gas-backend.test.mjs`), hardware (`tests/hardware.test.mjs`), dan lisensi (`tests/license.test.mjs`), jadi backend dapat diuji tanpa Google.
Test script mengaktifkan `--experimental-strip-types`; Node ≥ 22.18 tetap direkomendasikan untuk environment development/production sesuai `package.json`.

## Sheet yang dibuat otomatis

Stores, Tables, Categories, Menu, Orders, OrderItems, **OrderIngredientUsage**, Customers, Reservations, Inventory,
**Suppliers, Purchases, PurchaseItems, Recipes, StockMovements, Promotions, Vouchers, Payments, LoyaltyTransactions**,
Staff, **Shifts**, AuditLog, **Subscriptions**, Settings. Total **24 sheet**.

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
- Login mendukung akun Pemilik/Admin dari environment variable **dan** login Staff menggunakan PIN.
  Staff wajib membuka shift sebelum melakukan transaksi POS/pembayaran; Admin dapat melakukan operasi darurat tanpa shift.
- Mengganti `AUTH_SECRET` otomatis membatalkan semua session yang sedang berjalan —
  pakai itu bila perlu memaksa semua perangkat logout.
- Google Apps Script + Sheets punya kuota harian. Cocok untuk restoran kecil/menengah;
  untuk multi-cabang dengan traffic besar gunakan database dedicated.

## Logo

`public/brand/logo.png` dan seluruh ikon PWA di `public/icons/`.

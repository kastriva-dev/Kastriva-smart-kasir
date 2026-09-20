# Kastriva POS Pro — Stage 6 Changelog

Version: **2.5.0**

## Multi Outlet
- Isolasi `storeId` diterapkan di backend untuk order, menu, table, settings, inventory, supplier, purchase, recipe, promo/voucher, loyalty, customer, reservation, staff, shift, report, dan mutasi data.
- Staff/Manager tidak dapat mengganti `storeId` lewat payload untuk membaca outlet lain.
- Owner/Admin dapat membuat outlet hingga batas paket dan mengganti outlet aktif melalui session yang ditandatangani ulang.
- QR/menu publik menggunakan `storeId` yang benar.
- Memperbaiki bug laporan lama yang dapat mencampur transaksi beberapa outlet.

## Owner Dashboard & Analytics
- Owner Dashboard 30 hari mengagregasi Net Sales, COGS, Gross Profit, margin, order, outstanding, refund, dan low stock seluruh outlet.
- Advanced Analytics 7/30/90 hari: paid orders, unique/repeat customer, repeat rate, hourly sales, weekday sales, channel, staff, dan category revenue.

## Cloud Sync & Backup
- Google Sheets dinyatakan sebagai cloud source of truth untuk instalasi.
- Endpoint Sync State menampilkan server time, last change, dan count data utama outlet.
- Export backup JSON per outlet dengan checksum SHA-256 serta child records OrderItems, OrderIngredientUsage, dan PurchaseItems.
- Backup hanya Owner/Admin dan tidak menyediakan restore otomatis untuk menghindari overwrite transaksi aktif.

## Trial, Subscription & License
- Sheet baru `Subscriptions`; total schema 24 sheet.
- Trial 14 hari dibuat otomatis per instalasi.
- Setelah expired, operasi tulis/transaksi digate; read/backup/license activation tetap tersedia.
- Plan STARTER / PRO / BUSINESS membawa masa aktif dan `maxOutlets`.
- Kode lisensi KSP1 menggunakan HMAC-SHA256 dan diverifikasi hanya di server.
- Lisensi terikat ke `Installation ID` unik instalasi sehingga kode tidak dapat dipindahkan begitu saja.
- Script `npm run license:make -- <PLAN> <DAYS> <MAX_OUTLETS> <LICENSE_ID> <INSTALLATION_ID>` ditambahkan.

## UI / PWA
- Menu baru **Owner & SaaS** dan **Analytics**.
- Dropdown pemilih outlet di header Owner/Admin.
- Panduan dalam aplikasi diperbarui.
- Service worker cache version dinaikkan ke `kastriva-v6`.
- `Permissions-Policy` diperbaiki menjadi `camera=(self)` agar scanner kamera Stage 4 dapat digunakan pada origin aplikasi.

## Keamanan & Kompatibilitas
- Secret lisensi harus berada di `LICENSE_SIGNING_SECRET`, tanpa prefix `NEXT_PUBLIC_`.
- Upgrade bersifat additive: `setupDatabase()` menambah sheet/kolom yang kurang tanpa menghapus data lama.
- Package version dinaikkan ke 2.5.0.

## Validasi
- `npm test`: **102/102 PASS**.
- GAS `Code.gs`: syntax check PASS.
- 43 file TypeScript/TSX: 0 syntax diagnostics melalui TypeScript transpile check.
- Full `npm run typecheck` / `npm run build` tetap perlu dijalankan pada Node >=22.18 dengan dependencies terpasang.

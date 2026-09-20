# Kastriva POS Pro — Stage 4 Changelog

## Barcode & SKU

- Menambahkan kolom `barcode` pada sheet `Menu` secara backward-compatible.
- Barcode dinormalisasi (trim whitespace + uppercase) dan wajib unik per store bila diisi.
- Menu Manager menampilkan barcode dan mendukung pengisian manual, scanner keyboard, atau scan kamera.
- POS dapat mencari produk berdasarkan nama atau barcode.
- Scanner USB/Bluetooth keyboard-wedge dapat menambahkan item langsung ke keranjang saat mengirim Enter.
- Camera scanner memakai `BarcodeDetector` bila tersedia di browser.

## Receipt Printer & ESC/POS

- Menambahkan halaman **Perangkat** untuk konfigurasi lokal per PC/HP.
- Transport printer: Browser Print, Web Serial (USB/serial), dan Web Bluetooth Low Energy.
- Dukungan kertas 58 mm / 80 mm.
- Formatter receipt thermal dengan item, total, metode bayar, kasir, register, uang diterima, dan kembalian.
- Perintah ESC/POS initialize, feed, cut, dan cash-drawer pulse.
- Auto-print struk setelah pembayaran dapat diaktifkan per perangkat.
- Tombol Cetak Struk mencoba printer thermal direct dan otomatis fallback ke Browser Print bila profile menggunakan Browser Print.

## Kitchen Printer

- Formatter kitchen ticket tanpa nominal pembayaran.
- Kitchen printer dapat terpisah atau menggunakan Receipt Printer yang sama.
- POS dapat auto-print kitchen ticket setelah order dibuat.
- KDS dapat auto-print order QR/omnichannel yang belum pernah dicetak selama halaman Dapur aktif.
- ID tiket yang berhasil dicetak disimpan lokal (maks. 500 ID) untuk mencegah duplikasi akibat polling.
- Tombol cetak manual tersedia pada setiap ticket KDS.

## Cash Drawer

- Test Cash Drawer tersedia pada halaman Perangkat.
- Opsi membuka drawer otomatis khusus pembayaran CASH.
- Drawer dipulse melalui receipt printer ESC/POS; tidak membutuhkan endpoint backend baru.

## Kompatibilitas & Keamanan

- Setting hardware tidak dikirim ke GAS dan tidak disimpan di Google Sheets; setting berada di `localStorage` perangkat.
- Credential backend tetap server-side.
- Web Serial/Web Bluetooth/camera membutuhkan secure context (HTTPS/localhost).
- Bluetooth Classic/SPP tidak dijanjikan kompatibel Web Bluetooth; gunakan serial/COM atau Browser Print + driver OS bila perlu.
- Kegagalan printer setelah transaksi berhasil tidak membatalkan pembayaran/order yang sudah tersimpan.

## Validasi

- Test suite backend/API/hardware: **80/80 PASS**.
- Syntax-transpile: **38 file TypeScript/TSX, 0 error sintaks**.
- Full `npm install`/typecheck/build tidak dapat diselesaikan di sandbox karena instalasi dependency timeout; jalankan `npm install && npm run verify` pada Node >=22.18 sebelum production deploy.

## Upgrade dari Stage 3

1. Backup Spreadsheet.
2. Ganti `gas/Code.gs` dengan versi Stage 4.
3. Jalankan `setupDatabase()` satu kali untuk menambahkan kolom `barcode` ke sheet Menu.
4. Apps Script → Deploy → Manage deployments → Edit → New version → Deploy.
5. Jalankan `npm install`, `npm test`, dan `npm run build` pada Node >=22.18.
6. Push ke GitHub dan deploy Vercel.
7. Isi barcode produk di Menu.
8. Pada setiap perangkat kasir/dapur, buka menu **Perangkat**, pilih transport printer, Simpan, Hubungkan, lalu Test.

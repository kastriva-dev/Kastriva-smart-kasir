# Kastriva POS Pro — Stage 2 Changelog

## Staff Login & Role-Based Access

- Menambahkan login operasional **Staff / Kasir** menggunakan `staffId + PIN`.
- Session sekarang membawa `staffId`, nama, role, dan `storeId`.
- PIN staff tidak pernah dikirim kembali ke browser; daftar login hanya menampilkan staff aktif yang memiliki PIN.
- Hak akses diperiksa **server-side** pada `/api/gas` dan `/api/orders`, bukan hanya melalui menu UI.
- Role yang didukung: `admin`, `manager`, `cashier`, `kitchen`, `waiter`, `barista`, dan `staff`.
- Transisi status order juga dibatasi berdasarkan role.

## Shift & Cash Reconciliation

- Menambahkan sheet baru `Shifts` melalui `setupDatabase()`.
- Menambahkan halaman **Shift** untuk buka/tutup shift.
- Satu staff hanya dapat memiliki satu shift `OPEN` pada satu waktu.
- Staff non-Admin wajib memiliki shift aktif sebelum membuat order POS atau menerima pembayaran.
- Shift mencatat `registerId`, modal awal, waktu buka/tutup, penjualan tunai, refund tunai, expected cash, closing cash, dan selisih.
- Rumus rekonsiliasi: `Expected Cash = Opening Cash + Cash Sales - Cash Refunds`.

## Audit Operator

Kolom berikut ditambahkan ke `Orders` tanpa menghapus data lama:

- `staffId`
- `staffName`
- `shiftId`
- `registerId`

Order dan pembayaran POS sekarang menempel pada operator/shift yang benar. Audit log juga memakai identitas staff ketika tersedia.

## UI

- Halaman Login memiliki tab **Staff / Kasir** dan **Pemilik / Admin**.
- Navigasi dashboard otomatis berubah sesuai role.
- Tombol pembayaran, refund, cancel, dan transisi dapur disesuaikan dengan izin role.
- Memperbaiki indikator PIN staff menggunakan `hasPin` tanpa mengekspos `pinHash`.
- Menambahkan panduan Staff Login & Shift pada aplikasi dan `PANDUAN.md`.

## Validasi

- Seluruh test project: **67/67 PASS**.
- Test GAS Stage 2 mencakup login PIN, kewajiban shift, linkage operator pada transaksi, tutup shift, serta rekonsiliasi refund tunai.
- Pemeriksaan sintaks TypeScript/TSX dilakukan pada source project.

## Upgrade dari Stage 1

1. Backup Google Spreadsheet terlebih dahulu.
2. Ganti `gas/Code.gs` dengan versi Stage 2.
3. Jalankan `setupDatabase()` satu kali untuk membuat sheet `Shifts` dan menambahkan kolom baru pada `Orders`.
4. Deploy **New version** Apps Script; URL Web App dapat tetap sama.
5. Deploy frontend Stage 2 ke Vercel.
6. Login sebagai Admin, buat/edit staff dan isi PIN 4–8 digit.
7. Logout, login sebagai Staff/Kasir, lalu buka Shift sebelum transaksi.

Stage 2 dirancang kompatibel dengan data Stage 1 dan tidak menghapus sheet/kolom lama.

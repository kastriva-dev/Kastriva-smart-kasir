# Kastriva POS Pro — Stage 3 Changelog

## Inventory Pro

- Menambahkan sheet baru: `Suppliers`, `Purchases`, `PurchaseItems`, `Recipes`, dan `StockMovements`.
- Menambahkan kolom `cost` pada `OrderItems` sebagai cost snapshot per unit.
- Stock Movement Ledger mencatat INITIAL, PURCHASE, SALE, RETURN, OPNAME, WASTE, dan ADJUSTMENT.
- Inventory sekarang memiliki tindakan khusus untuk Stock Opname, Waste/Rusak, dan Adjustment +/- dengan alasan wajib.
- Bahan yang masih dipakai Recipe/BOM tidak dapat dihapus sebelum dilepas dari resep.

## Supplier & Purchase

- CRUD supplier dengan status aktif/nonaktif.
- Purchase dibuat sebagai `DRAFT` sehingga belum menyentuh stok.
- `RECEIVED` menambah stok, membuat movement PURCHASE, dan menghitung weighted-average cost bahan.
- Purchase DRAFT dapat dibatalkan menjadi `CANCELLED`; purchase yang sudah RECEIVED tidak dapat diterima/cancel ulang.
- Average cost bahan yang berubah otomatis menghitung ulang modal menu yang terkait Recipe/BOM.

## Recipe / BOM

- Satu menu dapat memiliki banyak bahan dengan qty per porsi.
- Backend mengecek stok seluruh bahan sebelum order ditulis.
- Order mengurangi stok bahan otomatis dan mencatat movement SALE.
- Cancel/refund dengan restock memakai movement SALE asli untuk mengembalikan qty bahan yang tepat walaupun Recipe/BOM kemudian berubah.
- Jika menu belum memiliki BOM, COGS tetap memakai `Menu.cost` manual sebagai fallback.

## COGS & Profit

- `OrderItems.cost` menyimpan biaya per unit saat order dibuat.
- Laporan hanya memakai cost snapshot transaksi PAID untuk menghitung COGS.
- Menambahkan `COGS`, `Gross Profit`, dan `Gross Margin` pada dashboard/laporan dan export CSV.

## UI

Menu Inventory diganti menjadi **Inventory Pro** dengan lima tab:

1. Bahan
2. Pergerakan
3. Supplier
4. Pembelian
5. Resep

Panduan aplikasi, `PANDUAN.md`, dan `README.md` diperbarui mengikuti alur baru.

## Validasi

- Test suite backend/API: **76/76 PASS**.
- Source TypeScript/TSX diperiksa secara syntax-transpile pada 35 file tanpa error sintaks.
- Full `npm ci`/Next build tidak dapat diselesaikan di sandbox karena instalasi dependency mengalami timeout; jalankan `npm install && npm run verify` menggunakan Node >=22.18 sebelum production deploy.

## Upgrade dari Stage 2

1. Backup Spreadsheet.
2. Ganti `gas/Code.gs` dengan versi Stage 3.
3. Jalankan `setupDatabase()` satu kali.
4. Deploy **New version** Apps Script.
5. Deploy frontend Stage 3 ke Vercel.
6. Masuk sebagai Admin/Manager → Inventory → buat bahan & supplier → buat Recipe/BOM.
7. Gunakan Purchase DRAFT → Terima untuk restock berikutnya supaya ledger tetap lengkap.

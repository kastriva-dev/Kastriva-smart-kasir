# Kastriva POS Pro — Stage 1: Transaction Safety & Security

Tahap 1 sudah diterapkan ke project ini.

## Perubahan utama

- Memperbaiki route `/api/orders`: seluruh `assertActionAllowed(...)` sekarang ditunggu dengan `await`.
- Session browser hanya dianggap akses admin bila role session benar-benar `admin`.
- `ADMIN_API_TOKEN` sekarang opsional untuk UI; token tetap didukung untuk integrasi server-to-server.
- Menambahkan state machine order: `NEW → CONFIRMED → COOKING → READY → SERVED`.
- Status `PAID` hanya dapat dibuat lewat `payOrder`; tidak bisa lewat dropdown/status API.
- Double payment ditolak.
- `CANCELLED` menjadi terminal state, wajib alasan, dan stok menu yang dilacak dikembalikan tepat satu kali.
- Menambahkan full refund: hanya order `PAID`, wajib alasan, status akhir `REFUNDED`, dengan opsi restock.
- Menambahkan `clientOrderId` end-to-end untuk idempotency POS, QR order, dan offline queue.
- Retry dengan `clientOrderId` yang sama mengembalikan order lama tanpa membuat order/stok ganda.
- Laporan hanya menghitung order `PAID` sebagai penjualan. Order belum dibayar dipisahkan ke `outstandingSales`; refund ke `refundedSales`.
- Statistik pelanggan baru bertambah saat pembayaran sukses dan dikoreksi saat full refund.
- Schema Orders menambah kolom: `clientOrderId`, `cancelReason`, `cancelledAt`, `refundedAmount`, `refundReason`, `refundedAt`.

## Setelah upload ke Apps Script

1. Backup Google Spreadsheet terlebih dahulu.
2. Ganti `gas/Code.gs` dengan versi dari project ini.
3. Jalankan `setupDatabase()` satu kali. Fungsi ini tidak menghapus data lama; kolom baru ditambahkan di belakang.
4. Deploy → Manage deployments → Edit → pilih **New version** → Deploy. URL `/exec` tetap sama.
5. Deploy ulang frontend ke Vercel setelah push source terbaru.

Backend juga memiliki self-healing header untuk sheet `Orders` saat mutasi order pertama, tetapi menjalankan `setupDatabase()` tetap direkomendasikan setelah upgrade.

## Verifikasi yang sudah dilakukan

- GAS syntax check: PASS.
- TypeScript/TSX syntax scan: 32 file, 0 syntax error.
- `tests/gas-backend.test.mjs`: **29/29 PASS**.
- Environment audit memakai Node 22.16, sedangkan project mensyaratkan Node >=22.18; karena itu test yang mengimpor `.ts` langsung tidak dapat dijalankan di environment audit ini.

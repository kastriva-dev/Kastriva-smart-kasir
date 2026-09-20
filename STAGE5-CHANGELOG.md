# Kastriva POS Pro — Stage 5 Changelog

Version: **2.4.0**

## Promo & Voucher
- Promo persen/nominal dengan min spend, max discount, periode, dan status aktif.
- Voucher berkode unik, usage limit, used count, min spend, max discount, dan periode.
- Kalkulasi diskon dilakukan ulang di backend GAS.
- Kuota voucher dilepas kembali bila order dibatalkan sebelum pembayaran.

## Membership & Loyalty
- Member code dan saldo poin pada customer.
- Konfigurasi loyalty per store: spend-per-point, point value, max redeem percent.
- Find member by phone dari POS.
- Redeem points direservasi saat order dibuat; earn hanya ketika PAID.
- Refund membalik earned points dan mengembalikan redeemed points.
- Ledger `LoyaltyTransactions`.

## Split Payment
- Maksimal 5 metode pembayaran berbeda pada satu order.
- Setiap alokasi disimpan di sheet `Payments`.
- Payment mix dan cash reconciliation membaca alokasi aktual, termasuk refund tunai.

## Split Bill
- Pindah sebagian item/qty ke order baru tanpa perubahan stok tambahan.
- Split hanya untuk order non-final dan sebelum diskon/promo/redeem.
- Snapshot `OrderIngredientUsage` dipindahkan proporsional per OrderItem, sehingga restock cancel/refund tetap akurat setelah split.

## Database
Stage 5 menambahkan: `Promotions`, `Vouchers`, `Payments`, `LoyaltyTransactions`, dan `OrderIngredientUsage`.
Total schema: **23 sheet**. `setupDatabase()` tetap idempotent dan menambah kolom/sheet tanpa menghapus data lama.

## Validation
- 90/90 automated tests PASS pada audit Stage 5.
- 39 file TypeScript/TSX lolos transpile/syntax diagnostics.
- Full `tsc`/Next build memerlukan dependency lokal terinstal dan Node >=22.18 sesuai `package.json`.

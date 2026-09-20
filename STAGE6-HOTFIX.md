# Stage 6 Hotfix — Vercel Build

Version: **2.5.1**

Perbaikan setelah build Vercel menemukan type error pada `PromoLoyaltyPage.tsx`.

## Perbaikan
- Normalisasi `type` promo/voucher menjadi union aman `PERCENT | FIXED` sebelum dimasukkan ke `RuleDraft`.
- Mengganti ternary side-effect pada aksi hapus Promo/Voucher dengan `if/else` agar lolos rule `no-unused-expressions`.
- Menstabilkan handler `add` dan `scanBarcode` menggunakan `useCallback` serta memperbaiki dependency `useEffect` scanner keyboard.
- Memperbaiki dependency reload Advanced Analytics dengan destructuring callback `reload`.
- Menghapus `useMemo` yang tidak diperlukan pada daftar Shift sehingga dependency array tidak berubah setiap render.
- Tidak ada perubahan schema Google Sheets/GAS pada hotfix ini. Tidak perlu menjalankan `setupDatabase()` ulang hanya untuk hotfix 2.5.1.

## Validasi
- `npm test`: **102/102 PASS**.
- Semua file TypeScript/TSX lolos syntax parse check.
- Full `npm run build` tidak dapat dijalankan di sandbox karena dependency install terputus dan Node lokal 22.16, sedangkan project mensyaratkan Node >=22.18. Vercel menggunakan runtime yang memenuhi requirement tersebut.

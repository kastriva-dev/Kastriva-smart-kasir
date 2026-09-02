# POS Kasir QR + WhatsApp

Starter project Next.js untuk POS kasir online dengan halaman customer berbasis QR meja dan checkout ke WhatsApp kasir.

## Fitur
- Menu customer responsive.
- Keranjang, quantity, catatan, nama pemesan.
- URL customer per toko dan meja: `/customer/[storeId]/[tableId]`.
- Tombol checkout membuka WhatsApp dengan format pesanan otomatis.
- Dashboard kasir sederhana.
- API endpoint `/api/orders` sebagai fondasi integrasi database.
- Siap dipush ke GitHub dan dideploy ke Vercel.

## Menjalankan
1. Install Node.js 18.18+.
2. `npm install`
3. Copy `.env.example` menjadi `.env.local`.
4. Isi `NEXT_PUBLIC_CASHIER_WHATSAPP` dengan nomor WhatsApp kasir, contoh `6281234567890`.
5. `npm run dev`
6. Buka `http://localhost:3000`.

## URL contoh
- Customer meja 01: `/customer/kedai-saya/meja-01`
- Kasir: `/kasir`

## Deployment
Push repository ke GitHub, import ke Vercel, lalu isi Environment Variables:
- `NEXT_PUBLIC_CASHIER_WHATSAPP`
- `NEXT_PUBLIC_STORE_NAME`

## Catatan produksi
Versi ini adalah fondasi yang langsung dapat dijalankan. Untuk POS produksi penuh, tambahkan autentikasi kasir, database (mis. Supabase/Postgres), stok realtime, pembayaran, manajemen meja/QR, order status realtime, audit log, laporan PDF, dan WhatsApp Business Cloud API bila pesan harus masuk otomatis tanpa customer menekan Send di WhatsApp.

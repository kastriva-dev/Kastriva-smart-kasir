# Kastriva Smart Kasir — Enterprise Restaurant POS

Versi 2.0 adalah UI/UX enterprise glassmorphism blue-glass dengan modul operasional restoran dan customer QR ordering.

## Modul yang tersedia
Dashboard eksekutif, POS, Order Management, Kitchen Display Queue, Table Management, Reservation, Menu Engineering, Inventory, CRM/Pelanggan, Staff & Shift, Reports, QR & Online Ordering, Settings.

## Customer QR
URL:
`/customer/[storeId]/[tableId]`

Contoh:
`/customer/kastriva/meja-01`

Customer dapat memilih menu, jumlah, nama, catatan dan mengirim order ke WhatsApp kasir.

## PWA
Sudah tersedia:
- Web App Manifest
- Service worker
- Offline fallback
- Installable PWA metadata
- Mobile-first responsive UI

## Brand assets
Folder:
`public/brand/`
`public/icons/`

File yang digunakan:
- logo.png
- android-chrome-192x192.png
- android-chrome-512x512.png
- apple-touch-icon.png
- favicon-16x16.png
- favicon-32x32.png

Asset di ZIP ini dibuat dari screenshot logo yang diberikan sebagai referensi. Jika Anda memiliki file PNG/ICO asli, replace dengan nama file yang sama agar kualitas asli dipakai.

## Run
Node.js 20+ direkomendasikan.

```bash
npm install
cp .env.example .env.local
npm run dev
```

## Vercel
Push ke GitHub, import repository di Vercel, lalu set:
- NEXT_PUBLIC_STORE_NAME
- NEXT_PUBLIC_STORE_ID
- NEXT_PUBLIC_CASHIER_WHATSAPP
- NEXT_PUBLIC_SUPABASE_URL (jika backend Supabase diaktifkan)
- NEXT_PUBLIC_SUPABASE_ANON_KEY

## Production backend
UI ini sengaja dapat berjalan tanpa backend agar deployment pertama mudah. `supabase/schema.sql` sudah disediakan sebagai fondasi database production. Untuk produksi restoran, sambungkan data menu/order/staff/inventory ke Supabase/Postgres, aktifkan authentication, RLS, realtime order, storage gambar, audit log dan payment gateway.

## WhatsApp
Mode saat ini menggunakan click-to-chat `wa.me`. Customer tetap menekan tombol kirim di WhatsApp. Untuk pengiriman server-to-server tanpa membuka WhatsApp customer, gunakan WhatsApp Business Cloud API.

## QR
QR dapat diarahkan ke URL per meja. Pada halaman QR dashboard contoh digunakan generator QR online untuk visualisasi. Untuk produksi, generate QR secara lokal/server-side agar tidak bergantung pada pihak ketiga.

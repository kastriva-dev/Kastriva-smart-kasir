# Kastriva Smart Kasir — Enterprise POS + Google Apps Script Backend

Frontend: Next.js / Vercel  
Backend: Google Apps Script Web App  
Database: Google Sheets  
PWA: enabled

## Arsitektur gratis
Customer/Kasir → Vercel Next.js → `/api/*` server route → Google Apps Script → Google Sheets.

Browser tidak perlu memanggil GAS langsung, sehingga frontend tetap same-origin dan URL GAS/API key tidak ditaruh di client.

## Setup Google Apps Script
1. Buat Google Spreadsheet baru, misalnya `Kastriva Smart Kasir DB`.
2. Buka **Extensions → Apps Script**.
3. Masukkan `gas/Code.gs`.
4. Masukkan `gas/appsscript.json` sebagai manifest bila diperlukan.
5. Di Apps Script buka **Project Settings → Script properties**.
6. Tambahkan:
   - `GAS_API_KEY` = secret acak Anda.
7. Jalankan fungsi `setupDatabase()` sekali dan izinkan akses.
8. Klik **Deploy → New deployment → Web app**.
9. Execute as: **Me**.
10. Who has access: **Anyone**.
11. Copy URL `/exec`.

## Vercel Environment Variables
Set:
```text
GAS_WEB_APP_URL=https://script.google.com/macros/s/DEPLOYMENT_ID/exec
GAS_API_KEY=secret-yang-sama-dengan-script-property
NEXT_PUBLIC_STORE_NAME=Kastriva Smart Kasir
NEXT_PUBLIC_STORE_ID=kastriva
NEXT_PUBLIC_CASHIER_WHATSAPP=628xxxxxxxxxx
```

Setelah itu redeploy Vercel.

## Sheet yang dibuat otomatis
- Stores
- Tables
- Categories
- Menu
- Orders
- OrderItems
- Customers
- Reservations
- Inventory
- Staff
- AuditLog
- Settings

## API actions
GAS mendukung:
- health
- getMenu
- getOrders
- getOrder
- createOrder
- updateOrderStatus
- getTables
- getCustomers
- getInventory
- getReservations
- saveMenu
- saveTable
- saveInventory
- saveReservation
- deleteMenu
- audit

## QR customer
```text
/customer/kastriva/meja-01
/customer/kastriva/meja-02
```

Customer memilih menu → order disimpan ke Google Sheets → WhatsApp kasir dibuka dengan detail order.

## Catatan penggunaan gratis
Google Apps Script + Google Sheets sangat cocok untuk restoran kecil/menengah dan prototipe production. Untuk volume sangat tinggi, realtime yang ketat, atau banyak cabang dengan traffic besar, Apps Script/Sheets mempunyai quota dan batasan sehingga arsitektur database dedicated lebih tepat.

## Logo
ZIP ini mempertahankan asset logo asli yang ada pada project upload terbaru Anda:
`public/brand/logo.png` dan seluruh icon PWA.

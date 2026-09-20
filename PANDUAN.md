# 📖 PANDUAN PENGGUNA — Kastriva Smart Kasir

Selamat datang di Kastriva Smart Kasir! Dokumen ini adalah panduan lengkap untuk pemilik,
kasir, dan dapur. Panduan yang sama juga tersedia **di dalam aplikasi**: klik tombol **?**
di pojok kanan atas (di sebelah kiri ikon lonceng).

---

## 1. Mulai Cepat

1. **Masuk** dengan username & password admin (diatur lewat `ADMIN_USERNAME` dan
   `ADMIN_PASSWORD_HASH` di Vercel).
2. Buka **Pengaturan** → isi nama toko, pajak (%), dan service charge (%). Angka ini
   otomatis dipakai di POS, struk, dan halaman customer.
3. Tambahkan menu di halaman **Menu**, lalu tambahkan meja di halaman **Meja**.
4. Coba transaksi pertama di **POS**: pilih menu → Bayar Sekarang → struk muncul.
5. Semua data tersimpan di Google Sheets (sheet Orders, Menu, Tables, dll) — bisa dibuka
   langsung untuk pengecekan atau cadangan manual.

---

## 2. POS & Pembayaran (halaman utama kasir)

- Cari menu lewat kolom pencarian atau filter kategori. Klik menu untuk memasukkan ke
  keranjang; atur jumlah dengan tombol − / +.
- Pilih **meja** untuk dine-in, atau biarkan **Takeaway**. Diskon manual dapat memakai nominal rupiah atau persen.
- Untuk member, masukkan nomor telepon lalu cari member. Saldo poin akan tampil dan dapat diredeem sesuai batas toko.
- Promo aktif dapat dipilih dari daftar; voucher dimasukkan sebagai kode. Semua diskon dihitung ulang oleh server.
- Klik **Bayar Sekarang** → pilih metode:
  - **Tunai**: ketik uang yang diterima — kembalian dihitung otomatis. Tombol
    *Pas / 20rb / 50rb / 100rb* mempercepat input.
  - **QRIS / Debit / E-Wallet / Transfer**: dicatat senilai alokasi tagihan.
  - **Split Payment**: aktifkan mode split, pilih dua atau lebih metode (maksimal 5), lalu bagi nominal sampai tepat sama dengan total tagihan.
- Setelah konfirmasi, **struk** muncul. Klik **Cetak Struk** — hanya petak struk yang
  tercetak, bukan seluruh halaman.
- **Tahan** = simpan keranjang sementara (misal pelanggan masih menambah pesanan).
  **Panggil (n)** = buka kembali daftar pesanan yang ditahan. Tersimpan di perangkat kasir.
- Stok menu otomatis berkurang tiap transaksi. Menu dengan stok 0 otomatis tidak bisa
  dipesan dan ditandai "Habis".


## 3. Promo, Voucher, Membership, Split Bill & Split Payment

### Promo & Voucher
- Admin/Manager membuka menu **Promo & Loyalty** untuk membuat promo atau voucher.
- Tipe diskon dapat berupa **Persen** atau **Nominal**, dengan minimum belanja, maksimum diskon, periode berlaku, dan status aktif.
- Voucher memiliki kode unik dan dapat diberi batas jumlah pemakaian. Jika order dibatalkan sebelum dibayar, kuota voucher dikembalikan.
- Nilai diskon final selalu dihitung ulang di server; angka dari browser tidak dipercaya.

### Membership & Loyalty Point
- Pelanggan yang memiliki nomor telepon dapat dicari dari POS dan mempunyai **Member Code** serta saldo poin.
- Pengaturan loyalty menentukan: **belanja per 1 poin**, **nilai rupiah per poin**, dan **maksimum persen tagihan yang dapat dibayar dengan poin**.
- Poin redeem dipotong/reservasi ketika order dibuat. Poin reward baru diberikan setelah transaksi benar-benar **PAID**.
- Jika transaksi di-refund, poin reward dibalik dan poin yang sebelumnya diredeem dikembalikan. Riwayatnya tersimpan di `LoyaltyTransactions`.

### Split Bill
- Dari halaman **Pesanan**, pilih **Split** pada order aktif, lalu tentukan item dan qty yang dipindahkan ke bill baru.
- Split bill tidak mengurangi stok lagi; stok sudah dikonsumsi ketika order pertama dibuat.
- Untuk keamanan perhitungan, lakukan split bill **sebelum** menerapkan promo, voucher, diskon manual, atau redeem poin.
- Recipe/BOM memiliki snapshot pemakaian per item, sehingga cancel/refund salah satu bill hanya mengembalikan bahan milik bill tersebut.

### Split Payment
- Saat membayar, aktifkan **Split Payment**, pilih metode pembayaran dan isi alokasinya.
- Total semua alokasi harus sama persis dengan total tagihan. Metode yang sama tidak boleh dipakai dua kali dalam satu split.
- Setiap metode disimpan terpisah agar **Payment Mix** dan **rekonsiliasi kas shift** tetap benar.

## 4. Pesanan (antrian omnichannel)

- Semua order dari POS, QR customer, dan WhatsApp masuk di sini.
- Filter per status (default: **Aktif**), cari berdasarkan ID / nama pelanggan / meja.
- Klik chevron **▾** di baris order untuk melihat rincian item.
- Ubah status operasional lewat dropdown: `NEW → CONFIRMED → COOKING → READY → SERVED`.
  Status tidak dapat dilompati atau dimundurkan.
- **PAID tidak dipilih dari dropdown.** Gunakan tombol **Bayar** agar metode, nominal, dan
  kembalian benar-benar tercatat. Backend menolak pembayaran kedua untuk order yang sama.
- **CANCELLED / Void** wajib mengisi alasan. Saat dibatalkan sebelum dibayar, stok item
  otomatis dikembalikan tepat satu kali.
- Order yang sudah **PAID** tidak bisa di-Cancel. Gunakan tombol **Refund**; alasan refund wajib
  diisi dan aplikasi menanyakan apakah stok perlu dikembalikan.
- Daftar menyegarkan otomatis setiap 15 detik.

## 5. Dapur (Kitchen Display)

- Empat kolom alur: `NEW → CONFIRMED → COOKING → READY`, tombol satu-klik **Lanjut**.
- Angka merah = umur tiket 15 menit atau lebih (perlu diprioritaskan).
- Catatan per item dari pelanggan tampil di tiket.
- Menyegarkan otomatis setiap 12 detik.

## 6. Meja & QR Order

- **Meja**: tambah meja baru (kode + jumlah kursi). Status okupansi terisi **otomatis**
  dari pesanan aktif dan kembali kosong setelah order lunas/dibatalkan (atau klik
  **Kosongkan**).
- Tombol **QR** pada tiap meja menampilkan QR code — cetak dan tempel di meja. Tamu yang
  scan langsung membuka menu digital meja tersebut.
- Halaman **QR & Online** menyediakan QR + URL per meja untuk disalin/disebar.
- Order tamu masuk otomatis ke **Pesanan** dengan channel `QR`. Harga, pajak, dan service
  dihitung di server — tamu tidak bisa memanipulasinya.

## 7. Menu

- Tambah/edit menu: nama, kategori (pilih, atau ketik kategori baru), harga, modal, stok,
  **barcode/SKU**, emoji, deskripsi. **Kolom stok kosong = tidak dilacak.** Barcode dapat diketik,
  dibaca scanner USB, atau diisi lewat tombol scan kamera pada form Menu.
- Kolom **Margin** dihitung otomatis dari harga dan modal.
- Klik badge **AKTIF/OFF** untuk menampilkan/menyembunyikan menu di POS & halaman customer
  tanpa menghapusnya.
- **Hapus** permanen — dipakai untuk menu yang salah input.

## 8. Inventory Pro (bahan baku, supplier, purchase & recipe)

Inventory memiliki lima tab:

- **Bahan**: master nama bahan, satuan, stok, par level, average cost, nilai stok, dan badge RESTOCK.
  Gunakan **Aksi Stok** untuk perubahan operasional agar jejaknya masuk ledger.
- **Pergerakan**: Stock Movement Ledger berisi `INITIAL`, `PURCHASE`, `SALE`, `RETURN`, `OPNAME`,
  `WASTE`, dan `ADJUSTMENT`, lengkap dengan stok sebelum/sesudah, referensi, staff, dan catatan.
- **Supplier**: simpan pemasok aktif beserta telepon, email, alamat, dan catatan.
- **Pembelian**: buat purchase sebagai **DRAFT**. Stok belum berubah sampai Manager/Admin klik **Terima**.
  Saat diterima, stok bertambah dan harga modal bahan dihitung ulang dengan weighted-average cost.
- **Resep**: pilih menu lalu tentukan bahan + qty per **1 porsi**. Saat menu dipesan, bahan otomatis
  berkurang sesuai qty order. Bila order di-cancel, atau PAID di-refund dengan opsi restock, bahan
  dikembalikan berdasarkan movement transaksi asli.

**Stock Opname** digunakan saat hasil hitung fisik berbeda dari sistem. **Waste/Rusak** digunakan untuk
barang terbuang/rusak. **Adjustment** dipakai untuk koreksi manual +/- yang wajib memiliki alasan.

`Menu.cost` akan mengikuti biaya Recipe/BOM dan average cost bahan. Setiap item order juga menyimpan
**cost snapshot**, sehingga COGS historis tidak berubah ketika harga bahan berubah di masa depan.

## 9. Reservasi, Pelanggan & Staff

- **Reservasi**: simpan booking (nama, telepon, jumlah orang, waktu, catatan).
  Status: `BOOKED → CONFIRMED → SEATED` atau `CANCELLED`.
- **Pelanggan**: profil tercatat dari order yang menyertakan nomor telepon. Jumlah kunjungan
  dan total belanja bertambah saat transaksi benar-benar **PAID**, dan dikoreksi bila full refund.
- **Staff**: tambah/edit/hapus langsung dari aplikasi (tombol **+ Staff**). Isi nama,
  role (Kasir/Manager/Kitchen/Waiter/Barista/Staff), dan **PIN 4–8 digit**. PIN disimpan
  sebagai hash dan tidak pernah dikirim kembali ke browser. Untuk mengganti PIN, isi PIN baru saat edit.
  Klik badge **AKTIF/OFF** untuk menonaktifkan staff tanpa menghapusnya.
- Setelah dibuat, staff dapat keluar dari akun Admin lalu memilih tab **Staff / Kasir** di halaman login,
  memilih namanya, dan memasukkan PIN. Menu yang tampil otomatis mengikuti role.

## 10. Staff Login, Role & Shift Kasir

1. Login sebagai **Pemilik/Admin**, buka menu **Staff**, lalu pastikan staff aktif dan sudah memiliki PIN.
2. Logout. Pada halaman login pilih **Staff / Kasir** → pilih nama → masukkan PIN.
3. Staff operasional diarahkan ke menu **Shift**. Sebelum transaksi POS/pembayaran, klik **Buka Shift**.
4. Isi **Register ID** (contoh `KASIR-01`), **modal awal tunai**, dan catatan bila perlu.
5. Selama shift aktif, order/pembayaran POS mencatat `staffId`, nama staff, `shiftId`, dan `registerId`
   secara otomatis sehingga audit tidak lagi memakai identitas umum.
6. Saat selesai bekerja, hitung uang tunai fisik lalu klik **Tutup Shift** dan masukkan jumlah tersebut.
   Sistem menghitung **Expected Cash = Opening Cash + Cash Sales - Cash Refunds** serta selisih kas.

Hak akses utama:

| Role | Akses utama |
| --- | --- |
| **Admin** | Seluruh aplikasi; operasi darurat dapat dilakukan tanpa shift |
| **Manager** | Seluruh operasional, laporan, staff, inventory, refund; transaksi kas tetap memakai shift |
| **Kasir / Cashier** | POS, pembayaran, pesanan, pelanggan, reservasi, shift |
| **Kitchen / Barista** | Dapur, pesanan, shift; tidak dapat menerima pembayaran/refund |
| **Waiter** | Pesanan, meja, reservasi, pelanggan, shift; tidak dapat refund/pembayaran |
| **Staff** | Pesanan dasar dan shift |

> Pembatasan role diperiksa lagi di API server, bukan hanya menyembunyikan tombol di tampilan.
> Staff non-Admin tanpa shift aktif akan ditolak saat mencoba membuat transaksi POS atau pembayaran.


## 11. Perangkat POS: Barcode, Printer & Cash Drawer

Buka menu **Perangkat** pada PC/HP kasir yang akan memakai hardware. Konfigurasi disimpan **hanya di perangkat tersebut**,
sehingga setiap register dapat mempunyai printer sendiri.

### Scanner barcode

- **Scanner USB / Bluetooth keyboard-wedge**: umumnya cukup colok/pair. Di halaman POS, scan barcode lalu scanner mengirim Enter; produk langsung ditambahkan ke keranjang bila barcode terdaftar.
- Jika fokus sedang berada di kolom pencarian POS, barcode juga dapat discan lalu tekan/terkirim Enter untuk memasukkan produk.
- **Kamera HP**: klik **Kamera** di POS. Izinkan kamera, arahkan ke barcode, lalu item ditambahkan otomatis. Fitur ini mengikuti dukungan `BarcodeDetector` browser.
- Barcode produk diatur melalui **Menu → Edit/Tambah Menu → Barcode / SKU**. Backend mencegah dua menu dalam store yang sama memakai barcode yang sama.

### Printer struk / kitchen

Pilihan transport:

1. **Browser Print** — paling kompatibel, memakai dialog print browser/driver OS.
2. **USB / Serial ESC/POS** — direct print melalui Web Serial. Klik **Hubungkan** setelah memilih printer, lalu **Test**.
3. **Bluetooth Low Energy** — direct print melalui Web Bluetooth. Isi Service UUID dan Characteristic UUID printer, lalu Hubungkan.

Atur lebar kertas **58 mm** atau **80 mm**, auto-cut, lalu pilih apakah ingin:

- cetak struk otomatis setelah pembayaran;
- cetak kitchen ticket otomatis;
- kitchen menggunakan printer yang sama dengan receipt atau printer terpisah.

Order QR yang baru dapat tercetak otomatis sekali selama halaman **Dapur/KDS** aktif pada perangkat yang terhubung ke kitchen printer.
Bila browser/KDS ditutup, tidak ada proses background lokal yang dapat mengirim tiket ke printer.

### Cash drawer

Cash drawer yang terhubung ke port RJ11/RJ12 pada printer ESC/POS dapat dibuka dengan **Test Cash Drawer**.
Aktifkan **Buka cash drawer otomatis untuk pembayaran tunai** bila printer mendukung perintah pulse ESC/POS.
Cash drawer bukan dihubungkan langsung ke browser; pulse dikirim melalui receipt printer.

### Catatan kompatibilitas

- Web Serial, Web Bluetooth, dan kamera memerlukan **HTTPS** (atau localhost).
- Chrome/Edge desktop biasanya paling cocok untuk Web Serial. Dukungan browser/mobile dapat berbeda.
- Banyak printer Bluetooth murah memakai Bluetooth Classic/SPP, bukan BLE GATT. Jika tidak muncul di Web Bluetooth, gunakan driver OS + Browser Print atau serial/COM bila tersedia.
- Konfigurasi tersimpan, tetapi koneksi direct printer dapat perlu dihubungkan ulang setelah browser atau perangkat direstart.


## 12. Multi Outlet, Owner Dashboard & SaaS

### Memilih dan membuat outlet
- Fitur ini khusus **Pemilik/Admin**. Buka **Owner & SaaS** untuk melihat semua outlet dan batas outlet paket.
- Klik **+ Outlet** untuk membuat cabang baru. Setelah dibuat, pilih outlet dari dropdown di header atas aplikasi.
- Saat outlet diganti, menu, meja, pengaturan, transaksi, inventory, staff, laporan, dan analytics mengikuti outlet tersebut.
- Manager/staff tidak dapat berpindah atau membaca outlet lain; pembatasan dilakukan di backend, bukan hanya di tampilan.

### Owner Dashboard
- Menu **Owner & SaaS** menampilkan ringkasan 30 hari seluruh outlet: Net Sales, Gross Profit, jumlah order, outstanding, refund, margin, dan stok kritis.
- Menu **Analytics** menampilkan data outlet aktif untuk 7/30/90 hari: jam ramai, channel penjualan, performa staff, kategori, unique customer, dan repeat customer.

### Cloud Sync & Backup
- Google Sheets tetap menjadi **cloud source of truth**. Semua perangkat yang memakai backend yang sama membaca data terbaru sesuai outlet dan role.
- Di **Owner & SaaS → Cloud Sync & Backup**, status server dan perubahan terakhir dapat dicek.
- Klik **Download Backup JSON** untuk membuat salinan data outlet aktif. File memiliki checksum SHA-256 dan sebaiknya disimpan di lokasi lain dari Spreadsheet utama.
- Backup Stage 6 adalah **export/cadangan**, bukan tombol restore otomatis. Pemulihan tetap dilakukan secara terkontrol agar tidak menimpa transaksi aktif secara tidak sengaja.

### Trial & Subscription
- Instalasi baru mendapat **trial 14 hari** setelah `setupDatabase()` membuat Subscription.
- Saat trial/langganan habis, transaksi dan perubahan data diblokir. Data tetap dapat dibaca, backup tetap dapat dibuat, dan Owner masih dapat mengaktifkan lisensi.
- Paket mendukung batas outlet berbeda (`STARTER`, `PRO`, `BUSINESS`).
- Pada kartu Subscription terdapat **Installation ID**. ID ini diperlukan saat membuat lisensi dan membuat kode lisensi tidak dapat dipakai di instalasi lain.
- Tempel kode `KSP1...` dari penerbit lisensi lalu klik **Aktifkan Lisensi**.

Untuk penerbit aplikasi, contoh pembuatan lisensi di PowerShell:

```powershell
$env:LICENSE_SIGNING_SECRET="secret-acak-minimal-32-karakter"
npm run license:make -- PRO 365 5 CUSTOMER-001 INST-XXXXXXXXXXXXXX
```

`LICENSE_SIGNING_SECRET` wajib disimpan hanya di server/mesin penerbit dan **tidak boleh** menggunakan prefix `NEXT_PUBLIC_`.

## 13. Laporan

- Pilih rentang: **Hari Ini / 7 Hari / 30 Hari**.
- Angka tersedia: transaksi lunas, total order masuk, gross sales, diskon, pajak, service,
  net sales, **COGS, Gross Profit, Gross Margin**, outstanding, refund, jumlah refund, dan rata-rata check.
- **Net sales hanya menghitung transaksi PAID**; order yang belum dibayar tidak lagi tercampur
  dengan omzet. **Payment mix** per metode (Tunai/QRIS/Debit/E-Wallet), **tren harian**, dan
  **menu terlaris**.
- Tombol **CSV** mengunduh rekap untuk Excel / Google Spreadsheet.

## 14. PWA & Mode Offline

- Klik kartu **Pasang** (atau menu browser → *Install app*) agar aplikasi terpasang di
  home screen dan terbuka layar penuh seperti aplikasi native.
- Saat internet putus: aplikasi tetap terbuka. Pesanan pelanggan yang dibuat saat offline
  masuk **antrean otomatis** dan terkirim begitu koneksi kembali. Setiap retry memakai ID transaksi
  yang sama, sehingga koneksi putus di tengah proses tidak membuat order duplikat.
- Menu digital pelanggan tetap tampil offline (cache otomatis).
- Setelah deploy versi baru, refresh halaman sekali untuk memuat versi terbaru.

## 15. Tips & Troubleshooting

| Gejala | Solusi |
| --- | --- |
| "Backend belum terhubung" | Periksa `GAS_WEB_APP_URL` & `GAS_API_KEY` di Vercel; pastikan Apps Script ter-deploy versi terbaru. |
| Setelah edit `gas/Code.gs` | Apps Script → jalankan `setupDatabase()` sekali → Deploy → **Manage deployments** → Edit → **New version** → Deploy (URL tidak berubah). |
| Ganti password admin | `npm run auth:hash -- 'password-baru'` → perbarui `ADMIN_PASSWORD_HASH` di Vercel → redeploy. |
| Login gagal di HTTP lokal | Biarkan `AUTH_COOKIE_SECURE` kosong (mengikuti protokol). |
| Lupa password | Buat hash baru seperti di atas; mengganti `AUTH_SECRET` juga memaksa semua perangkat logout. |
| Lisensi gagal diaktifkan | Pastikan `LICENSE_SIGNING_SECRET` server sama dengan secret penerbit, kode belum expired, dan `Installation ID` lisensi sama dengan instalasi pelanggan. |

**Cadangkan data**: seluruh data bisnis ada di Google Sheets — salin spreadsheet secara
berkala (File → Make a copy) sebagai backup.

---

*Kastriva Smart Kasir — Enterprise POS berbasis Next.js + Google Apps Script + Google Sheets.*

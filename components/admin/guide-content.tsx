import type {ReactNode} from "react";

export type GuideSection = {
  id: string;
  label: string;
  summary: string;
  body: ReactNode;
};

export const guideSections: GuideSection[] = [
  {
    id: "mulai",
    label: "Mulai Cepat",
    summary: "Langkah setup awal sampai transaksi pertama.",
    body: (
      <ul>
        <li>Pemilik masuk lewat <b>Pemilik / Admin</b> menggunakan username &amp; password environment. Staff operasional masuk lewat <b>Staff / Kasir</b> menggunakan nama + PIN yang dibuat Admin.</li>
        <li>Buka <b>Pengaturan</b>, isi nama toko, telepon, alamat, pajak (%), dan service charge (%) karena angka ini dipakai POS, laporan, struk, dan halaman customer.</li>
        <li>Tambahkan <b>Menu</b>, <b>Meja</b>, dan bila perlu data <b>Staff</b> terlebih dahulu.</li>
        <li>Coba transaksi pertama di <b>POS</b>: pilih menu → pilih meja atau takeaway → Bayar Sekarang → struk tercetak/terbuka.</li>
        <li>Semua data tersimpan di Google Sheets, jadi mudah dicek, dibackup, atau dipulihkan bila diperlukan.</li>
      </ul>
    )
  },
  {
    id: "pos",
    label: "POS & Pembayaran",
    summary: "Cara membuat transaksi, hold order, dan proses bayar.",
    body: (
      <ul>
        <li>Cari item lewat kolom pencarian, kategori, atau scanner barcode. Klik menu untuk masuk ke keranjang dan atur qty dengan tombol − / +.</li>
        <li>Pilih <b>Meja</b> untuk dine-in atau biarkan <b>Takeaway</b>. Tambahkan pelanggan, catatan, atau diskon manual bila perlu.</li>
        <li>Klik <b>Bayar Sekarang</b> lalu pilih metode: tunai, QRIS, debit/kartu, e-wallet, transfer, atau split payment bila satu transaksi dibayar beberapa metode.</li>
        <li><b>Tahan</b> menyimpan keranjang sementara di perangkat kasir. <b>Panggil</b> membuka kembali transaksi yang ditahan.</li>
        <li>Transaksi PAID otomatis mengurangi stok produk jadi, menghitung pajak/service, mengirim reward point bila aktif, dan menyiapkan struk.</li>
        <li>Struk dapat dicetak via Browser Print, printer ESC/POS, atau Bluetooth/BLE sesuai pengaturan perangkat.</li>
      </ul>
    )
  },
  {
    id: "pesanan",
    label: "Pesanan & Dapur",
    summary: "Kontrol alur order dari masuk sampai selesai.",
    body: (
      <ul>
        <li><b>Pesanan</b> menampilkan semua order dari POS, QR, dan online dengan pencarian, filter status, dan detail item.</li>
        <li>Alur status normal: <b>NEW → CONFIRMED → COOKING → READY → SERVED</b>. Status <b>PAID</b> hanya melalui pembayaran.</li>
        <li><b>CANCELLED</b> wajib alasan dan akan mengembalikan stok sesuai aturan restock. Transaksi yang sudah PAID memakai <b>Refund</b>, bukan Cancel.</li>
        <li>Order yang belum lunas bisa dibayar dari halaman Pesanan memakai tombol <b>Bayar</b>.</li>
        <li><b>Dapur</b> / KDS menampilkan alur masak 4 kolom, tombol lanjut cepat, penanda order lama, dan refresh otomatis.</li>
        <li>Bila kitchen printer aktif, tiket dapur bisa tercetak otomatis tanpa menduplikasi tiket yang sama.</li>
      </ul>
    )
  },
  {
    id: "meja",
    label: "Meja & QR Order",
    summary: "Kelola meja dine-in dan pemesanan mandiri via QR.",
    body: (
      <ul>
        <li>Tambahkan meja baru dengan kode dan jumlah kursi. Status meja akan berubah otomatis berdasarkan order aktif.</li>
        <li>Tombol <b>QR</b> pada tiap meja menampilkan QR code meja untuk dicetak dan ditempel.</li>
        <li>Halaman <b>QR &amp; Online</b> memuat kumpulan QR, link meja, serta status order online yang masuk.</li>
        <li>Tamu yang scan QR langsung membuka menu digital meja tersebut dan pesanan otomatis masuk ke Pesanan dengan channel QR.</li>
        <li>Perhitungan harga, pajak, dan validasi order QR dilakukan server supaya tamu tidak bisa memanipulasi total.</li>
      </ul>
    )
  },
  {
    id: "menu-inventory",
    label: "Menu & Inventory Pro",
    summary: "Kelola produk, bahan baku, supplier, pembelian, dan resep.",
    body: (
      <ul>
        <li><b>Menu</b> dipakai untuk mengatur nama produk, kategori, harga jual, modal, stok produk jadi, barcode/SKU, emoji, deskripsi, dan status tampil/off.</li>
        <li><b>Inventory Pro</b> memiliki tab: Bahan, Pergerakan, Supplier, Pembelian, dan Resep.</li>
        <li>Semua perubahan stok penting masuk ke <b>Stock Movement Ledger</b> sehingga asal perubahan dapat ditelusuri.</li>
        <li>Gunakan <b>Stock Opname</b>, <b>Waste/Rusak</b>, atau <b>Adjustment</b> untuk penyesuaian stok yang rapi dan terarsip.</li>
        <li>Buat <b>Purchase</b> berstatus DRAFT untuk restock supplier, lalu klik <b>Terima</b> saat barang datang. Sistem akan menghitung weighted-average cost.</li>
        <li>Di tab <b>Resep/BOM</b>, hubungkan menu ke bahan per porsi. Saat menu terjual, stok bahan otomatis berkurang; cancel/refund dapat mengembalikannya sesuai movement asli.</li>
      </ul>
    )
  },
  {
    id: "reservasi-pelanggan-staff",
    label: "Reservasi, Pelanggan & Staff",
    summary: "Kelola booking, database pelanggan, dan akun staff.",
    body: (
      <ul>
        <li><b>Reservasi</b> dipakai untuk booking meja dengan alur status <b>BOOKED → CONFIRMED → SEATED</b> atau <b>CANCELLED</b>.</li>
        <li><b>Pelanggan</b> tercatat otomatis dari order yang menyertakan nomor telepon, lengkap dengan kunjungan, total belanja, dan informasi member.</li>
        <li><b>Staff</b> dipakai untuk menambah nama staff, role, dan PIN 4–8 digit. PIN disimpan sebagai hash dan tidak ditampilkan ulang.</li>
        <li>Gunakan data pelanggan untuk loyalty, promo member, dan analisis repeat customer.</li>
      </ul>
    )
  },
  {
    id: "shift",
    label: "Staff Login & Shift",
    summary: "Alur login kasir dan kontrol modal/tutup kas.",
    body: (
      <ul>
        <li>Admin membuat staff dari menu <b>Staff</b>. Setelah itu staff login lewat tab <b>Staff / Kasir</b> menggunakan nama + PIN.</li>
        <li>Staff non-admin wajib membuka <b>Shift</b> sebelum menerima pembayaran atau membuat transaksi POS.</li>
        <li>Isi <b>Register ID</b> dan <b>Modal Awal</b>. Sistem menyimpan shift ID, register ID, dan identitas operator pada transaksi.</li>
        <li>Saat <b>Tutup Shift</b>, masukkan uang tunai fisik. Sistem menghitung expected cash = modal awal + penjualan tunai − refund tunai.</li>
        <li>Role akses: Refund hanya Admin/Manager. Pembayaran hanya Admin/Manager/Kasir. Kitchen/Barista fokus ke dapur. Waiter fokus ke meja, pesanan, reservasi, dan pelanggan.</li>
      </ul>
    )
  },
  {
    id: "promo",
    label: "Promo, Loyalty & Split",
    summary: "Diskon, voucher, point reward, split bill, dan split payment.",
    body: (
      <ul>
        <li><b>Promo &amp; Loyalty</b> dipakai Admin/Manager untuk membuat promo persen/nominal, voucher, syarat minimum belanja, periode aktif, kuota, dan batas diskon.</li>
        <li>Di POS, cari pelanggan lewat nomor telepon untuk melihat member code, poin, lalu lakukan redeem point sesuai konfigurasi toko.</li>
        <li>Poin reward hanya diberikan setelah transaksi <b>PAID</b>. Refund akan membalik reward point dan mengembalikan redeem point.</li>
        <li><b>Split Payment</b> membagi satu tagihan ke beberapa metode bayar; setiap alokasi disimpan terpisah agar laporan dan shift tetap akurat.</li>
        <li><b>Split Bill</b> memindahkan item/qty ke bill baru tanpa mengurangi stok lagi. Lakukan split sebelum menerapkan diskon/promo/voucher/redeem point.</li>
      </ul>
    )
  },
  {
    id: "hardware",
    label: "Barcode & Perangkat",
    summary: "Scanner, kamera, printer, kitchen ticket, dan cash drawer.",
    body: (
      <ul>
        <li>Produk dapat memiliki <b>Barcode/SKU</b> unik. Scanner USB keyboard-wedge atau kamera HP bisa dipakai untuk mencari/menambahkan item.</li>
        <li>Menu <b>Perangkat</b> dipakai untuk mengatur printer struk, kitchen printer, auto-print, cash drawer, dan dukungan browser.</li>
        <li>Pilih mode printer: Browser Print, USB/Serial ESC/POS, atau BLE jika kompatibel. Gunakan <b>Test Printer</b> sebelum pemakaian harian.</li>
        <li>Kitchen printer dapat memakai printer terpisah atau printer yang sama dengan kasir, dan KDS mencegah tiket tercetak ganda.</li>
        <li>Cash drawer yang terhubung ke printer ESC/POS bisa dibuka otomatis untuk transaksi tunai.</li>
        <li>Fitur Web Serial, Web Bluetooth, dan kamera memerlukan HTTPS agar berjalan normal.</li>
      </ul>
    )
  },
  {
    id: "owner-saas",
    label: "Multi Outlet & SaaS",
    summary: "Owner dashboard, subscription, lisensi, dan backup.",
    body: (
      <ul>
        <li><b>Owner &amp; SaaS</b> khusus Pemilik/Admin untuk mengelola outlet, memantau performa lintas outlet, backup, dan subscription.</li>
        <li>Dropdown outlet di header mengganti outlet aktif. Semua data menu, meja, transaksi, inventory, staff, laporan, dan analytics akan mengikuti outlet tersebut.</li>
        <li>Stage SaaS mendukung <b>trial 14 hari</b>, paket STARTER / PRO / BUSINESS, batas jumlah outlet, dan aktivasi lisensi <b>KSP1</b>.</li>
        <li>Kode lisensi KSP1 terikat ke <b>Installation ID</b>, sehingga tidak bisa dipindahkan begitu saja ke instalasi lain.</li>
        <li><b>Backup JSON</b> dilengkapi checksum SHA-256. Simpan backup berkala di luar Spreadsheet utama.</li>
      </ul>
    )
  },
  {
    id: "laporan-analytics",
    label: "Laporan & Analytics",
    summary: "Ringkasan usaha, gross profit, kategori, dan pelanggan.",
    body: (
      <ul>
        <li><b>Laporan</b> menyediakan filter Hari Ini / 7 Hari / 30 Hari dengan metrik order, gross sales, diskon, pajak, service, net sales, COGS, gross profit, margin, dan payment mix.</li>
        <li><b>Dashboard</b> menampilkan ringkasan cepat penjualan, pesanan, stok kritis, dan kartu KPI.</li>
        <li><b>Analytics</b> menyediakan rentang 7/30/90 hari untuk melihat jam ramai, channel order, performa staff, kategori, unique customer, repeat customer, dan repeat rate.</li>
        <li>Export CSV dapat dipakai untuk olah data lanjutan di Excel atau Google Sheets.</li>
      </ul>
    )
  },
  {
    id: "pwa-offline",
    label: "PWA & Offline",
    summary: "Install seperti aplikasi dan tetap aman saat koneksi putus.",
    body: (
      <ul>
        <li>Klik tombol atau menu browser <b>Install App / Pasang</b> agar aplikasi tampil penuh seperti aplikasi native di desktop/HP.</li>
        <li>Saat internet putus, aplikasi tetap terbuka dan data terakhir tetap dapat dibaca. Order customer offline akan masuk antrean lalu dikirim otomatis ketika koneksi kembali.</li>
        <li>Setelah deploy versi baru, refresh halaman satu kali agar service worker mengambil versi terbaru.</li>
      </ul>
    )
  },
  {
    id: "troubleshooting",
    label: "Tips & Troubleshooting",
    summary: "Panduan cepat kalau ada masalah di login, GAS, atau deploy.",
    body: (
      <ul>
        <li>Jika muncul <b>Backend belum terhubung</b>, periksa <code>GAS_WEB_APP_URL</code> dan <code>GAS_API_KEY</code> di Vercel serta pastikan Apps Script sudah dideploy versi terbaru.</li>
        <li>Setelah mengubah <code>gas/Code.gs</code>, jalankan: Apps Script → Deploy → Manage deployments → Edit → <b>New version</b> → Deploy.</li>
        <li>Untuk mengganti password admin, buat hash baru lalu perbarui <code>ADMIN_PASSWORD_HASH</code> di Vercel, kemudian redeploy.</li>
        <li>Bila login lokal via HTTP bermasalah, biarkan <code>AUTH_COOKIE_SECURE</code> kosong pada environment development.</li>
        <li>Lakukan backup Spreadsheet dan backup JSON secara berkala agar pemulihan lebih mudah saat darurat.</li>
      </ul>
    )
  }
];

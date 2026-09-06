"use client";
import {useState} from "react";
import {X} from "lucide-react";
import type {ReactNode} from "react";

type Topic = {id: string; label: string; body: ReactNode};

const topics: Topic[] = [
  {
    id: "mulai",
    label: "Mulai Cepat",
    body: (
      <ul>
        <li>
          Masuk dengan username &amp; password admin (diatur lewat <code>ADMIN_USERNAME</code> dan{" "}
          <code>ADMIN_PASSWORD_HASH</code> di Vercel).
        </li>
        <li>
          Buka <b>Pengaturan</b>: isi nama toko, pajak (%), dan service charge (%) — angka ini otomatis
          dipakai POS dan halaman customer.
        </li>
        <li>
          Tambahkan menu di halaman <b>Menu</b>, lalu tambahkan meja di halaman <b>Meja</b>.
        </li>
        <li>
          Coba transaksi pertama di <b>POS</b>: pilih menu → Bayar Sekarang → struk muncul.
        </li>
        <li>
          Semua data tersimpan di Google Sheets (menu Orders, Menu, Tables, dst) — bisa dibuka langsung
          untuk pengecekan atau cadangan.
        </li>
      </ul>
    )
  },
  {
    id: "pos",
    label: "POS & Pembayaran",
    body: (
      <ul>
        <li>
          Cari menu lewat kolom pencarian atau filter kategori. Klik menu untuk memasukkan ke keranjang;
          atur jumlah dengan tombol − / +.
        </li>
        <li>
          Pilih <b>meja</b> untuk dine-in, atau biarkan <b>Takeaway</b>. Isi diskon rupiah bila ada.
        </li>
        <li>
          Klik <b>Bayar Sekarang</b> → pilih metode. <b>Tunai</b>: ketik uang yang diterima, kembalian
          dihitung otomatis (tombol Pas / 20rb / 50rb / 100rb mempercepat). QRIS / Debit / E-Wallet dicatat
          senilai total.
        </li>
        <li>
          Setelah konfirmasi, <b>struk</b> muncul — klik Cetak Struk untuk mencetak (petak struk saja yang
          tercetak).
        </li>
        <li>
          <b>Tahan</b> menyimpan keranjang sementara (misal pelanggan masih nambah), <b>Panggil</b> membukanya
          kembali. Tersimpan di perangkat kasir.
        </li>
        <li>
          Stok menu otomatis berkurang tiap transaksi; menu dengan stok 0 otomatis tidak bisa dipesan.
        </li>
      </ul>
    )
  },
  {
    id: "pesanan",
    label: "Pesanan & Dapur",
    body: (
      <ul>
        <li>
          <b>Pesanan</b> adalah antrian semua order (POS / QR / WhatsApp). Filter per status, cari by ID /
          pelanggan / meja, dan klik chevron ▾ untuk melihat rincian item.
        </li>
        <li>
          Ubah status lewat dropdown: NEW → CONFIRMED → COOKING → READY → SERVED → PAID (atau CANCELLED).
        </li>
        <li>
          Order yang belum lunas punya tombol <b>Bayar</b> — cocok untuk order QR yang dibayar di kasir.
        </li>
        <li>
          <b>Dapur</b> (Kitchen Display) menampilkan 4 kolom alur masak dengan tombol satu-klik &quot;Lanjut&quot;.
          Tiket berumur 15 menit atau lebih disorot merah. Halaman menyegarkan diri otomatis
          (Pesanan 15 dtk, Dapur 12 dtk).
        </li>
      </ul>
    )
  },
  {
    id: "meja",
    label: "Meja & QR Order",
    body: (
      <ul>
        <li>
          <b>Meja</b>: tambahkan meja baru (kode + jumlah kursi). Status okupansi terisi otomatis dari
          pesanan aktif, dan kembali tersedia setelah order lunas/dibatalkan atau diklik Kosongkan.
        </li>
        <li>
          Tombol <b>QR</b> pada tiap meja menampilkan QR code — cetak dan tempel di meja. Tamu yang scan
          langsung membuka menu digital meja tersebut.
        </li>
        <li>
          Halaman <b>QR &amp; Online</b> memuat QR yang sama plus URL per meja untuk disalin.
        </li>
        <li>
          Order tamu masuk otomatis ke <b>Pesanan</b> dengan channel QR — harga dan pajak dihitung server,
          tamu tidak bisa mengubahnya.
        </li>
      </ul>
    )
  },
  {
    id: "menu",
    label: "Menu & Inventory",
    body: (
      <ul>
        <li>
          <b>Menu</b>: tambah/edit menu (nama, kategori — atau ketik kategori baru, harga, modal, stok,
          emoji, deskripsi). Kolom stok kosong = tidak dilacak. Margin dihitung otomatis di tabel.
        </li>
        <li>
          Klik badge status <b>AKTIF/OFF</b> untuk menyembunyikan/menampilkan menu di POS dan halaman
          customer tanpa menghapusnya.
        </li>
        <li>
          <b>Inventory</b>: daftar bahan dengan stok dan par level. Badge <b>RESTOCK</b> menyala saat stok ≤
          par level, dan jumlahnya muncul sebagai &quot;Stok kritis&quot; di Dashboard.
        </li>
      </ul>
    )
  },
  {
    id: "crm",
    label: "Reservasi, Pelanggan & Staff",
    body: (
      <ul>
        <li>
          <b>Reservasi</b>: simpan booking (nama, telepon, jumlah orang, waktu, catatan). Alur status:
          BOOKED → CONFIRMED → SEATED, atau CANCELLED.
        </li>
        <li>
          <b>Pelanggan</b> tercatat otomatis dari setiap order yang menyertakan nomor telepon — lengkap
          dengan jumlah kunjungan dan total belanja. Urutan otomatis dari yang paling besar belanjanya.
        </li>
        <li>
          <b>Staff</b>: kelola langsung dari aplikasi lewat tombol <b>+ Staff</b> — nama, role, dan PIN
          kasir 4–8 digit. PIN tersimpan sebagai hash (tidak bisa dilihat ulang); isi PIN baru saat edit
          untuk menggantinya.
        </li>
      </ul>
    )
  },
  {
    id: "laporan",
    label: "Laporan & Pengaturan",
    body: (
      <ul>
        <li>
          <b>Laporan</b>: pilih rentang Hari Ini / 7 Hari / 30 Hari. Tersedia order, gross sales, diskon,
          pajak, service, net sales, rata-rata check, payment mix per metode, tren harian, dan menu
          terlaris. Tombol <b>CSV</b> mengunduh rekap untuk Excel/Spreadsheet.
        </li>
        <li>
          <b>Dashboard</b> merangkum hal yang sama untuk hari ini + alert stok kritis.
        </li>
        <li>
          <b>Pengaturan</b>: nama toko, telepon, alamat, pajak %, dan service charge % — tersimpan ke
          backend dan langsung dipakai di struk, POS, dan halaman customer.
        </li>
      </ul>
    )
  },
  {
    id: "pwa",
    label: "PWA & Offline",
    body: (
      <ul>
        <li>
          Klik kartu <b>Pasang</b> (atau menu browser → Install app) agar aplikasi terbuka layar penuh
          seperti aplikasi native, lengkap di home screen.
        </li>
        <li>
          Saat internet putus: aplikasi tetap terbuka, dan pesanan pelanggan yang dibuat offline masuk
          antrean lalu <b>terkirim otomatis</b> begitu koneksi kembali.
        </li>
        <li>
          Setelah deploy versi baru, refresh halaman sekali untuk memuat versi terbaru.
        </li>
      </ul>
    )
  },
  {
    id: "troubleshoot",
    label: "Tips & Troubleshooting",
    body: (
      <ul>
        <li>
          <b>&quot;Backend belum terhubung&quot;</b> → periksa <code>GAS_WEB_APP_URL</code> dan{" "}
          <code>GAS_API_KEY</code> di Vercel, dan pastikan Apps Script sudah dideploy versi terbaru.
        </li>
        <li>
          Setelah mengubah <code>gas/Code.gs</code>: Apps Script → Deploy → Manage deployments → Edit →
          <b> New version</b> → Deploy (URL tidak berubah).
        </li>
        <li>
          Ganti password admin: jalankan <code>npm run auth:hash -- &apos;password-baru&apos;</code>, perbarui{" "}
          <code>ADMIN_PASSWORD_HASH</code> di Vercel, lalu redeploy.
        </li>
        <li>
          Login bermasalah di jaringan HTTP lokal? Biarkan <code>AUTH_COOKIE_SECURE</code> kosong.
        </li>
        <li>
          Data utama selalu ada di Google Sheets — salin spreadsheet secara berkala sebagai cadangan.
        </li>
      </ul>
    )
  }
];

/** Modal panduan penggunaan untuk pembeli aplikasi. */
export default function GuideModal({onClose}: {onClose: () => void}) {
  const [active, setActive] = useState(topics[0].id);
  const topic = topics.find(t => t.id === active) || topics[0];

  return (
    <div
      className="modal"
      role="dialog"
      aria-modal="true"
      aria-label="Panduan penggunaan"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modalCard glass modalWide">
        <div className="split">
          <div>
            <h2 style={{margin: 0}}>Panduan Penggunaan</h2>
            <p className="muted" style={{margin: "4px 0 0", fontSize: 13}}>
              Cara memakai Kastriva Smart Kasir, halaman per halaman.
            </p>
          </div>
          <button type="button" className="iconBtn" aria-label="Tutup panduan" onClick={onClose}>
            <X size={17} aria-hidden="true" />
          </button>
        </div>

        <div className="guideChips" role="tablist" aria-label="Topik panduan">
          {topics.map(t => (
            <button
              type="button"
              key={t.id}
              role="tab"
              aria-selected={t.id === active}
              className={`btn cat ${t.id === active ? "primary" : ""}`}
              onClick={() => setActive(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="guideBody" role="tabpanel" aria-label={topic.label}>
          <h3>{topic.label}</h3>
          {topic.body}
        </div>

        <p className="muted guideFoot">
          Panduan lengkap juga tersedia di file <code>PANDUAN.md</code> pada folder project.
        </p>
      </div>
    </div>
  );
}

import type {Metadata} from "next";
import Link from "next/link";

export const metadata: Metadata = {title: "Mode Offline"};

export default function Offline() {
  return (
    <main className="hero">
      <div className="card glass offlineCard">
        <h1>Mode Offline</h1>
        <p className="muted">
          Aplikasi masih dapat dibuka dari cache. Pesanan baru membutuhkan koneksi, sinkronisasi akan berjalan saat
          koneksi kembali.
        </p>
        <Link className="btn primary" href="/">
          Coba lagi
        </Link>
      </div>
    </main>
  );
}

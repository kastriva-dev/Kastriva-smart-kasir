"use client";
import {useEffect, useMemo, useState} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import QrCanvas from "@/components/QrCanvas";
import {STORE_ID, STORE_NAME} from "@/lib/data";

const DEFAULT_WA = (process.env.NEXT_PUBLIC_CASHIER_WHATSAPP || "").replace(/\D/g, "");

export default function Kasir() {
  const router = useRouter();
  const [wa, setWa] = useState(DEFAULT_WA);
  const [table, setTable] = useState("meja-01");
  const [origin, setOrigin] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);

  // Dibaca setelah mount agar markup server dan client sama.
  useEffect(() => setOrigin(window.location.origin), []);

  const logout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", {method: "POST"});
      router.replace("/login");
      router.refresh();
    } catch {
      setLoggingOut(false);
    }
  };

  const slug = useMemo(
    () => table.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "meja-01",
    [table]
  );
  const path = `/customer/${STORE_ID}/${slug}`;
  const qrUrl = origin ? `${origin}${path}` : path;
  const waValid = wa.length === 0 || /^\d{8,15}$/.test(wa);

  return (
    <main className="page">
      <div className="topbar">
        <div className="pageTitle">
          <h1>Dashboard Kasir</h1>
          <p className="muted">{STORE_NAME} • Kelola POS dan QR customer.</p>
        </div>
        <div className="topActions">
          <Link className="btn" href="/">
            Beranda
          </Link>
          <button type="button" className="btn danger" onClick={logout} disabled={loggingOut}>
            {loggingOut ? "Keluar..." : "Logout"}
          </button>
        </div>
      </div>

      <div className="grid autoFit">
        <div className="card glass">
          <h2>WhatsApp Kasir</h2>
          <p className="muted">Nomor tujuan link WhatsApp, format internasional tanpa tanda plus.</p>
          <label className="label">
            Nomor WhatsApp
            <input
              className="input"
              inputMode="numeric"
              value={wa}
              aria-invalid={!waValid}
              onChange={e => setWa(e.target.value.replace(/\D/g, "").slice(0, 15))}
              placeholder="6281234567890"
            />
          </label>
          {!waValid ? (
            <p className="alert error" role="alert">
              Nomor harus 8–15 digit angka.
            </p>
          ) : null}
          <p className="muted" style={{marginTop: 12}}>
            Nilai di sini hanya untuk pratinjau. Atur permanen lewat <code>NEXT_PUBLIC_CASHIER_WHATSAPP</code> pada
            environment variable, lalu redeploy.
          </p>
        </div>

        <div className="card glass">
          <h2>QR Meja</h2>
          <label className="label">
            Kode meja
            <input
              className="input"
              value={table}
              onChange={e => setTable(e.target.value.slice(0, 32))}
              placeholder="meja-01"
            />
          </label>
          <div style={{marginTop: 14}}>
            <QrCanvas value={qrUrl} size={220} alt={`QR ${slug}`} />
          </div>
          <p className="qr">{qrUrl}</p>
          <Link className="btn primary" href={path}>
            Tes menu meja ini
          </Link>
        </div>
      </div>
    </main>
  );
}

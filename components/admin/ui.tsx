"use client";
import {X} from "lucide-react";
import type {ReactNode} from "react";

/** Modal generik gaya glass; klik area gelap atau tombol X untuk menutup. */
export function Modal({
  title,
  onClose,
  children
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="modal"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modalCard glass">
        <div className="split">
          <h2>{title}</h2>
          <button type="button" className="iconBtn" aria-label="Tutup" onClick={onClose}>
            <X size={17} aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({
  label,
  children
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="label">
      {label}
      {children}
    </label>
  );
}

/** Pesan error dengan pilihan ulang; mode setup menjelaskan konfigurasi backend. */
export function ErrorState({
  message,
  setup,
  onRetry
}: {
  message: string;
  setup?: boolean;
  onRetry: () => void;
}) {
  if (setup) {
    return (
      <div className="alert error" role="alert">
        <b>Backend belum terhubung.</b>
        <p style={{margin: "6px 0"}}>
          Isi <code>GAS_WEB_APP_URL</code> dan <code>GAS_API_KEY</code> pada environment server (Vercel / .env.local),
          lalu redeploy. Deploy Apps Script mengikuti panduan di README.
        </p>
        <button type="button" className="btn" onClick={onRetry}>
          Coba lagi
        </button>
      </div>
    );
  }
  return (
    <div className="alert error" role="alert">
      {message}{" "}
      <button type="button" className="btn" onClick={onRetry}>
        Coba lagi
      </button>
    </div>
  );
}

export function Skeleton({rows = 3}: {rows?: number}) {
  return (
    <div className="grid" style={{gap: 10}} aria-hidden="true">
      {Array.from({length: rows}, (_, i) => (
        <div className="skeleton" key={i} style={{height: 44}} />
      ))}
    </div>
  );
}

export function EmptyState({message}: {message: string}) {
  return <div className="empty">{message}</div>;
}

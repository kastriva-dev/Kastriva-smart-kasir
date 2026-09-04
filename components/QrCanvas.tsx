"use client";
import {useEffect, useRef, useState} from "react";
import QRCode from "qrcode";

/**
 * QR di-render lokal di canvas.
 * Sebelumnya QR dibuat lewat api.qrserver.com, artinya URL toko/meja dikirim
 * ke pihak ketiga dan QR gagal tampil saat offline.
 */
export default function QrCanvas({value, size = 240, alt}: {value: string; size?: number; alt?: string}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !value) return;
    let cancelled = false;
    QRCode.toCanvas(canvas, value, {
      width: size,
      margin: 1,
      errorCorrectionLevel: "M",
      color: {dark: "#06111f", light: "#ffffff"}
    })
      .then(() => {
        if (!cancelled) setError("");
      })
      .catch(() => {
        if (!cancelled) setError("QR gagal dibuat");
      });
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  return (
    <div className="qrBox">
      <canvas ref={ref} role="img" aria-label={alt || `QR untuk ${value}`} />
      {error ? <p className="muted">{error}</p> : null}
    </div>
  );
}

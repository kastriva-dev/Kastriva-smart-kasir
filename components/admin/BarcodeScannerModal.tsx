"use client";
import {useEffect, useRef, useState} from "react";
import {Camera, X} from "lucide-react";
import {normalizeScannedBarcode} from "@/lib/hardware";

type DetectedBarcode = {rawValue?: string};
type BarcodeDetectorLike = {detect(source: CanvasImageSource): Promise<DetectedBarcode[]>};
type BarcodeDetectorCtor = new (options?: {formats?: string[]}) => BarcodeDetectorLike;

export default function BarcodeScannerModal({onScan, onClose}: {onScan: (barcode: string) => void; onClose: () => void}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const stop = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    };
    const run = async () => {
      const Ctor = (window as Window & {BarcodeDetector?: BarcodeDetectorCtor}).BarcodeDetector;
      if (!Ctor) {
        setError("Pemindai kamera belum didukung browser ini. Gunakan Chrome/Edge terbaru atau scanner USB.");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({video: {facingMode: {ideal: "environment"}}, audio: false});
        if (cancelled) { stream.getTracks().forEach(track => track.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        const detector = new Ctor({formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf", "qr_code"]});
        const scan = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            const value = normalizeScannedBarcode(codes[0]?.rawValue || "");
            if (value) {
              stop();
              onScan(value);
              return;
            }
          } catch { /* frame belum siap */ }
          timerRef.current = setTimeout(scan, 220);
        };
        scan();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Kamera tidak dapat dibuka");
      }
    };
    run();
    return () => { cancelled = true; stop(); };
  }, [onScan]);

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Scan barcode kamera">
      <div className="modalCard glass">
        <div className="split">
          <h2><Camera size={18} aria-hidden="true" /> Scan Barcode</h2>
          <button type="button" className="iconBtn" aria-label="Tutup scanner" onClick={onClose}><X size={17} /></button>
        </div>
        {error ? <p className="alert error">{error}</p> : (
          <>
            <div className="scannerView"><video ref={videoRef} playsInline muted /></div>
            <p className="muted">Arahkan barcode ke tengah kamera. Pemindaian berhenti otomatis setelah kode terbaca.</p>
          </>
        )}
      </div>
    </div>
  );
}

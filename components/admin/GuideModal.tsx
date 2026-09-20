"use client";
import {useState} from "react";
import {X} from "lucide-react";
import {guideSections} from "@/components/admin/guide-content";

/** Modal panduan penggunaan untuk pembeli aplikasi. */
export default function GuideModal({onClose}: {onClose: () => void}) {
  const [active, setActive] = useState(guideSections[0].id);
  const topic = guideSections.find(t => t.id === active) || guideSections[0];

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
              Versi ringkas. Untuk tampilan penuh, buka halaman <b>Panduan</b> di sidebar atau ikon bantuan di header.
            </p>
          </div>
          <button type="button" className="iconBtn" aria-label="Tutup panduan" onClick={onClose}>
            <X size={17} aria-hidden="true" />
          </button>
        </div>

        <div className="guideChips" role="tablist" aria-label="Topik panduan">
          {guideSections.map(t => (
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
          Panduan lengkap juga tersedia di halaman <b>Panduan</b> dan file <code>PANDUAN.md</code>.
        </p>
      </div>
    </div>
  );
}

"use client";
import type {ReactNode} from "react";
import {BookMarked, CheckCircle2, FileText, LifeBuoy, Sparkles} from "lucide-react";
import {guideSections} from "@/components/admin/guide-content";

function SummaryCard({icon, title, text}: {icon: ReactNode; title: string; text: string}) {
  return (
    <div className="card glass guideSummaryCard">
      <div className="guideSummaryIcon">{icon}</div>
      <div>
        <h3>{title}</h3>
        <p className="muted">{text}</p>
      </div>
    </div>
  );
}

export default function GuidePage() {
  return (
    <div className="guidePage">
      <section className="card glass guideHero">
        <div>
          <span className="badge"><BookMarked size={13} aria-hidden="true" /> Panduan Lengkap</span>
          <h2>Panduan Kastriva Smart Kasir</h2>
          <p className="muted">
            Semua panduan fitur sekarang dirangkum dalam <b>1 halaman penuh</b> agar lebih rapi, enak dibaca,
            dan mudah dipakai saat belajar atau training karyawan baru.
          </p>
        </div>
        <div className="guideHeroStats">
          <div className="guideHeroStat"><b>{guideSections.length}</b><span>Topik utama</span></div>
          <div className="guideHeroStat"><b>1</b><span>Halaman panduan</span></div>
          <div className="guideHeroStat"><b>Full</b><span>Semua fitur</span></div>
        </div>
      </section>

      <section className="guideSummaryGrid">
        <SummaryCard icon={<Sparkles size={18} aria-hidden="true" />} title="Mulai Cepat" text="Cocok untuk owner atau kasir baru agar tahu alur setup dan transaksi pertama." />
        <SummaryCard icon={<CheckCircle2 size={18} aria-hidden="true" />} title="Operasional Harian" text="Mencakup POS, Pesanan, Dapur, Meja, Inventory, Shift, hingga Hardware POS." />
        <SummaryCard icon={<FileText size={18} aria-hidden="true" />} title="Owner & SaaS" text="Mencakup outlet, analytics, subscription, lisensi KSP1, dan backup bisnis." />
        <SummaryCard icon={<LifeBuoy size={18} aria-hidden="true" />} title="Support" text="Berisi PWA, offline mode, troubleshooting, serta langkah deploy dan maintenance." />
      </section>

      <section className="guideLayout">
        <aside className="card glass guideToc">
          <h3>Daftar Isi</h3>
          <p className="muted">Klik topik untuk lompat ke bagian terkait.</p>
          <div className="guideTocLinks">
            {guideSections.map((section, index) => (
              <a key={section.id} href={`#${section.id}`} className="guideTocLink">
                <span className="guideTocNumber">{String(index + 1).padStart(2, "0")}</span>
                <span>
                  <b>{section.label}</b>
                  <small>{section.summary}</small>
                </span>
              </a>
            ))}
          </div>
        </aside>

        <div className="guideSections">
          {guideSections.map((section, index) => (
            <section key={section.id} id={section.id} className="card glass guideSectionCard">
              <div className="guideSectionHead">
                <div className="guideSectionNumber">{String(index + 1).padStart(2, "0")}</div>
                <div>
                  <h3>{section.label}</h3>
                  <p className="muted">{section.summary}</p>
                </div>
              </div>
              <div className="guideSectionBody">{section.body}</div>
            </section>
          ))}
        </div>
      </section>

      <section className="card glass guideFooterNote">
        <h3>Catatan Penting</h3>
        <ul>
          <li>Gunakan halaman ini sebagai pusat panduan untuk owner, admin, kasir, kitchen, maupun staff training.</li>
          <li>Bila diperlukan, isi panduan ini dapat terus ditambah tanpa mengubah alur fitur utama aplikasi.</li>
          <li>Dokumentasi cadangan tetap tersedia di file <code>PANDUAN.md</code> pada folder project.</li>
        </ul>
      </section>
    </div>
  );
}

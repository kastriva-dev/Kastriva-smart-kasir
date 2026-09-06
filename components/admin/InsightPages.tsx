"use client";
import {useEffect, useMemo, useState} from "react";
import {Download, QrCode, RefreshCw} from "lucide-react";
import QrCanvas from "@/components/QrCanvas";
import {STORE_ID, rupiah} from "@/lib/data";
import {formatClock, gasCall, type GasInventory, type GasOrder, type GasReport, type GasSettings, type GasTable} from "@/lib/api";
import {useResource} from "@/components/admin/useResource";
import {EmptyState, ErrorState, Field, Skeleton} from "@/components/admin/ui";

/* ================= Dashboard ================= */

export function Dashboard({tables, setPage}: {tables: GasTable[]; setPage: (page: string) => void}) {
  const reportRes = useResource<GasReport>(() => gasCall<GasReport>("getReport", {range: "today"}), 30_000);
  const ordersRes = useResource<GasOrder[]>(() => gasCall<GasOrder[]>("getOrders", {limit: 50}), 20_000);
  const invRes = useResource<GasInventory[]>(() => gasCall<GasInventory[]>("getInventory"), 120_000);

  const report = reportRes.data;
  const orders = useMemo(() => ordersRes.data || [], [ordersRes.data]);
  const inventory = useMemo(() => invRes.data || [], [invRes.data]);
  const lowStock = inventory.filter(item => Number(item.stock) <= Number(item.parLevel));
  const occupied = useMemo(() => {
    const active = new Set(
      orders.filter(o => !["PAID", "CANCELLED"].includes(o.status) && o.tableCode).map(o => o.tableCode.toLowerCase())
    );
    return tables.filter(t => active.has(String(t.code).toLowerCase())).length;
  }, [orders, tables]);

  const count = (status: string) => orders.filter(o => o.status === status).length;
  const maxSeries = Math.max(1, ...(report?.series || []).map(p => p.total));

  return (
    <div className="grid" style={{gap: 16}}>
      <div className="grid stats">
        <Stat label="Penjualan Hari Ini" value={report ? rupiah(report.netSales) : "…"} trend={`${report?.orderCount ?? 0} order`} />
        <Stat label="Rata-rata Check" value={report ? rupiah(report.avgCheck) : "…"} trend="gross margin terjaga" />
        <Stat label="Sudah Dibayar" value={String(report?.statusCount?.PAID ?? 0)} trend="transaksi lunas" />
        <Stat label="Meja Terisi" value={`${occupied} / ${tables.length}`} trend="occupancy real-time" />
      </div>

      <div className="grid layout2">
        <div className="card glass">
          <div className="split">
            <div>
              <h2>Penjualan 7 Hari</h2>
              <p className="muted">Net sales per hari</p>
            </div>
            <button type="button" className="btn" onClick={() => setPage("Laporan")}>
              Laporan lengkap
            </button>
          </div>
          {reportRes.loading && !report ? (
            <Skeleton rows={4} />
          ) : reportRes.error ? (
            <ErrorState message={reportRes.error} setup={reportRes.setup} onRetry={reportRes.reload} />
          ) : (
            <>
              <div className="chart">
                {(report?.series || []).slice(-7).map(point => (
                  <div
                    key={point.date}
                    className="chartBar"
                    style={{height: `${Math.max(4, (point.total / maxSeries) * 100)}%`}}
                    title={`${point.date}: ${rupiah(point.total)}`}
                  />
                ))}
              </div>
              <div className="split">
                <span className="muted">7 hari lalu</span>
                <span className="muted">Hari ini</span>
              </div>
            </>
          )}
        </div>

        <div className="card glass">
          <h2>Live Operations</h2>
          <div className="grid" style={{gap: 10}}>
            <Live label="Order baru" value={String(count("NEW"))} tone="amber" />
            <Live label="Dimasak" value={String(count("COOKING"))} tone="green" />
            <Live label="Siap saji" value={String(count("READY"))} tone="green" />
            <Live label="Belum bayar" value={String(count("SERVED"))} tone="amber" />
            <Live label="Stok kritis" value={String(lowStock.length)} tone={lowStock.length ? "amber" : "green"} />
          </div>
        </div>
      </div>

      <div className="grid layout3">
        <div className="card glass">
          <h3>Pesanan Terbaru</h3>
          {ordersRes.loading && !orders.length ? (
            <Skeleton rows={3} />
          ) : orders.length === 0 ? (
            <EmptyState message="Belum ada pesanan hari ini." />
          ) : (
            orders.slice(0, 5).map(order => (
              <div className="cartLine" key={order.id}>
                <div>
                  <b>{order.id}</b>
                  <div className="muted">
                    {order.tableCode || "Takeaway"} • {formatClock(order.createdAt)}
                  </div>
                </div>
                <div style={{textAlign: "right"}}>
                  <b>{rupiah(order.total)}</b>
                  <br />
                  <span className="badge">{order.status}</span>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="card glass">
          <h3>Menu Terlaris</h3>
          {(report?.topItems || []).length === 0 ? (
            <EmptyState message="Belum ada penjualan." />
          ) : (
            (report?.topItems || []).slice(0, 5).map(item => {
              const max = Math.max(1, ...(report?.topItems || []).map(t => t.qty));
              return (
                <div key={item.name} style={{marginBottom: 14}}>
                  <div className="split">
                    <span>{item.name}</span>
                    <b>{item.qty}×</b>
                  </div>
                  <div className="bar" style={{marginTop: 7}}>
                    <i style={{width: `${(item.qty / max) * 100}%`}} />
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="card glass">
          <h3>Manager Alerts</h3>
          {lowStock.length === 0 ? (
            <p className="muted">Semua stok aman di atas par level.</p>
          ) : (
            lowStock.slice(0, 4).map(item => (
              <p className="muted" key={item.id}>
                {item.name}: sisa {item.stock} {item.unit} (par {item.parLevel})
              </p>
            ))
          )}
          <button type="button" className="btn primary" style={{marginTop: 12}} onClick={() => setPage("Inventory")}>
            Review inventory
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({label, value, trend}: {label: string; value: string; trend: string}) {
  return (
    <div className="stat glass">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      <div className="trend">{trend}</div>
    </div>
  );
}

function Live({label, value, tone}: {label: string; value: string; tone: "green" | "amber"}) {
  return (
    <div className="split rowLine">
      <span>{label}</span>
      <span className={`badge ${tone}`}>{value}</span>
    </div>
  );
}

/* ================= Laporan ================= */

const RANGES = [
  ["today", "Hari Ini"],
  ["7d", "7 Hari"],
  ["30d", "30 Hari"]
] as const;

export function ReportsPage() {
  const [range, setRange] = useState<"today" | "7d" | "30d">("today");
  const reportRes = useResource<GasReport>(() => gasCall<GasReport>("getReport", {range}), 60_000);
  const report = reportRes.data;
  const maxSeries = Math.max(1, ...(report?.series || []).map(p => p.total));
  const mix = Object.entries(report?.paymentMix || {});
  const mixTotal = Math.max(1, mix.reduce((sum, [, v]) => sum + v, 0));

  const exportCsv = () => {
    if (!report) return;
    const lines: string[] = [];
    lines.push(`Laporan Kastriva,${report.range}`);
    lines.push(`Order,${report.orderCount}`);
    lines.push(`Gross Sales,${report.grossSales}`);
    lines.push(`Diskon,${report.discount}`);
    lines.push(`Pajak,${report.tax}`);
    lines.push(`Service,${report.service}`);
    lines.push(`Net Sales,${report.netSales}`);
    lines.push("");
    lines.push("Tanggal,Total");
    report.series.forEach(p => lines.push(`${p.date},${p.total}`));
    lines.push("");
    lines.push("Metode,Total");
    mix.forEach(([k, v]) => lines.push(`${k},${v}`));
    lines.push("");
    lines.push("Menu,Qty,Revenue");
    report.topItems.forEach(t => lines.push(`"${t.name}",${t.qty},${t.revenue}`));
    const blob = new Blob([lines.join("\n")], {type: "text/csv;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kastriva-laporan-${report.range}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="grid layout2">
      <div className="card glass">
        <div className="split">
          <div>
            <h2>Executive Reports</h2>
            <p className="muted">Sales, pajak, service, dan margin — data live dari backend</p>
          </div>
          <div className="btnRow">
            <button type="button" className="iconBtn" aria-label="Muat ulang" onClick={reportRes.reload}>
              <RefreshCw size={16} aria-hidden="true" />
            </button>
            <button type="button" className="btn" onClick={exportCsv} disabled={!report}>
              <Download size={15} aria-hidden="true" /> CSV
            </button>
          </div>
        </div>

        <div className="catRow" style={{margin: "10px 0"}}>
          {RANGES.map(([value, label]) => (
            <button
              type="button"
              key={value}
              className={`btn cat ${range === value ? "primary" : ""}`}
              onClick={() => setRange(value)}
            >
              {label}
            </button>
          ))}
        </div>

        {reportRes.loading && !report ? (
          <Skeleton rows={5} />
        ) : reportRes.error ? (
          <ErrorState message={reportRes.error} setup={reportRes.setup} onRetry={reportRes.reload} />
        ) : report ? (
          <>
            {[
              ["Order", String(report.orderCount)],
              ["Gross Sales", rupiah(report.grossSales)],
              ["Diskon", rupiah(report.discount)],
              ["Pajak", rupiah(report.tax)],
              ["Service", rupiah(report.service)],
              ["Net Sales", rupiah(report.netSales)],
              ["Rata-rata Check", rupiah(report.avgCheck)]
            ].map(([label, value]) => (
              <div className="split rowLine" key={label}>
                <span>{label}</span>
                <b>{value}</b>
              </div>
            ))}
          </>
        ) : null}
      </div>

      <div>
        <div className="card glass">
          <h2>Tren Penjualan</h2>
          <div className="chart">
            {(report?.series || []).map(point => (
              <div
                key={point.date}
                className="chartBar"
                style={{height: `${Math.max(4, (point.total / maxSeries) * 100)}%`}}
                title={`${point.date}: ${rupiah(point.total)}`}
              />
            ))}
          </div>
        </div>
        <div className="card glass" style={{marginTop: 14}}>
          <h2>Payment Mix</h2>
          {mix.length === 0 ? (
            <EmptyState message="Belum ada pembayaran pada rentang ini." />
          ) : (
            mix.map(([label, value]) => (
              <div style={{marginBottom: 15}} key={label}>
                <div className="split">
                  <span>{label}</span>
                  <b>{rupiah(value)}</b>
                </div>
                <div className="bar" style={{marginTop: 7}}>
                  <i style={{width: `${(value / mixTotal) * 100}%`}} />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/* ================= QR & Online ================= */

export function OnlinePage({tables}: {tables: GasTable[]}) {
  const [origin, setOrigin] = useState("");
  const [selected, setSelected] = useState("");
  useEffect(() => {
    setOrigin(window.location.origin);
    if (tables.length && !selected) setSelected(tables[0].code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables.length]);

  const table = tables.find(t => t.code === selected) || tables[0];
  const path = table ? `/customer/${STORE_ID}/${table.code}` : `/customer/${STORE_ID}`;
  const url = origin ? `${origin}${path}` : path;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* biarkan URL terlihat untuk disalin manual */
    }
  };

  return (
    <div className="grid layout2">
      <div className="card glass">
        <div className="split">
          <div>
            <h2>QR Ordering</h2>
            <p className="muted">Per-meja QR • digital menu • langsung masuk antrian kasir</p>
          </div>
          <QrCode aria-hidden="true" />
        </div>
        {tables.length ? (
          <Field label="Pilih meja">
            <select className="input" value={selected} onChange={e => setSelected(e.target.value)}>
              {tables.map(t => (
                <option key={t.id} value={t.code}>
                  {t.code} ({t.seats} kursi)
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <p className="muted">Tambahkan meja dulu di halaman Meja.</p>
        )}
        {table ? (
          <>
            <div style={{marginTop: 15, display: "grid", placeItems: "center"}}>
              <QrCanvas value={url} size={230} alt={`QR ${table.code}`} />
            </div>
            <p className="qr">{url}</p>
            <div className="btnRow">
              <button type="button" className="btn primary" onClick={copy}>
                Copy URL
              </button>
              <a className="btn" href={path} target="_blank" rel="noreferrer">
                Buka menu
              </a>
            </div>
          </>
        ) : null}
      </div>

      <div className="card glass">
        <h2>Alur Order Online</h2>
        <ol className="muted" style={{lineHeight: 2, paddingLeft: 18}}>
          <li>Tamu scan QR di meja.</li>
          <li>Menu tampil real-time (stok & harga dari backend).</li>
          <li>Pesanan masuk ke sheet Orders dengan channel QR.</li>
          <li>Kasir memantau di halaman Pesanan / Dapur.</li>
          <li>Setelah selesai, kasir memproses pembayaran & struk.</li>
        </ol>
        <p className="muted">Tautan contoh: <code>{path}</code></p>
      </div>
    </div>
  );
}

/* ================= Pengaturan ================= */

export function SettingsPage({settings, reloadSettings, notify}: {
  settings: GasSettings | null;
  reloadSettings: () => void;
  notify: (message: string) => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [taxRate, setTaxRate] = useState("");
  const [serviceRate, setServiceRate] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setName(settings.storeName || "");
    setPhone(settings.phone || "");
    setAddress(settings.address || "");
    setTaxRate(String(settings.taxRate ?? 0));
    setServiceRate(String(settings.serviceRate ?? 0));
  }, [settings]);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await gasCall("saveSettings", {
        storeId: settings?.storeId,
        name,
        phone,
        address,
        taxRate: Number(taxRate) || 0,
        serviceRate: Number(serviceRate) || 0
      });
      reloadSettings();
      notify("Pengaturan tersimpan");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Gagal menyimpan pengaturan");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid layout2">
      <div className="card glass">
        <h2>Store Profile</h2>
        <p className="muted">Nama, pajak, dan service charge dipakai POS & halaman customer.</p>
        <div className="formGrid" style={{marginTop: 10}}>
          <Field label="Nama bisnis">
            <input className="input" value={name} maxLength={120} onChange={e => setName(e.target.value)} />
          </Field>
          <Field label="Telepon">
            <input className="input" inputMode="tel" value={phone} maxLength={20}
              onChange={e => setPhone(e.target.value.replace(/[^\d+]/g, ""))} />
          </Field>
          <Field label="Alamat">
            <input className="input" value={address} maxLength={300} onChange={e => setAddress(e.target.value)} />
          </Field>
          <Field label="Pajak (%)">
            <input className="input" inputMode="decimal" value={taxRate}
              onChange={e => setTaxRate(e.target.value.replace(/[^\d.]/g, ""))} />
          </Field>
          <Field label="Service charge (%)">
            <input className="input" inputMode="decimal" value={serviceRate}
              onChange={e => setServiceRate(e.target.value.replace(/[^\d.]/g, ""))} />
          </Field>
        </div>
        <button type="button" className="btn primary fullWidth" style={{marginTop: 14}} disabled={busy} onClick={save}>
          {busy ? "Menyimpan..." : "Simpan Pengaturan"}
        </button>
      </div>

      <div className="card glass">
        <h2>Integrasi & Keamanan</h2>
        {[
          ["Login admin", "Session HMAC + scrypt password"],
          ["Backend", "Google Apps Script + Google Sheets"],
          ["Audit log", "Setiap transaksi & perubahan tercatat"],
          ["PWA", "Installable, offline shell, queue order"],
          ["QRIS / Payment Gateway", "Catat manual via metode bayar"],
          ["WhatsApp", "Handoff pesanan pelanggan"]
        ].map(([label, desc]) => (
          <div className="split rowLine" key={label}>
            <span>
              <b>{label}</b>
              <br />
              <span className="muted">{desc}</span>
            </span>
            <span className="badge green">Aktif</span>
          </div>
        ))}
      </div>
    </div>
  );
}

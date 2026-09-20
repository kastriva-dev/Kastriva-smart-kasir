"use client";
import {useMemo, useState} from "react";
import {Clock3, LockKeyhole, PlayCircle, RefreshCw, StopCircle} from "lucide-react";
import {gasCall, type GasShift, type SessionInfo} from "@/lib/api";
import {rupiah} from "@/lib/data";
import {useResource} from "@/components/admin/useResource";
import {EmptyState, ErrorState, Field, Modal, Skeleton} from "@/components/admin/ui";

export default function ShiftPage({session, notify}: {session: SessionInfo; notify:(m:string)=>void}) {
  const currentRes = useResource<GasShift | null>(() => gasCall<GasShift | null>("getCurrentShift"), 15_000);
  const shiftsRes = useResource<GasShift[]>(() => gasCall<GasShift[]>("getShifts", {limit: 100}), 30_000);
  const [openModal, setOpenModal] = useState(false);
  const [closeModal, setCloseModal] = useState(false);
  const [openingCash, setOpeningCash] = useState("0");
  const [closingCash, setClosingCash] = useState("0");
  const [registerId, setRegisterId] = useState("REG-01");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const current = currentRes.data || null;
  const rows = shiftsRes.data || [];
  const canOwnShift = session.role !== "admin";

  const todayRows = useMemo(() => rows.slice(0, 30), [rows]);
  const reload = () => { currentRes.reload(); shiftsRes.reload(); };

  const openShift = async () => {
    if (busy) return; setBusy(true);
    try {
      await gasCall("openShift", {openingCash:Number(openingCash.replace(/\D/g,""))||0, registerId, note});
      notify("Shift berhasil dibuka"); setOpenModal(false); setNote(""); reload();
    } catch(e) { notify(e instanceof Error ? e.message : "Gagal membuka shift"); }
    finally { setBusy(false); }
  };

  const closeShift = async () => {
    if (busy) return; setBusy(true);
    try {
      const shift = await gasCall<GasShift>("closeShift", {closingCash:Number(closingCash.replace(/\D/g,""))||0, note});
      notify(`Shift ditutup • selisih ${rupiah(Number(shift.difference)||0)}`);
      setCloseModal(false); setNote(""); reload();
    } catch(e) { notify(e instanceof Error ? e.message : "Gagal menutup shift"); }
    finally { setBusy(false); }
  };

  return <div>
    <div className="split" style={{marginBottom:12}}>
      <div><h2>Shift Kasir</h2><p className="muted">Buka/tutup shift, modal awal, dan rekonsiliasi kas per staff.</p></div>
      <button className="iconBtn" type="button" aria-label="Muat ulang" onClick={reload}><RefreshCw size={16}/></button>
    </div>

    {currentRes.error ? <ErrorState message={currentRes.error} setup={currentRes.setup} onRetry={reload}/> : null}
    {currentRes.loading && currentRes.data === null ? <Skeleton/> : null}

    <div className="grid autoFit">
      <div className="card glass">
        <div className="split"><h3>Session</h3><span className="badge green">{String(session.role || "-").toUpperCase()}</span></div>
        <p><b>{session.name || session.username}</b></p>
        <p className="muted">Identitas ini dicatat otomatis pada transaksi dan audit log.</p>
      </div>
      <div className="card glass">
        <div className="split"><h3>Shift Aktif</h3><Clock3 size={18}/></div>
        {current ? <>
          <p><b>{current.id}</b> • {current.registerId}</p>
          <p className="muted">Buka {new Date(current.openedAt).toLocaleString("id-ID")} • Modal {rupiah(Number(current.openingCash)||0)}</p>
          <button className="btn danger" type="button" onClick={()=>setCloseModal(true)}><StopCircle size={15}/> Tutup Shift</button>
        </> : canOwnShift ? <>
          <p className="muted">Belum ada shift aktif. Transaksi POS/pembayaran staff akan ditolak sampai shift dibuka.</p>
          <button className="btn primary" type="button" onClick={()=>setOpenModal(true)}><PlayCircle size={15}/> Buka Shift</button>
        </> : <p className="muted">Login Admin tidak membutuhkan shift. Staff harus login dengan PIN untuk membuka shift.</p>}
      </div>
    </div>

    <div className="card glass" style={{marginTop:14}}>
      <div className="split"><div><h3>Riwayat Shift</h3><p className="muted">{todayRows.length} shift terakhir</p></div><LockKeyhole size={18}/></div>
      {!todayRows.length ? <EmptyState message="Belum ada riwayat shift."/> : <div className="tableWrap"><table className="data"><thead><tr><th>Staff</th><th>Register</th><th>Status</th><th>Modal</th><th>Cash Sales</th><th>Expected</th><th>Closing</th><th>Selisih</th></tr></thead><tbody>
        {todayRows.map(s => <tr key={s.id}><td><b>{s.staffName}</b><br/><span className="muted">{s.role}</span></td><td>{s.registerId}</td><td><span className={`badge ${s.status === "OPEN" ? "green" : ""}`}>{s.status}</span></td><td>{rupiah(Number(s.openingCash)||0)}</td><td>{s.cashSales === "" || s.cashSales == null ? "—" : rupiah(Number(s.cashSales)||0)}</td><td>{s.expectedCash === "" || s.expectedCash == null ? "—" : rupiah(Number(s.expectedCash)||0)}</td><td>{s.closingCash === "" || s.closingCash == null ? "—" : rupiah(Number(s.closingCash)||0)}</td><td>{s.difference === "" || s.difference == null ? "—" : rupiah(Number(s.difference)||0)}</td></tr>)}
      </tbody></table></div>}
    </div>

    {openModal ? <Modal title="Buka Shift" onClose={()=>setOpenModal(false)}><Field label="Register"><input className="input" value={registerId} maxLength={32} onChange={e=>setRegisterId(e.target.value)}/></Field><Field label="Modal awal"><input className="input" inputMode="numeric" value={openingCash} onChange={e=>setOpeningCash(e.target.value.replace(/\D/g,""))}/></Field><Field label="Catatan"><input className="input" value={note} maxLength={300} onChange={e=>setNote(e.target.value)}/></Field><button className="btn primary fullWidth" style={{marginTop:12}} disabled={busy} onClick={openShift}>{busy?"Membuka...":"Mulai Shift"}</button></Modal> : null}
    {closeModal ? <Modal title="Tutup Shift" onClose={()=>setCloseModal(false)}><Field label="Uang tunai fisik di laci"><input className="input" autoFocus inputMode="numeric" value={closingCash} onChange={e=>setClosingCash(e.target.value.replace(/\D/g,""))}/></Field><Field label="Catatan penutupan"><input className="input" value={note} maxLength={300} onChange={e=>setNote(e.target.value)}/></Field><p className="muted">Sistem menghitung expected cash = modal awal + penjualan tunai − refund tunai, lalu menyimpan selisih.</p><button className="btn danger fullWidth" style={{marginTop:12}} disabled={busy} onClick={closeShift}>{busy?"Menutup...":"Tutup & Rekonsiliasi"}</button></Modal> : null}
  </div>;
}

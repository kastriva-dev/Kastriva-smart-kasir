"use client";
import {useEffect, useState} from "react";
import {Activity, Building2, CloudDownload, Crown, KeyRound, Plus, RefreshCw} from "lucide-react";
import {gasCall, type GasAdvancedAnalytics, type GasBackup, type GasOwnerDashboard, type GasStore, type GasSubscription, type GasSyncState} from "@/lib/api";
import {rupiah} from "@/lib/data";
import {useResource} from "@/components/admin/useResource";
import {EmptyState, ErrorState, Field, Modal, Skeleton} from "@/components/admin/ui";

export function OwnerSaasPage({notify, selectedStoreId}: {notify:(message:string)=>void; selectedStoreId?:string|null}) {
  const ownerRes = useResource<GasOwnerDashboard>(() => gasCall("getOwnerDashboard", {range:"30d"}), 60_000);
  const storesRes = useResource<GasStore[]>(() => gasCall("getStores"), 120_000);
  const subRes = useResource<GasSubscription>(() => gasCall("getSubscription"), 120_000);
  const syncRes = useResource<GasSyncState>(() => gasCall("getSyncState", selectedStoreId ? {storeId:selectedStoreId} : {}), 30_000);
  const [addOpen,setAddOpen]=useState(false);
  const [name,setName]=useState(""); const [slug,setSlug]=useState(""); const [phone,setPhone]=useState(""); const [address,setAddress]=useState("");
  const [saving,setSaving]=useState(false); const [license,setLicense]=useState(""); const [activating,setActivating]=useState(false); const [backingUp,setBackingUp]=useState(false);
  const owner=ownerRes.data; const sub=subRes.data; const stores=storesRes.data||[];

  const saveOutlet=async()=>{
    if(saving) return; setSaving(true);
    try{
      await gasCall("saveStore",{name,slug,phone,address,active:true});
      notify("Outlet baru berhasil dibuat"); setAddOpen(false); setName("");setSlug("");setPhone("");setAddress(""); storesRes.reload(); ownerRes.reload();
    }catch(e){notify(e instanceof Error?e.message:"Gagal membuat outlet");} finally{setSaving(false);}
  };

  const activate=async()=>{
    if(!license.trim()||activating) return; setActivating(true);
    try{
      const res=await fetch("/api/license/activate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({code:license.trim()})});
      const body=await res.json() as {ok?:boolean;error?:string};
      if(!res.ok||!body.ok) throw new Error(body.error||"Aktivasi gagal");
      notify("Lisensi berhasil diaktifkan"); setLicense(""); subRes.reload(); storesRes.reload();
    }catch(e){notify(e instanceof Error?e.message:"Aktivasi lisensi gagal");} finally{setActivating(false);}
  };

  const backup=async()=>{
    if(backingUp) return; setBackingUp(true);
    try{
      const data=await gasCall<GasBackup>("exportBackup", selectedStoreId?{storeId:selectedStoreId}:{});
      const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json;charset=utf-8"});
      const url=URL.createObjectURL(blob); const a=document.createElement("a");
      const safe=(data.store?.slug||data.store?.id||"outlet").replace(/[^a-z0-9-]+/gi,"-");
      a.href=url; a.download=`kastriva-backup-${safe}-${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(url);
      notify("Backup outlet berhasil diunduh");
    }catch(e){notify(e instanceof Error?e.message:"Backup gagal");} finally{setBackingUp(false);}
  };

  return <div className="grid" style={{gap:16}}>
    <div className="grid stats">
      <Metric label="Net Sales 30 Hari" value={owner?rupiah(owner.totals.netSales):"…"} />
      <Metric label="Gross Profit" value={owner?rupiah(owner.totals.grossProfit):"…"} />
      <Metric label="Order Lunas" value={String(owner?.totals.orders??"…")} />
      <Metric label="Outlet Aktif" value={`${stores.length} / ${sub?.maxOutlets ?? "…"}`} />
    </div>

    <div className="grid layout2">
      <div className="card glass">
        <div className="split"><div><h2><Crown size={18}/> Owner Dashboard</h2><p className="muted">Ringkasan lintas outlet selama 30 hari.</p></div><button className="iconBtn" onClick={ownerRes.reload} aria-label="Refresh"><RefreshCw size={16}/></button></div>
        {ownerRes.loading&&!owner?<Skeleton rows={4}/>:ownerRes.error?<ErrorState message={ownerRes.error} setup={ownerRes.setup} onRetry={ownerRes.reload}/>:!owner?.outlets.length?<EmptyState message="Belum ada outlet."/>:
          owner.outlets.map(outlet=><div className="rowLine" key={outlet.storeId} style={{padding:"12px 0"}}><div className="split"><div><b>{outlet.name}</b><div className="muted">{outlet.orders} order • stok kritis {outlet.lowStock}</div></div><div style={{textAlign:"right"}}><b>{rupiah(outlet.netSales)}</b><div className="muted">profit {rupiah(outlet.grossProfit)} • {outlet.grossMargin}%</div></div></div></div>)}
      </div>

      <div className="card glass">
        <div className="split"><div><h2><KeyRound size={18}/> Subscription</h2><p className="muted">Trial dan lisensi diverifikasi di server.</p></div><span className={`badge ${sub?.isActive?"green":"red"}`}>{sub?.status||"…"}</span></div>
        <div className="rowLine"><b>Paket</b><span>{sub?.plan||"-"}</span></div>
        <div className="rowLine"><b>Sisa masa aktif</b><span>{sub?.daysRemaining??0} hari</span></div>
        <div className="rowLine"><b>Batas outlet</b><span>{sub?.maxOutlets??"-"}</span></div>
        <div className="rowLine"><b>Installation ID</b><span style={{fontFamily:"monospace",fontSize:12}}>{sub?.installationId||"-"}</span></div>
        <Field label="Kode lisensi KSP1"><textarea className="input" rows={3} value={license} onChange={e=>setLicense(e.target.value)} placeholder="KSP1...."/></Field>
        <button className="btn primary fullWidth" disabled={activating||!license.trim()} onClick={activate}>{activating?"Mengaktifkan...":"Aktifkan Lisensi"}</button>
      </div>
    </div>

    <div className="grid layout2">
      <div className="card glass">
        <div className="split"><div><h2><Building2 size={18}/> Multi Outlet</h2><p className="muted">Owner dapat membuat outlet sampai batas paket.</p></div><button className="btn primary" onClick={()=>setAddOpen(true)}><Plus size={15}/> Outlet</button></div>
        {stores.map(s=><div className="split rowLine" key={s.id}><span><b>{s.name}</b><br/><span className="muted">/{s.slug} • {s.address||"alamat belum diisi"}</span></span><span className={`badge ${s.active===false?"red":"green"}`}>{s.active===false?"NONAKTIF":"AKTIF"}</span></div>)}
      </div>
      <div className="card glass">
        <h2><Activity size={18}/> Cloud Sync & Backup</h2>
        <p className="muted">Google Sheets menjadi source of truth cloud untuk semua perangkat. Status di bawah berasal dari outlet aktif.</p>
        <div className="rowLine"><b>Server time</b><span>{syncRes.data?.serverTime?new Date(syncRes.data.serverTime).toLocaleString("id-ID"):"-"}</span></div>
        <div className="rowLine"><b>Perubahan terakhir</b><span>{syncRes.data?.lastChangeAt?new Date(syncRes.data.lastChangeAt).toLocaleString("id-ID"):"Belum ada"}</span></div>
        <div className="rowLine"><b>Data cloud</b><span>{syncRes.data?`${syncRes.data.counts.orders} order • ${syncRes.data.counts.menu} menu • ${syncRes.data.counts.customers} customer`:"…"}</span></div>
        <button className="btn" style={{marginTop:12}} onClick={backup} disabled={backingUp}><CloudDownload size={15}/>{backingUp?"Membuat backup...":"Download Backup JSON"}</button>
        <p className="muted" style={{marginTop:10}}>Backup berisi data outlet aktif + checksum SHA-256. Simpan di lokasi terpisah dari Spreadsheet utama.</p>
      </div>
    </div>

    {addOpen?<Modal title="Tambah Outlet" onClose={()=>setAddOpen(false)}><div className="formGrid"><Field label="Nama outlet"><input className="input" value={name} onChange={e=>setName(e.target.value)} maxLength={120}/></Field><Field label="Slug"><input className="input" value={slug} onChange={e=>setSlug(e.target.value)} placeholder="karawang-barat" maxLength={64}/></Field><Field label="Telepon"><input className="input" value={phone} onChange={e=>setPhone(e.target.value)} maxLength={24}/></Field><Field label="Alamat"><input className="input" value={address} onChange={e=>setAddress(e.target.value)} maxLength={300}/></Field></div><button className="btn primary fullWidth" style={{marginTop:14}} disabled={saving||!name.trim()} onClick={saveOutlet}>{saving?"Menyimpan...":"Buat Outlet"}</button></Modal>:null}
  </div>;
}

export function AdvancedAnalyticsPage() {
  const [days,setDays]=useState(30);
  const analyticsRes=useResource<GasAdvancedAnalytics>(()=>gasCall("getAnalytics",{days}),60_000);
  useEffect(() => { analyticsRes.reload(); }, [days, analyticsRes.reload]);
  const data=analyticsRes.data;
  const max=(rows:{value:number}[]|undefined)=>Math.max(1,...(rows||[]).map(r=>r.value));
  return <div className="grid" style={{gap:16}}>
    <div className="split"><div><h2>Advanced Analytics</h2><p className="muted">Jam ramai, channel, staff, kategori, dan repeat customer untuk outlet aktif.</p></div><select className="input" style={{width:150}} value={days} onChange={e=>setDays(Number(e.target.value))}><option value={7}>7 Hari</option><option value={30}>30 Hari</option><option value={90}>90 Hari</option></select></div>
    <div className="grid stats"><Metric label="Order Lunas" value={String(data?.paidOrders??"…")}/><Metric label="Unique Customer" value={String(data?.uniqueCustomers??"…")}/><Metric label="Repeat Customer" value={String(data?.repeatCustomers??"…")}/><Metric label="Repeat Rate" value={`${data?.repeatRate??0}%`}/></div>
    {analyticsRes.error?<ErrorState message={analyticsRes.error} setup={analyticsRes.setup} onRetry={analyticsRes.reload}/>:analyticsRes.loading&&!data?<Skeleton rows={6}/>:<div className="grid layout2"><Breakdown title="Jam Penjualan" rows={data?.hourly||[]} max={max(data?.hourly)}/><Breakdown title="Channel" rows={data?.channel||[]} max={max(data?.channel)}/><Breakdown title="Penjualan per Staff" rows={data?.staff||[]} max={max(data?.staff)}/><Breakdown title="Kategori" rows={data?.category||[]} max={max(data?.category)}/></div>}
  </div>;
}

function Metric({label,value}:{label:string;value:string}){return <div className="stat glass"><div className="label">{label}</div><div className="value">{value}</div></div>}
function Breakdown({title,rows,max}:{title:string;rows:{label:string;value:number}[];max:number}){return <div className="card glass"><h3>{title}</h3>{rows.length===0?<p className="muted">Belum ada data.</p>:rows.slice(0,12).map(r=><div key={r.label} style={{marginBottom:12}}><div className="split"><span>{r.label}</span><b>{rupiah(r.value)}</b></div><div className="bar" style={{marginTop:6}}><i style={{width:`${Math.max(2,(r.value/max)*100)}%`}}/></div></div>)}</div>}

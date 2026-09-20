"use client";

import {useEffect, useState} from "react";
import {Check, Clipboard, KeyRound, LogOut, RefreshCw, ShieldCheck} from "lucide-react";

type SessionState = {configured:boolean;authenticated:boolean};
type Plan = "STARTER"|"PRO"|"BUSINESS";
type Generated = {
  code:string;
  payload:{licenseId:string;installationId:string;plan:Plan;activeUntil:string;maxOutlets:number};
  days:number;
  customer:string;
  issuedAt:string;
};

const OUTLET_DEFAULT: Record<Plan,number> = {STARTER:1,PRO:5,BUSINESS:20};

export default function LicenseCenter() {
  const [session,setSession]=useState<SessionState|null>(null);
  const [password,setPassword]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [customer,setCustomer]=useState("");
  const [installationId,setInstallationId]=useState("");
  const [plan,setPlan]=useState<Plan>("PRO");
  const [days,setDays]=useState(365);
  const [maxOutlets,setMaxOutlets]=useState(5);
  const [licenseId,setLicenseId]=useState("");
  const [generated,setGenerated]=useState<Generated|null>(null);
  const [copied,setCopied]=useState(false);

  useEffect(()=>{
    let active=true;
    fetch("/api/license-center/session",{cache:"no-store"})
      .then(res=>res.json())
      .then(body=>{if(active)setSession(body?.data||{configured:false,authenticated:false});})
      .catch(()=>{if(active)setSession({configured:false,authenticated:false});});
    return()=>{active=false;};
  },[]);

  const login=async(e:React.FormEvent)=>{
    e.preventDefault(); if(busy)return; setBusy(true);setError("");
    try{
      const res=await fetch("/api/license-center/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password})});
      const body=await res.json().catch(()=>({}));
      if(!res.ok||!body.ok)throw new Error(body.error||"Login gagal");
      setPassword(""); setSession({configured:true,authenticated:true});
    }catch(e){setError(e instanceof Error?e.message:"Login gagal");}finally{setBusy(false);}
  };

  const logout=async()=>{
    await fetch("/api/license-center/logout",{method:"POST"}).catch(()=>{});
    setGenerated(null);setSession(s=>s?{...s,authenticated:false}:{configured:true,authenticated:false});
  };

  const generate=async(e:React.FormEvent)=>{
    e.preventDefault(); if(busy)return; setBusy(true);setError("");setGenerated(null);setCopied(false);
    try{
      const res=await fetch("/api/license-center/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({customer,installationId,plan,days,maxOutlets,licenseId})});
      const body=await res.json().catch(()=>({}));
      if(res.status===401){setSession({configured:true,authenticated:false});throw new Error("Session berakhir. Login kembali.");}
      if(!res.ok||!body.ok)throw new Error(body.error||"Gagal membuat lisensi");
      setGenerated(body.data as Generated);
    }catch(e){setError(e instanceof Error?e.message:"Gagal membuat lisensi");}finally{setBusy(false);}
  };

  const copy=async()=>{
    if(!generated?.code)return;
    try{await navigator.clipboard.writeText(generated.code);setCopied(true);setTimeout(()=>setCopied(false),1800);}catch{setError("Clipboard tidak tersedia. Tekan lama kode lalu salin manual.");}
  };

  if(!session) return <main className="hero"><div className="loginWrap"><div className="card glass"><p className="muted">Memeriksa License Center...</p></div></div></main>;
  if(!session.configured) return <main className="hero"><div className="loginWrap"><div className="card glass">
    <h1>Kastriva License Center</h1><div className="alert error"><b>Belum dikonfigurasi.</b><p>Tambahkan <code>LICENSE_CENTER_AUTH_SECRET</code>, <code>LICENSE_CENTER_PASSWORD_HASH</code>, dan <code>LICENSE_SIGNING_SECRET</code> di Vercel lalu redeploy.</p></div>
  </div></div></main>;

  if(!session.authenticated) return <main className="hero"><div className="loginWrap"><div className="card glass">
    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}><ShieldCheck size={28}/><h1 style={{margin:0}}>Kastriva License Center</h1></div>
    <p className="muted">Portal khusus penerbit lisensi Kastriva. Login ini terpisah dari Admin POS pelanggan.</p>
    <form onSubmit={login}><label className="label">Password License Center<input className="input" type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required minLength={8}/></label>
      {error?<p className="alert error" role="alert">{error}</p>:null}
      <button className="btn primary fullWidth" style={{marginTop:16}} disabled={busy}>{busy?"Memeriksa...":"Masuk License Center"}</button>
    </form>
  </div></div></main>;

  return <main style={{minHeight:"100vh",padding:"28px 18px 48px",maxWidth:1100,margin:"0 auto"}}>
    <div className="split" style={{marginBottom:18,alignItems:"flex-start"}}><div><div style={{display:"flex",alignItems:"center",gap:10}}><KeyRound size={26}/><h1 style={{margin:0}}>Kastriva License Center</h1></div><p className="muted" style={{marginBottom:0}}>Buat kode KSP1 dari HP atau perangkat apa pun. Signing secret tetap berada di server.</p></div><button className="btn" onClick={logout}><LogOut size={15}/> Logout</button></div>

    <div className="grid layout2" style={{alignItems:"start"}}>
      <form className="card glass" onSubmit={generate}>
        <h2>Generate License</h2>
        <div className="formGrid">
          <label className="label">Customer / Nama usaha<input className="input" value={customer} onChange={e=>setCustomer(e.target.value)} placeholder="TOKO ABC" maxLength={80}/></label>
          <label className="label">Installation ID<input className="input" value={installationId} onChange={e=>setInstallationId(e.target.value.toUpperCase())} placeholder="INST-XXXXXXXXXXXXXX" required maxLength={80} autoCapitalize="characters"/></label>
          <label className="label">Paket<select className="input" value={plan} onChange={e=>{const p=e.target.value as Plan;setPlan(p);setMaxOutlets(OUTLET_DEFAULT[p]);}}><option>STARTER</option><option>PRO</option><option>BUSINESS</option></select></label>
          <label className="label">Batas outlet<input className="input" type="number" min={1} max={100} value={maxOutlets} onChange={e=>setMaxOutlets(Number(e.target.value))} required/></label>
          <label className="label">Masa aktif (hari)<input className="input" type="number" min={1} max={3650} value={days} onChange={e=>setDays(Number(e.target.value))} required/></label>
          <label className="label">License ID (opsional)<input className="input" value={licenseId} onChange={e=>setLicenseId(e.target.value.toUpperCase())} placeholder="Otomatis jika kosong" maxLength={100}/></label>
        </div>
        <div className="btnRow" style={{marginTop:12}}>{[30,90,365,730].map(n=><button key={n} type="button" className={`btn ${days===n?"primary":""}`} onClick={()=>setDays(n)}>{n===365?"1 Tahun":n===730?"2 Tahun":`${n} Hari`}</button>)}</div>
        <div className="rowLine" style={{marginTop:12}}><b>Perkiraan berakhir</b><span>{Number.isFinite(days)&&days>0?`${days} hari setelah kode dibuat`:"-"}</span></div>
        {error?<p className="alert error" role="alert">{error}</p>:null}
        <button className="btn primary fullWidth" style={{marginTop:16}} disabled={busy||!installationId.trim()}><KeyRound size={16}/>{busy?"Membuat...":"Generate KSP1"}</button>
      </form>

      <div className="card glass">
        <div className="split"><div><h2 style={{marginBottom:4}}>Hasil Lisensi</h2><p className="muted" style={{marginTop:0}}>Salin kode ini ke Owner & SaaS pelanggan.</p></div>{generated?<span className="badge green">SIGNED</span>:null}</div>
        {!generated?<div style={{padding:"24px 0"}}><p className="muted">Belum ada kode. Isi Installation ID dan paket lalu tekan Generate KSP1.</p></div>:<>
          <div className="rowLine"><b>License ID</b><span style={{fontFamily:"monospace",fontSize:12}}>{generated.payload.licenseId}</span></div>
          <div className="rowLine"><b>Installation ID</b><span style={{fontFamily:"monospace",fontSize:12}}>{generated.payload.installationId}</span></div>
          <div className="rowLine"><b>Paket</b><span>{generated.payload.plan} • {generated.payload.maxOutlets} outlet</span></div>
          <div className="rowLine"><b>Aktif sampai</b><span>{new Date(generated.payload.activeUntil).toLocaleString("id-ID",{dateStyle:"medium",timeStyle:"short"})}</span></div>
          <label className="label" style={{marginTop:12}}>Kode lisensi<textarea className="input" rows={8} readOnly value={generated.code} onFocus={e=>e.currentTarget.select()} style={{fontFamily:"monospace",fontSize:12}}/></label>
          <button className="btn primary fullWidth" onClick={copy} type="button">{copied?<Check size={16}/>:<Clipboard size={16}/>} {copied?"Tersalin":"Salin Kode Lisensi"}</button>
          <button className="btn fullWidth" style={{marginTop:8}} type="button" onClick={()=>{setGenerated(null);setLicenseId("");setError("");}}><RefreshCw size={15}/> Buat Lisensi Lain</button>
        </>}
      </div>
    </div>

    <div className="card glass" style={{marginTop:16}}><h3>Keamanan</h3><p className="muted" style={{marginBottom:0}}>Password License Center dan session-nya terpisah dari login Admin POS. <code>LICENSE_SIGNING_SECRET</code> tidak pernah dikirim ke browser. Jangan berikan password License Center kepada pelanggan.</p></div>
  </main>;
}

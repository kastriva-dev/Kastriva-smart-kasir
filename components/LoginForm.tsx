"use client";
import {useEffect, useState} from "react";
import {useRouter, useSearchParams} from "next/navigation";

type StaffOption = {id: string; name: string; role: string; storeId?: string; storeName?: string};

export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const nextPath = params.get("next") || "/";
  const [mode, setMode] = useState<"staff" | "admin">("staff");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [staffId, setStaffId] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/auth/staff", {cache: "no-store"})
      .then(r => r.json())
      .then(data => { if (data?.ok && Array.isArray(data.data)) setStaff(data.data); })
      .catch(() => {});
  }, []);

  const finish = (redirectTo?: string) => {
    router.replace(redirectTo || "/");
    router.refresh();
  };

  const submitAdmin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (busy) return; setBusy(true); setError("");
    try {
      const res = await fetch("/api/auth/login", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({username,password,next:nextPath})});
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) { setError(data.error || "Login gagal"); setPassword(""); return; }
      finish(data.data?.redirectTo);
    } catch { setError("Tidak dapat menghubungi server"); } finally { setBusy(false); }
  };

  const submitStaff = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (busy) return; setBusy(true); setError("");
    try {
      const res = await fetch("/api/auth/staff", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({staffId,pin,next:nextPath})});
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) { setError(data.error || "PIN salah"); setPin(""); return; }
      finish(data.data?.redirectTo);
    } catch { setError("Tidak dapat menghubungi server"); } finally { setBusy(false); }
  };

  return <div className="loginForm">
    <div className="segRow" style={{marginBottom:14}}>
      <button type="button" className={`seg ${mode === "staff" ? "segOn" : ""}`} onClick={() => {setMode("staff");setError("");}}>Staff / Kasir</button>
      <button type="button" className={`seg ${mode === "admin" ? "segOn" : ""}`} onClick={() => {setMode("admin");setError("");}}>Pemilik / Admin</button>
    </div>
    {mode === "staff" ? <form onSubmit={submitStaff}>
      <label className="label">Pilih staff
        <select className="input" required value={staffId} onChange={e => setStaffId(e.target.value)}>
          <option value="">-- Pilih nama --</option>
          {staff.map(s => <option key={s.id} value={s.id}>{s.name} • {s.role}{s.storeName ? ` • ${s.storeName}` : ""}</option>)}
        </select>
      </label>
      <label className="label" style={{marginTop:12}}>PIN 4-8 digit
        <input className="input" type="password" inputMode="numeric" autoComplete="off" pattern="[0-9]{4,8}" required value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0,8))}/>
      </label>
      {!staff.length ? <p className="muted">Belum ada staff aktif dengan PIN. Masuk sebagai Admin untuk membuat staff.</p> : null}
      {error ? <p className="alert error" role="alert">{error}</p> : null}
      <button type="submit" className="btn primary fullWidth" style={{marginTop:16}} disabled={busy || !staffId}>{busy ? "Memeriksa..." : "Masuk Shift"}</button>
    </form> : <form onSubmit={submitAdmin}>
      <label className="label">Username<input className="input" autoComplete="username" required value={username} onChange={e=>setUsername(e.target.value)}/></label>
      <label className="label" style={{marginTop:12}}>Password<input className="input" type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label>
      {error ? <p className="alert error" role="alert">{error}</p> : null}
      <button type="submit" className="btn primary fullWidth" style={{marginTop:16}} disabled={busy}>{busy ? "Memeriksa..." : "Masuk Admin"}</button>
    </form>}
  </div>;
}

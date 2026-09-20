"use client";
import {useEffect, useState} from "react";
import {Plus, RefreshCw, Tag, TicketPercent, Users} from "lucide-react";
import {gasCall, type GasPromotion, type GasSettings, type GasVoucher} from "@/lib/api";
import {rupiah} from "@/lib/data";
import {useResource} from "@/components/admin/useResource";
import {EmptyState, Field, Modal} from "@/components/admin/ui";

type Props = {settings: GasSettings | null; reloadSettings: () => void; notify: (message: string) => void};
type RuleDraft = {id?: string; name: string; code?: string; type: "PERCENT"|"FIXED"; value: string; minSpend: string; maxDiscount: string; usageLimit?: string; usedCount?: number; startAt: string; endAt: string; active: boolean};
const emptyPromo: RuleDraft = {name:"",type:"PERCENT",value:"10",minSpend:"0",maxDiscount:"0",startAt:"",endAt:"",active:true};
const emptyVoucher: RuleDraft = {...emptyPromo,code:"",type:"FIXED",value:"10000",usageLimit:"0"};
const num = (value:string) => Number(value.replace(/[^\d.]/g,"")) || 0;

export default function PromoLoyaltyPage({settings, reloadSettings, notify}: Props) {
  const promos = useResource<GasPromotion[]>(() => gasCall<GasPromotion[]>("getPromotions"), 60_000);
  const vouchers = useResource<GasVoucher[]>(() => gasCall<GasVoucher[]>("getVouchers"), 60_000);
  const [tab,setTab]=useState<"promo"|"voucher"|"loyalty">("promo");
  const [promoDraft,setPromoDraft]=useState<RuleDraft|null>(null);
  const [voucherDraft,setVoucherDraft]=useState<RuleDraft|null>(null);
  const [busy,setBusy]=useState(false);
  const [loyalty,setLoyalty]=useState({enabled:true,spend:"10000",value:"100",max:"30"});

  useEffect(()=>{
    if(!settings) return;
    setLoyalty({enabled:settings.loyaltyEnabled !== false,spend:String(settings.loyaltySpendPerPoint || 10000),value:String(settings.loyaltyPointValue || 100),max:String(settings.maxRedeemPercent ?? 30)});
  },[settings]);

  const saveRule=async(kind:"promo"|"voucher",draft:RuleDraft)=>{
    if(busy) return; setBusy(true);
    try{
      const payload={id:draft.id,name:draft.name,type:draft.type,value:num(draft.value),minSpend:num(draft.minSpend),maxDiscount:num(draft.maxDiscount),startAt:draft.startAt,endAt:draft.endAt,active:draft.active,...(kind==="voucher"?{code:(draft.code||"").toUpperCase(),usageLimit:num(draft.usageLimit||"0"),usedCount:draft.usedCount||0}:{})};
      await gasCall(kind==="promo"?"savePromotion":"saveVoucher",payload);
      notify(kind==="promo"?"Promo tersimpan":"Voucher tersimpan");
      if(kind==="promo"){setPromoDraft(null);promos.reload();} else {setVoucherDraft(null);vouchers.reload();}
    }catch(e){notify(e instanceof Error?e.message:"Gagal menyimpan");}finally{setBusy(false);}
  };
  const remove=async(sheet:"Promotions"|"Vouchers",id:string)=>{
    if(!window.confirm("Hapus data ini?")) return;
    try{
      await gasCall("deleteData",{sheet,id});
      if(sheet==="Promotions") promos.reload();
      else vouchers.reload();
      notify("Data dihapus");
    }
    catch(e){notify(e instanceof Error?e.message:"Gagal menghapus");}
  };
  const saveLoyalty=async()=>{
    setBusy(true); try{
      await gasCall("saveSettings",{loyaltyEnabled:loyalty.enabled,loyaltySpendPerPoint:num(loyalty.spend),loyaltyPointValue:num(loyalty.value),maxRedeemPercent:num(loyalty.max)});
      reloadSettings(); notify("Pengaturan loyalty tersimpan");
    }catch(e){notify(e instanceof Error?e.message:"Gagal menyimpan loyalty");}finally{setBusy(false);}
  };

  const ruleText=(r:{type:string;value:number;maxDiscount:number})=>r.type==="PERCENT"?`${r.value}%${r.maxDiscount?` (maks ${rupiah(r.maxDiscount)})`:""}`:rupiah(r.value);
  return <div>
    <div className="split" style={{marginBottom:12}}><div><h2>Promo & Loyalty</h2><p className="muted">Diskon terkontrol server • voucher • membership • redeem poin</p></div><button className="iconBtn" type="button" onClick={()=>{promos.reload();vouchers.reload();reloadSettings();}} aria-label="Muat ulang"><RefreshCw size={16}/></button></div>
    <div className="catRow" style={{marginBottom:12}}>
      <button className={`btn cat ${tab==="promo"?"primary":""}`} onClick={()=>setTab("promo")}><Tag size={15}/> Promo</button>
      <button className={`btn cat ${tab==="voucher"?"primary":""}`} onClick={()=>setTab("voucher")}><TicketPercent size={15}/> Voucher</button>
      <button className={`btn cat ${tab==="loyalty"?"primary":""}`} onClick={()=>setTab("loyalty")}><Users size={15}/> Loyalty</button>
    </div>

    {tab==="promo"?<div className="card glass"><div className="split"><div><h2>Promo Otomatis/Pilihan Kasir</h2><p className="muted">Persen atau nominal, minimum belanja, batas diskon, periode aktif.</p></div><button className="btn primary" onClick={()=>setPromoDraft({...emptyPromo})}><Plus size={15}/> Promo</button></div>
      {(promos.data||[]).length===0?<EmptyState message="Belum ada promo."/>:<div className="tableWrap" style={{marginTop:10}}><table className="data"><thead><tr><th>Nama</th><th>Benefit</th><th>Min. Belanja</th><th>Periode</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{(promos.data||[]).map(r=><tr key={r.id}><td><b>{r.name}</b></td><td>{ruleText(r)}</td><td>{rupiah(r.minSpend||0)}</td><td className="muted">{r.startAt||"Sekarang"} → {r.endAt||"∞"}</td><td><span className={`badge ${r.active?"green":"red"}`}>{r.active?"AKTIF":"OFF"}</span></td><td><div className="btnRow"><button className="btn" onClick={()=>setPromoDraft({...r,type:r.type==="FIXED"?"FIXED":"PERCENT",value:String(r.value),minSpend:String(r.minSpend||0),maxDiscount:String(r.maxDiscount||0),startAt:r.startAt||"",endAt:r.endAt||""})}>Edit</button><button className="btn danger" onClick={()=>remove("Promotions",r.id)}>Hapus</button></div></td></tr>)}</tbody></table></div>}
    </div>:null}

    {tab==="voucher"?<div className="card glass"><div className="split"><div><h2>Voucher</h2><p className="muted">Kode unik dengan kuota pemakaian dan periode berlaku.</p></div><button className="btn primary" onClick={()=>setVoucherDraft({...emptyVoucher})}><Plus size={15}/> Voucher</button></div>
      {(vouchers.data||[]).length===0?<EmptyState message="Belum ada voucher."/>:<div className="tableWrap" style={{marginTop:10}}><table className="data"><thead><tr><th>Kode</th><th>Nama</th><th>Benefit</th><th>Pemakaian</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{(vouchers.data||[]).map(r=><tr key={r.id}><td><code>{r.code}</code></td><td>{r.name}</td><td>{ruleText(r)}</td><td>{r.usedCount||0}/{r.usageLimit||"∞"}</td><td><span className={`badge ${r.active?"green":"red"}`}>{r.active?"AKTIF":"OFF"}</span></td><td><div className="btnRow"><button className="btn" onClick={()=>setVoucherDraft({...r,type:r.type==="FIXED"?"FIXED":"PERCENT",code:r.code,value:String(r.value),minSpend:String(r.minSpend||0),maxDiscount:String(r.maxDiscount||0),usageLimit:String(r.usageLimit||0),usedCount:r.usedCount||0,startAt:r.startAt||"",endAt:r.endAt||""})}>Edit</button><button className="btn danger" onClick={()=>remove("Vouchers",r.id)}>Hapus</button></div></td></tr>)}</tbody></table></div>}
    </div>:null}

    {tab==="loyalty"?<div className="card glass"><div className="split"><div><h2>Membership & Loyalty Point</h2><p className="muted">Poin diberikan setelah transaksi PAID dan dibalik saat refund.</p></div><span className={`badge ${loyalty.enabled?"green":"red"}`}>{loyalty.enabled?"AKTIF":"OFF"}</span></div>
      <div className="formGrid" style={{marginTop:12}}><Field label="Program loyalty"><select className="input" value={loyalty.enabled?"on":"off"} onChange={e=>setLoyalty({...loyalty,enabled:e.target.value==="on"})}><option value="on">Aktif</option><option value="off">Nonaktif</option></select></Field><Field label="Belanja untuk 1 poin (Rp)"><input className="input" inputMode="numeric" value={loyalty.spend} onChange={e=>setLoyalty({...loyalty,spend:e.target.value.replace(/[^\d]/g,"")})}/></Field><Field label="Nilai 1 poin saat redeem (Rp)"><input className="input" inputMode="numeric" value={loyalty.value} onChange={e=>setLoyalty({...loyalty,value:e.target.value.replace(/[^\d]/g,"")})}/></Field><Field label="Maks. redeem dari subtotal (%)"><input className="input" inputMode="decimal" value={loyalty.max} onChange={e=>setLoyalty({...loyalty,max:e.target.value.replace(/[^\d.]/g,"")})}/></Field></div>
      <div className="alert" style={{marginTop:12}}>Contoh: setiap {rupiah(num(loyalty.spend))} belanja mendapat 1 poin. Saat redeem, 1 poin bernilai {rupiah(num(loyalty.value))}, maksimal {loyalty.max || 0}% dari subtotal.</div>
      <button className="btn primary" style={{marginTop:12}} disabled={busy} onClick={saveLoyalty}>{busy?"Menyimpan...":"Simpan Loyalty"}</button>
    </div>:null}

    {promoDraft?<RuleModal title={promoDraft.id?"Edit Promo":"Promo Baru"} draft={promoDraft} setDraft={setPromoDraft} onClose={()=>setPromoDraft(null)} onSave={()=>saveRule("promo",promoDraft)} busy={busy}/>:null}
    {voucherDraft?<RuleModal title={voucherDraft.id?"Edit Voucher":"Voucher Baru"} voucher draft={voucherDraft} setDraft={setVoucherDraft} onClose={()=>setVoucherDraft(null)} onSave={()=>saveRule("voucher",voucherDraft)} busy={busy}/>:null}
  </div>;
}

function RuleModal({title,draft,setDraft,onClose,onSave,busy,voucher=false}:{title:string;draft:RuleDraft;setDraft:(d:RuleDraft)=>void;onClose:()=>void;onSave:()=>void;busy:boolean;voucher?:boolean}){
  return <Modal title={title} onClose={onClose}><div className="formGrid" style={{marginTop:10}}>
    {voucher?<Field label="Kode voucher"><input className="input" value={draft.code||""} maxLength={40} placeholder="HEMAT10" onChange={e=>setDraft({...draft,code:e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g,"")})}/></Field>:null}
    <Field label="Nama"><input className="input" value={draft.name} maxLength={100} onChange={e=>setDraft({...draft,name:e.target.value})}/></Field>
    <Field label="Tipe"><select className="input" value={draft.type} onChange={e=>setDraft({...draft,type:e.target.value as "PERCENT"|"FIXED"})}><option value="PERCENT">Persen (%)</option><option value="FIXED">Nominal (Rp)</option></select></Field>
    <Field label={draft.type==="PERCENT"?"Nilai (%)":"Nilai (Rp)"}><input className="input" inputMode="numeric" value={draft.value} onChange={e=>setDraft({...draft,value:e.target.value.replace(/[^\d.]/g,"")})}/></Field>
    <Field label="Minimum belanja (Rp)"><input className="input" inputMode="numeric" value={draft.minSpend} onChange={e=>setDraft({...draft,minSpend:e.target.value.replace(/[^\d]/g,"")})}/></Field>
    <Field label="Maksimum diskon (Rp, 0 = tanpa batas)"><input className="input" inputMode="numeric" value={draft.maxDiscount} onChange={e=>setDraft({...draft,maxDiscount:e.target.value.replace(/[^\d]/g,"")})}/></Field>
    {voucher?<Field label="Kuota pemakaian (0 = tanpa batas)"><input className="input" inputMode="numeric" value={draft.usageLimit||"0"} onChange={e=>setDraft({...draft,usageLimit:e.target.value.replace(/[^\d]/g,"")})}/></Field>:null}
    <Field label="Mulai (opsional)"><input className="input" type="datetime-local" value={draft.startAt} onChange={e=>setDraft({...draft,startAt:e.target.value})}/></Field>
    <Field label="Berakhir (opsional)"><input className="input" type="datetime-local" value={draft.endAt} onChange={e=>setDraft({...draft,endAt:e.target.value})}/></Field>
    <Field label="Status"><select className="input" value={draft.active?"on":"off"} onChange={e=>setDraft({...draft,active:e.target.value==="on"})}><option value="on">Aktif</option><option value="off">Nonaktif</option></select></Field>
  </div><button className="btn primary fullWidth" style={{marginTop:12}} disabled={busy||!draft.name.trim()||(voucher&&!draft.code?.trim())} onClick={onSave}>{busy?"Menyimpan...":"Simpan"}</button></Modal>;
}

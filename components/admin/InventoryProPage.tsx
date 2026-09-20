"use client";

import {useMemo, useState} from "react";
import {Plus, RefreshCw, Trash2} from "lucide-react";
import {rupiah} from "@/lib/data";
import {
  gasCall,
  type GasInventory,
  type GasMenu,
  type GasPurchase,
  type GasRecipe,
  type GasStockMovement,
  type GasSupplier
} from "@/lib/api";
import {useResource} from "@/components/admin/useResource";
import {EmptyState, ErrorState, Field, Modal, Skeleton} from "@/components/admin/ui";

type Tab = "Bahan" | "Pergerakan" | "Supplier" | "Pembelian" | "Resep";
type StockMode = "OPNAME" | "WASTE" | "ADJUSTMENT";

type InventoryDraft = Partial<GasInventory>;
type SupplierDraft = Partial<GasSupplier>;
type PurchaseLine = {inventoryId: string; qty: string; unitCost: string};
type PurchaseDraft = {supplierId: string; invoiceNo: string; note: string; items: PurchaseLine[]};
type RecipeLine = {inventoryId: string; qty: string};
type RecipeDraft = {menuItemId: string; items: RecipeLine[]};

type Props = {
  menus: GasMenu[];
  reloadMenus: () => void;
  notify: (message: string) => void;
};

const tabs: Tab[] = ["Bahan", "Pergerakan", "Supplier", "Pembelian", "Resep"];

export default function InventoryProPage({menus, reloadMenus, notify}: Props) {
  const [tab, setTab] = useState<Tab>("Bahan");
  const invRes = useResource<GasInventory[]>(() => gasCall<GasInventory[]>("getInventory"), 45_000);
  const supplierRes = useResource<GasSupplier[]>(() => gasCall<GasSupplier[]>("getSuppliers"), 90_000);
  const purchaseRes = useResource<GasPurchase[]>(() => gasCall<GasPurchase[]>("getPurchases", {limit: 150}), 45_000);
  const recipeRes = useResource<GasRecipe[]>(() => gasCall<GasRecipe[]>("getRecipes"), 90_000);
  const movementRes = useResource<GasStockMovement[]>(() => gasCall<GasStockMovement[]>("getStockMovements", {limit: 300}), 30_000);

  const inventory = useMemo(() => invRes.data || [], [invRes.data]);
  const suppliers = useMemo(() => supplierRes.data || [], [supplierRes.data]);
  const purchases = useMemo(() => purchaseRes.data || [], [purchaseRes.data]);
  const recipes = useMemo(() => recipeRes.data || [], [recipeRes.data]);
  const movements = useMemo(() => movementRes.data || [], [movementRes.data]);

  const reloadAll = () => {
    invRes.reload();
    supplierRes.reload();
    purchaseRes.reload();
    recipeRes.reload();
    movementRes.reload();
    reloadMenus();
  };

  const lowStock = inventory.filter(item => Number(item.stock) <= Number(item.parLevel));
  const stockValue = inventory.reduce((sum, item) => sum + (Number(item.stock) || 0) * (Number(item.cost) || 0), 0);
  const draftPurchases = purchases.filter(p => p.status === "DRAFT").length;

  return (
    <div className="grid" style={{gap: 14}}>
      <div className="grid stats">
        <MiniStat label="Bahan" value={String(inventory.length)} hint="master inventory" />
        <MiniStat label="Stok Kritis" value={String(lowStock.length)} hint="≤ par level" />
        <MiniStat label="Nilai Stok" value={rupiah(stockValue)} hint="stock × avg cost" />
        <MiniStat label="PO Draft" value={String(draftPurchases)} hint="belum diterima" />
      </div>

      <div className="card glass">
        <div className="split" style={{marginBottom: 10}}>
          <div>
            <h2>Inventory Pro</h2>
            <p className="muted">Ledger stok • supplier • purchase • opname/waste • Recipe/BOM • COGS</p>
          </div>
          <button type="button" className="iconBtn" aria-label="Muat ulang inventory" onClick={reloadAll}>
            <RefreshCw size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="catRow">
          {tabs.map(item => (
            <button key={item} type="button" className={`btn cat ${tab === item ? "primary" : ""}`} onClick={() => setTab(item)}>
              {item}
            </button>
          ))}
        </div>
      </div>

      {tab === "Bahan" ? <InventoryTab rows={inventory} loading={invRes.loading} error={invRes.error} setup={invRes.setup} reload={reloadAll} notify={notify} /> : null}
      {tab === "Pergerakan" ? <MovementsTab rows={movements} inventory={inventory} /> : null}
      {tab === "Supplier" ? <SuppliersTab rows={suppliers} reload={reloadAll} notify={notify} /> : null}
      {tab === "Pembelian" ? <PurchasesTab rows={purchases} inventory={inventory} suppliers={suppliers} reload={reloadAll} notify={notify} /> : null}
      {tab === "Resep" ? <RecipesTab rows={recipes} inventory={inventory} menus={menus} reload={reloadAll} notify={notify} /> : null}
    </div>
  );
}

function MiniStat({label, value, hint}: {label: string; value: string; hint: string}) {
  return (
    <div className="stat glass">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      <div className="muted" style={{fontSize: 12}}>{hint}</div>
    </div>
  );
}

function InventoryTab({rows, loading, error, setup, reload, notify}: {
  rows: GasInventory[];
  loading: boolean;
  error: string;
  setup?: boolean;
  reload: () => void;
  notify: (message: string) => void;
}) {
  const [draft, setDraft] = useState<InventoryDraft | null>(null);
  const [stockTarget, setStockTarget] = useState<GasInventory | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!draft || busy) return;
    setBusy(true);
    try {
      await gasCall("saveInventory", {
        id: draft.id,
        name: draft.name,
        unit: draft.unit || "pcs",
        stock: Number(draft.stock) || 0,
        parLevel: Number(draft.parLevel) || 0,
        cost: Number(draft.cost) || 0
      });
      setDraft(null);
      reload();
      notify("Bahan inventory disimpan");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Gagal menyimpan bahan");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row: GasInventory) => {
    if (!window.confirm(`Hapus bahan "${row.name}"? Pastikan bahan tidak dipakai resep.`)) return;
    try {
      await gasCall("deleteData", {sheet: "Inventory", id: row.id});
      reload();
      notify("Bahan dihapus");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Gagal menghapus bahan");
    }
  };

  return (
    <div className="card glass">
      <div className="split">
        <div>
          <h2>Master Bahan</h2>
          <p className="muted">Edit master untuk nama/satuan/cost. Gunakan Aksi Stok untuk opname, waste, dan koreksi.</p>
        </div>
        <button type="button" className="btn primary" onClick={() => setDraft({name: "", unit: "pcs", stock: 0, parLevel: 0, cost: 0})}>
          <Plus size={15} aria-hidden="true" /> Bahan
        </button>
      </div>
      {error ? <ErrorState message={error} setup={setup} onRetry={reload} /> : null}
      {loading && !rows.length ? <Skeleton rows={4} /> : null}
      {!loading && !error && !rows.length ? <EmptyState message="Belum ada bahan inventory." /> : null}
      {rows.length ? (
        <div className="tableWrap">
          <table className="data">
            <thead><tr><th>Bahan</th><th>Stok</th><th>Par</th><th>Avg Cost</th><th>Nilai</th><th>Status</th><th>Aksi</th></tr></thead>
            <tbody>
              {rows.map(row => {
                const low = Number(row.stock) <= Number(row.parLevel);
                return (
                  <tr key={row.id}>
                    <td><b>{row.name}</b> <span className="muted">({row.unit})</span></td>
                    <td>{fmtQty(row.stock)} {row.unit}</td>
                    <td>{fmtQty(row.parLevel)}</td>
                    <td>{rupiah(Number(row.cost) || 0)}</td>
                    <td>{rupiah((Number(row.stock) || 0) * (Number(row.cost) || 0))}</td>
                    <td><span className={`badge ${low ? "red" : "green"}`}>{low ? "RESTOCK" : "AMAN"}</span></td>
                    <td><div className="btnRow">
                      <button type="button" className="btn" onClick={() => setStockTarget(row)}>Aksi Stok</button>
                      <button type="button" className="btn" onClick={() => setDraft({...row})}>Edit</button>
                      <button type="button" className="btn danger" onClick={() => remove(row)}>Hapus</button>
                    </div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {draft ? (
        <Modal title={draft.id ? "Edit Bahan" : "Bahan Baru"} onClose={() => setDraft(null)}>
          <div className="formGrid">
            <Field label="Nama bahan"><input className="input" value={draft.name || ""} maxLength={120} onChange={e => setDraft({...draft, name: e.target.value})} /></Field>
            <Field label="Satuan"><input className="input" value={draft.unit || ""} maxLength={16} placeholder="pcs / kg / gram / liter" onChange={e => setDraft({...draft, unit: e.target.value})} /></Field>
            <Field label={draft.id ? "Stok (gunakan Aksi Stok untuk audit yang lebih jelas)" : "Stok awal"}>
              <input className="input" inputMode="decimal" value={String(draft.stock ?? "")} onChange={e => setDraft({...draft, stock: toNumber(e.target.value)})} />
            </Field>
            <Field label="Par level"><input className="input" inputMode="decimal" value={String(draft.parLevel ?? "")} onChange={e => setDraft({...draft, parLevel: toNumber(e.target.value)})} /></Field>
            <Field label="Average cost / satuan"><input className="input" inputMode="numeric" value={String(draft.cost ?? "")} onChange={e => setDraft({...draft, cost: toNumber(e.target.value)})} /></Field>
          </div>
          <button type="button" className="btn primary fullWidth" style={{marginTop: 12}} disabled={busy || !String(draft.name || "").trim()} onClick={save}>{busy ? "Menyimpan..." : "Simpan Bahan"}</button>
        </Modal>
      ) : null}

      {stockTarget ? <StockActionModal row={stockTarget} onClose={() => setStockTarget(null)} onSaved={() => {setStockTarget(null); reload();}} notify={notify} /> : null}
    </div>
  );
}

function StockActionModal({row, onClose, onSaved, notify}: {row: GasInventory; onClose: () => void; onSaved: () => void; notify: (message: string) => void}) {
  const [mode, setMode] = useState<StockMode>("OPNAME");
  const [value, setValue] = useState(String(row.stock ?? 0));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {id: row.id, type: mode, reason};
      if (mode === "OPNAME") payload.countedStock = Number(value);
      if (mode === "WASTE") payload.qty = Number(value);
      if (mode === "ADJUSTMENT") payload.delta = Number(value);
      await gasCall("adjustInventory", payload);
      notify(`${row.name}: stok berhasil diperbarui`);
      onSaved();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Gagal mengubah stok");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Aksi Stok — ${row.name}`} onClose={onClose}>
      <p className="muted">Stok saat ini: <b>{fmtQty(row.stock)} {row.unit}</b>. Semua perubahan di sini masuk Stock Movement Ledger.</p>
      <div className="formGrid">
        <Field label="Tipe">
          <select className="input" value={mode} onChange={e => {const next=e.target.value as StockMode; setMode(next); setValue(next === "OPNAME" ? String(row.stock) : "");}}>
            <option value="OPNAME">Stock Opname</option><option value="WASTE">Waste / Rusak</option><option value="ADJUSTMENT">Adjustment +/-</option>
          </select>
        </Field>
        <Field label={mode === "OPNAME" ? "Stok fisik hasil hitung" : mode === "WASTE" ? "Qty terbuang" : "Delta (+ tambah / - kurang)"}>
          <input className="input" inputMode="decimal" value={value} placeholder={mode === "ADJUSTMENT" ? "+5 atau -2" : "0"} onChange={e => setValue(e.target.value.replace(/[^\d.+-]/g, ""))} />
        </Field>
        <Field label="Alasan"><input className="input" value={reason} maxLength={300} placeholder="Contoh: opname akhir bulan / rusak / koreksi" onChange={e => setReason(e.target.value)} /></Field>
      </div>
      <button type="button" className="btn primary fullWidth" style={{marginTop: 12}} disabled={busy || !reason.trim() || !value} onClick={save}>{busy ? "Menyimpan..." : "Simpan Perubahan Stok"}</button>
    </Modal>
  );
}

function MovementsTab({rows, inventory}: {rows: GasStockMovement[]; inventory: GasInventory[]}) {
  const [filter, setFilter] = useState("");
  const filtered = filter ? rows.filter(r => r.inventoryId === filter) : rows;
  return (
    <div className="card glass">
      <div className="split"><div><h2>Stock Movement Ledger</h2><p className="muted">Jejak append-only untuk sale, return, purchase, opname, waste, dan adjustment.</p></div>
        <select className="input selectInline" value={filter} onChange={e => setFilter(e.target.value)}><option value="">Semua bahan</option>{inventory.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select>
      </div>
      {!filtered.length ? <EmptyState message="Belum ada pergerakan stok." /> : <div className="tableWrap"><table className="data">
        <thead><tr><th>Waktu</th><th>Bahan</th><th>Tipe</th><th>Qty</th><th>Sebelum</th><th>Sesudah</th><th>Nilai</th><th>Referensi</th><th>Staff</th><th>Catatan</th></tr></thead>
        <tbody>{filtered.map(row => <tr key={row.id}>
          <td>{fmtDateTime(row.createdAt)}</td><td><b>{row.inventoryName}</b></td><td><span className={`badge ${movementTone(row.type)}`}>{row.type}</span></td>
          <td>{Number(row.qty) > 0 ? "+" : ""}{fmtQty(row.qty)}</td><td>{fmtQty(row.beforeStock)}</td><td>{fmtQty(row.afterStock)}</td><td>{rupiah(row.totalCost || 0)}</td>
          <td>{row.referenceId || "—"}</td><td>{row.staffName || "—"}</td><td className="muted">{row.note || "—"}</td>
        </tr>)}</tbody>
      </table></div>}
    </div>
  );
}

function SuppliersTab({rows, reload, notify}: {rows: GasSupplier[]; reload: () => void; notify: (message: string) => void}) {
  const [draft, setDraft] = useState<SupplierDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!draft || busy) return;
    setBusy(true);
    try {
      await gasCall("saveSupplier", draft as Record<string, unknown>);
      setDraft(null); reload(); notify("Supplier disimpan");
    } catch (e) {notify(e instanceof Error ? e.message : "Gagal menyimpan supplier");}
    finally {setBusy(false);}
  };
  const remove = async (row: GasSupplier) => {
    if (!window.confirm(`Hapus supplier "${row.name}"?`)) return;
    try {await gasCall("deleteData", {sheet:"Suppliers", id:row.id}); reload(); notify("Supplier dihapus");}
    catch (e) {notify(e instanceof Error ? e.message : "Gagal menghapus supplier");}
  };
  return <div className="card glass">
    <div className="split"><div><h2>Supplier</h2><p className="muted">Master pemasok untuk purchase/restock bahan.</p></div><button type="button" className="btn primary" onClick={() => setDraft({name:"", phone:"", email:"", address:"", note:"", active:true})}><Plus size={15}/> Supplier</button></div>
    {!rows.length ? <EmptyState message="Belum ada supplier." /> : <div className="tableWrap"><table className="data"><thead><tr><th>Nama</th><th>Telepon</th><th>Email</th><th>Alamat</th><th>Status</th><th>Aksi</th></tr></thead><tbody>
      {rows.map(row => <tr key={row.id}><td><b>{row.name}</b></td><td>{row.phone || "—"}</td><td>{row.email || "—"}</td><td>{row.address || "—"}</td><td><span className={`badge ${row.active === false ? "red" : "green"}`}>{row.active === false ? "NONAKTIF" : "AKTIF"}</span></td><td><div className="btnRow"><button className="btn" onClick={() => setDraft({...row})}>Edit</button><button className="btn danger" onClick={() => remove(row)}>Hapus</button></div></td></tr>)}
    </tbody></table></div>}
    {draft ? <Modal title={draft.id ? "Edit Supplier" : "Supplier Baru"} onClose={() => setDraft(null)}><div className="formGrid">
      <Field label="Nama supplier"><input className="input" value={draft.name || ""} onChange={e => setDraft({...draft, name:e.target.value})}/></Field>
      <Field label="Telepon"><input className="input" value={draft.phone || ""} onChange={e => setDraft({...draft, phone:e.target.value})}/></Field>
      <Field label="Email"><input className="input" type="email" value={draft.email || ""} onChange={e => setDraft({...draft, email:e.target.value})}/></Field>
      <Field label="Alamat"><input className="input" value={draft.address || ""} onChange={e => setDraft({...draft, address:e.target.value})}/></Field>
      <Field label="Catatan"><input className="input" value={draft.note || ""} onChange={e => setDraft({...draft, note:e.target.value})}/></Field>
    </div><label className="split rowLine" style={{marginTop:8}}><span>Supplier aktif</span><input type="checkbox" checked={draft.active !== false} onChange={e => setDraft({...draft, active:e.target.checked})}/></label>
      <button className="btn primary fullWidth" style={{marginTop:12}} disabled={busy || !String(draft.name || "").trim()} onClick={save}>{busy ? "Menyimpan..." : "Simpan Supplier"}</button>
    </Modal> : null}
  </div>;
}

function PurchasesTab({rows, inventory, suppliers, reload, notify}: {rows: GasPurchase[]; inventory: GasInventory[]; suppliers: GasSupplier[]; reload: () => void; notify: (message: string) => void}) {
  const [draft, setDraft] = useState<PurchaseDraft | null>(null);
  const [busyId, setBusyId] = useState("");

  const create = async () => {
    if (!draft || busyId) return;
    setBusyId("new");
    try {
      await gasCall("createPurchase", {supplierId:draft.supplierId, invoiceNo:draft.invoiceNo, note:draft.note, items:draft.items.map(i => ({inventoryId:i.inventoryId, qty:Number(i.qty), unitCost:Number(i.unitCost)}))});
      setDraft(null); reload(); notify("Purchase draft dibuat. Klik Terima saat barang benar-benar datang.");
    } catch (e) {notify(e instanceof Error ? e.message : "Gagal membuat purchase");}
    finally {setBusyId("");}
  };

  const receive = async (po: GasPurchase) => {
    if (!window.confirm(`Terima barang ${po.id}? Stok dan average cost akan diperbarui.`)) return;
    setBusyId(po.id);
    try {await gasCall("receivePurchase", {id:po.id}); reload(); notify(`${po.id} diterima dan stok bertambah`);}
    catch (e) {notify(e instanceof Error ? e.message : "Gagal menerima purchase");}
    finally {setBusyId("");}
  };

  const cancel = async (po: GasPurchase) => {
    const reason = window.prompt("Alasan membatalkan purchase:", "Dibatalkan oleh manager")?.trim();
    if (!reason) return;
    setBusyId(po.id);
    try {await gasCall("cancelPurchase", {id:po.id, reason}); reload(); notify(`${po.id} dibatalkan`);}
    catch (e) {notify(e instanceof Error ? e.message : "Gagal membatalkan purchase");}
    finally {setBusyId("");}
  };

  const addLine = () => setDraft(draft ? {...draft, items:[...draft.items, {inventoryId:inventory[0]?.id || "", qty:"1", unitCost:String(inventory[0]?.cost || 0)}]} : draft);
  const removeLine = (idx: number) => setDraft(draft ? {...draft, items:draft.items.filter((_, i) => i !== idx)} : draft);
  const updateLine = (idx: number, patch: Partial<PurchaseLine>) => setDraft(draft ? {...draft, items:draft.items.map((line, i) => i === idx ? {...line, ...patch} : line)} : draft);
  const draftTotal = (draft?.items || []).reduce((sum, item) => sum + (Number(item.qty)||0)*(Number(item.unitCost)||0), 0);

  return <div className="card glass">
    <div className="split"><div><h2>Pembelian / Restock</h2><p className="muted">DRAFT tidak menyentuh stok. RECEIVE menambah stok, ledger, dan weighted-average cost.</p></div><button type="button" className="btn primary" disabled={!inventory.length || !suppliers.some(s => s.active !== false)} onClick={() => setDraft({supplierId:suppliers.find(s=>s.active!==false)?.id || "", invoiceNo:"", note:"", items:[{inventoryId:inventory[0]?.id || "", qty:"1", unitCost:String(inventory[0]?.cost || 0)}]})}><Plus size={15}/> Purchase</button></div>
    {!rows.length ? <EmptyState message="Belum ada purchase." /> : <div className="tableWrap"><table className="data"><thead><tr><th>PO</th><th>Supplier</th><th>Invoice</th><th>Item</th><th>Total</th><th>Status</th><th>Dibuat</th><th>Aksi</th></tr></thead><tbody>
      {rows.map(po => <tr key={po.id}><td><b>{po.id}</b></td><td>{po.supplierName}</td><td>{po.invoiceNo || "—"}</td><td>{po.items?.length || 0}</td><td>{rupiah(po.total)}</td><td><span className={`badge ${po.status === "RECEIVED" ? "green" : po.status === "CANCELLED" ? "red" : "amber"}`}>{po.status}</span></td><td>{fmtDateTime(po.createdAt)}</td><td>{po.status === "DRAFT" ? <div className="btnRow"><button className="btn success" disabled={busyId===po.id} onClick={() => receive(po)}>Terima</button><button className="btn danger" disabled={busyId===po.id} onClick={() => cancel(po)}>Batal</button></div> : <span className="muted">{po.receivedBy || "—"}</span>}</td></tr>)}
    </tbody></table></div>}

    {draft ? <Modal title="Purchase Baru (Draft)" onClose={() => setDraft(null)}><div className="formGrid">
      <Field label="Supplier"><select className="input" value={draft.supplierId} onChange={e => setDraft({...draft, supplierId:e.target.value})}><option value="">— Pilih —</option>{suppliers.filter(s=>s.active!==false).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
      <Field label="No invoice / nota"><input className="input" value={draft.invoiceNo} onChange={e => setDraft({...draft, invoiceNo:e.target.value})}/></Field>
      <Field label="Catatan"><input className="input" value={draft.note} onChange={e => setDraft({...draft, note:e.target.value})}/></Field>
    </div>
      <div style={{marginTop:14}}><div className="split"><h3>Item Pembelian</h3><button className="btn" onClick={addLine}><Plus size={14}/> Item</button></div>
        {draft.items.map((line, idx) => <div className="formGrid" key={idx} style={{marginBottom:10, alignItems:"end"}}>
          <Field label={`Bahan #${idx+1}`}><select className="input" value={line.inventoryId} onChange={e => {const inv=inventory.find(i=>i.id===e.target.value); updateLine(idx,{inventoryId:e.target.value, unitCost:String(inv?.cost || 0)});}}>{inventory.map(i=><option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}</select></Field>
          <Field label="Qty"><input className="input" inputMode="decimal" value={line.qty} onChange={e=>updateLine(idx,{qty:e.target.value.replace(/[^\d.]/g,"")})}/></Field>
          <Field label="Harga beli / satuan"><input className="input" inputMode="numeric" value={line.unitCost} onChange={e=>updateLine(idx,{unitCost:e.target.value.replace(/[^\d.]/g,"")})}/></Field>
          <button type="button" className="btn danger" disabled={draft.items.length===1} onClick={() => removeLine(idx)}><Trash2 size={14}/> Hapus</button>
        </div>)}
      </div>
      <div className="split rowLine"><span>Total Draft</span><b>{rupiah(draftTotal)}</b></div>
      <button className="btn primary fullWidth" style={{marginTop:12}} disabled={busyId==="new" || !draft.supplierId || draft.items.some(i=>!i.inventoryId || Number(i.qty)<=0 || Number(i.unitCost)<0)} onClick={create}>{busyId==="new" ? "Menyimpan..." : "Simpan Purchase Draft"}</button>
    </Modal> : null}
  </div>;
}

function RecipesTab({rows, inventory, menus, reload, notify}: {rows: GasRecipe[]; inventory: GasInventory[]; menus: GasMenu[]; reload: () => void; notify: (message: string) => void}) {
  const [draft, setDraft] = useState<RecipeDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const grouped = useMemo(() => {
    const map = new Map<string, GasRecipe[]>();
    rows.forEach(r => map.set(r.menuItemId, [...(map.get(r.menuItemId) || []), r]));
    return map;
  }, [rows]);

  const open = (menu: GasMenu) => setDraft({menuItemId:menu.id, items:(grouped.get(menu.id) || []).map(r => ({inventoryId:r.inventoryId, qty:String(r.qty)}))});
  const addLine = () => setDraft(draft ? {...draft, items:[...draft.items, {inventoryId:inventory[0]?.id || "", qty:"1"}]} : draft);
  const removeLine = (idx:number) => setDraft(draft ? {...draft, items:draft.items.filter((_,i)=>i!==idx)} : draft);
  const updateLine = (idx:number, patch:Partial<RecipeLine>) => setDraft(draft ? {...draft, items:draft.items.map((line,i)=>i===idx?{...line,...patch}:line)} : draft);

  const save = async () => {
    if (!draft || busy) return;
    setBusy(true);
    try {
      await gasCall("saveRecipe", {menuItemId:draft.menuItemId, items:draft.items.map(i=>({inventoryId:i.inventoryId, qty:Number(i.qty)}))});
      setDraft(null); reload(); notify("Recipe/BOM disimpan dan modal menu dihitung ulang");
    } catch (e) {notify(e instanceof Error ? e.message : "Gagal menyimpan resep");}
    finally {setBusy(false);}
  };

  return <div className="card glass">
    <div><h2>Recipe / BOM</h2><p className="muted">Setiap penjualan otomatis mengurangi bahan sesuai resep. Cost menu dihitung dari average cost bahan.</p></div>
    {!menus.length ? <EmptyState message="Belum ada menu." /> : <div className="tableWrap"><table className="data"><thead><tr><th>Menu</th><th>Bahan</th><th>Recipe Cost</th><th>Harga Jual</th><th>Margin</th><th>Aksi</th></tr></thead><tbody>
      {menus.map(menu => {
        const recipe = grouped.get(menu.id) || [];
        const cost = recipe.length ? recipe.reduce((sum,r)=>sum+(Number(r.lineCost)||0),0) : Number(menu.cost)||0;
        const margin = Number(menu.price)>0 ? ((Number(menu.price)-cost)/Number(menu.price))*100 : 0;
        return <tr key={menu.id}><td><b>{menu.emoji || "🍽️"} {menu.name}</b></td><td>{recipe.length ? recipe.map(r=>`${r.inventoryName || r.inventoryId} ${fmtQty(r.qty)} ${r.unit}`).join(" • ") : <span className="muted">Belum ada BOM; memakai modal menu manual</span>}</td><td>{rupiah(cost)}</td><td>{rupiah(menu.price)}</td><td>{margin.toFixed(1)}%</td><td><button className="btn" onClick={()=>open(menu)}>Atur Resep</button></td></tr>;
      })}
    </tbody></table></div>}
    {draft ? <Modal title={`Recipe — ${menus.find(m=>m.id===draft.menuItemId)?.name || "Menu"}`} onClose={()=>setDraft(null)}>
      <div className="split"><p className="muted">Qty adalah pemakaian bahan untuk <b>1 porsi</b>.</p><button className="btn" disabled={!inventory.length} onClick={addLine}><Plus size={14}/> Bahan</button></div>
      {!draft.items.length ? <EmptyState message="Resep kosong. Menu akan memakai modal manual dari master Menu." /> : draft.items.map((line,idx)=><div className="formGrid" key={idx} style={{marginBottom:10, alignItems:"end"}}>
        <Field label={`Bahan #${idx+1}`}><select className="input" value={line.inventoryId} onChange={e=>updateLine(idx,{inventoryId:e.target.value})}>{inventory.map(i=><option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}</select></Field>
        <Field label="Qty per porsi"><input className="input" inputMode="decimal" value={line.qty} onChange={e=>updateLine(idx,{qty:e.target.value.replace(/[^\d.]/g,"")})}/></Field>
        <button className="btn danger" onClick={()=>removeLine(idx)}><Trash2 size={14}/> Hapus</button>
      </div>)}
      <button className="btn primary fullWidth" style={{marginTop:12}} disabled={busy || draft.items.some(i=>!i.inventoryId || Number(i.qty)<=0)} onClick={save}>{busy ? "Menyimpan..." : "Simpan Recipe / BOM"}</button>
    </Modal> : null}
  </div>;
}

function fmtQty(value: unknown) {
  const n = Number(value) || 0;
  return new Intl.NumberFormat("id-ID", {maximumFractionDigits: 3}).format(n);
}

function toNumber(value: string) {
  const n = Number(value.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function fmtDateTime(value?: string) {
  const t = Date.parse(String(value || ""));
  if (!Number.isFinite(t)) return "—";
  return new Date(t).toLocaleString("id-ID", {day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit"});
}

function movementTone(type: string): "green" | "amber" | "red" | "" {
  if (["PURCHASE", "RETURN", "INITIAL"].includes(type)) return "green";
  if (["WASTE", "SALE"].includes(type)) return "red";
  if (["OPNAME", "ADJUSTMENT"].includes(type)) return "amber";
  return "";
}

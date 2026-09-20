"use client";
import {useEffect, useMemo, useState} from "react";
import {Check, ChevronDown, CreditCard, Printer, RefreshCw, RotateCcw, Search, X, Split} from "lucide-react";
import {rupiah} from "@/lib/data";
import {formatClock, gasCall, ORDER_STATUSES, PAYMENT_LABELS, PAYMENT_METHODS, type GasOrder, type PaymentMethod, type SessionInfo} from "@/lib/api";
import {useResource} from "@/components/admin/useResource";
import {ReceiptModal} from "@/components/admin/PosPage";
import {loadHardwareSettings, openCashDrawer, printKitchenDirect, printKitchenOnce, printReceiptDirect} from "@/lib/hardware";

function statusTone(status: string): string {
  if (status === "PAID" || status === "SERVED") return "green";
  if (status === "NEW") return "amber";
  if (status === "CANCELLED" || status === "REFUNDED") return "red";
  return "";
}

const ACTIVE_STATUSES = ["NEW", "CONFIRMED", "COOKING", "READY", "SERVED"];
const MANUAL_TRANSITIONS: Record<string, string[]> = {
  NEW: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["COOKING", "CANCELLED"],
  COOKING: ["READY", "CANCELLED"],
  READY: ["SERVED", "CANCELLED"],
  SERVED: []
};

export function OrdersPage({notify, role = "admin", storeName = "Kastriva"}: {notify: (message: string) => void; role?: NonNullable<SessionInfo["role"]>; storeName?: string}) {
  const ordersRes = useResource<GasOrder[]>(
    () => gasCall<GasOrder[]>("getOrders", {withItems: true, limit: 200}),
    15_000
  );
  const [filter, setFilter] = useState("ACTIVE");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState("");
  const [payTarget, setPayTarget] = useState<GasOrder | null>(null);
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [paidInput, setPaidInput] = useState("");
  const [splitPay, setSplitPay] = useState(false);
  const [splitPayments, setSplitPayments] = useState([{method:"CASH" as PaymentMethod,amount:"",received:""},{method:"QRIS" as PaymentMethod,amount:"",received:""}]);
  const [splitTarget, setSplitTarget] = useState<GasOrder | null>(null);
  const [splitQty, setSplitQty] = useState<Record<string,string>>({});
  const [busy, setBusy] = useState(false);

  const [receiptOrder, setReceiptOrder] = useState<GasOrder | null>(null);
  const orders = useMemo(() => ordersRes.data || [], [ordersRes.data]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders.filter(order => {
      if (filter === "ACTIVE" ? !ACTIVE_STATUSES.includes(order.status) : filter !== "ALL" && order.status !== filter) {
        return false;
      }
      if (!q) return true;
      return [order.id, order.customerName, order.tableCode].some(v => String(v || "").toLowerCase().includes(q));
    });
  }, [orders, filter, query]);

  const setStatus = async (order: GasOrder, status: string) => {
    let reason = "";
    if (status === "CANCELLED") {
      reason = window.prompt(`Alasan membatalkan ${order.id}:`, "")?.trim() || "";
      if (!reason) {
        notify("Pembatalan dibatalkan: alasan wajib diisi");
        return;
      }
    }
    try {
      await gasCall("updateOrderStatus", {id: order.id, status, reason});
      notify(status === "CANCELLED" ? `${order.id} dibatalkan dan stok dikembalikan` : `Status ${order.id} → ${status}`);
      ordersRes.reload();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Gagal mengubah status");
    }
  };

  const refundOrder = async (order: GasOrder) => {
    const reason = window.prompt(`Alasan refund ${order.id}:`, "")?.trim() || "";
    if (!reason) {
      notify("Refund dibatalkan: alasan wajib diisi");
      return;
    }
    const restock = window.confirm("Kembalikan stok item dari transaksi ini? Pilih OK jika barang kembali ke stok.");
    try {
      await gasCall("refundOrder", {id: order.id, reason, restock});
      notify(`${order.id} berhasil direfund${restock ? " dan stok dikembalikan" : ""}`);
      ordersRes.reload();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Refund gagal");
    }
  };

  const openPay = (order: GasOrder) => {
    setMethod("CASH"); setPaidInput(""); setSplitPay(false);
    setSplitPayments([{method:"CASH",amount:String(order.total),received:String(order.total)},{method:"QRIS",amount:"",received:""}]);
    setPayTarget(order);
  };

  const openSplitBill = (order: GasOrder) => {
    setSplitQty(Object.fromEntries((order.items || []).map(item=>[item.id,"0"])));
    setSplitTarget(order);
  };

  const confirmSplitBill = async () => {
    if(!splitTarget || busy) return;
    const items=(splitTarget.items||[]).map(item=>({orderItemId:item.id,qty:Number(splitQty[item.id]||0)})).filter(x=>x.qty>0);
    if(!items.length){notify("Pilih item yang akan dipisahkan");return;}
    setBusy(true); try{const result=await gasCall<{original:GasOrder;split:GasOrder}>("splitOrder",{id:splitTarget.id,items}); notify(`Split bill berhasil → ${result.split.id}`); setSplitTarget(null); ordersRes.reload();}
    catch(e){notify(e instanceof Error?e.message:"Split bill gagal");}finally{setBusy(false);}
  };

  const confirmPay = async () => {
    if (!payTarget || busy) return;
    const paid = Number(paidInput.replace(/[^\d]/g, "")) || 0;
    let payload: Record<string, unknown>;
    if (splitPay) {
      const rows=splitPayments.filter(r=>Number(r.amount.replace(/[^\d]/g,""))>0).map(r=>({method:r.method,amount:Number(r.amount.replace(/[^\d]/g,""))||0,receivedAmount:r.method==="CASH"?(Number(r.received.replace(/[^\d]/g,""))||0):(Number(r.amount.replace(/[^\d]/g,""))||0)}));
      const total=rows.reduce((sum,r)=>sum+r.amount,0);
      if(rows.length<2){notify("Split payment membutuhkan minimal 2 metode");return;}
      if(new Set(rows.map(r=>r.method)).size!==rows.length){notify("Metode pembayaran tidak boleh sama");return;}
      if(total!==payTarget.total){notify(`Alokasi split harus ${rupiah(payTarget.total)}`);return;}
      if(rows.some(r=>r.method==="CASH"&&r.receivedAmount<r.amount)){notify("Tunai diterima kurang");return;}
      payload={id:payTarget.id,payments:rows};
    } else {
      if (method === "CASH" && paid < payTarget.total) { notify("Uang yang dibayar kurang dari total"); return; }
      payload={id:payTarget.id,method,paidAmount:method === "CASH" ? paid : payTarget.total};
    }
    setBusy(true);
    try {
      const paidOrder = await gasCall<GasOrder>("payOrder", payload);
      const hardware = loadHardwareSettings();
      if (hardware.autoPrintReceipt) { try { await printReceiptDirect(paidOrder, storeName, hardware); } catch (e) { notify(e instanceof Error ? `Pembayaran berhasil, printer struk: ${e.message}` : "Pembayaran berhasil, printer struk gagal"); } }
      const hasCash=splitPay?("payments" in payload && Array.isArray(payload.payments) && (payload.payments as {method:string}[]).some(p=>p.method==="CASH")):method==="CASH";
      if (hasCash && hardware.openDrawerOnCash) { try { await openCashDrawer(hardware); } catch (e) { notify(e instanceof Error ? `Pembayaran berhasil, cash drawer: ${e.message}` : "Pembayaran berhasil, cash drawer gagal"); } }
      setPayTarget(null); ordersRes.reload(); setReceiptOrder(paidOrder);
    } catch (e) { notify(e instanceof Error ? e.message : "Pembayaran gagal"); } finally { setBusy(false); }
  };

  return (
    <div className="card glass">
      <div className="split">
        <div>
          <h2>Order Management</h2>
          <p className="muted">Omnichannel queue • POS / QR / WA • auto-refresh 15s</p>
        </div>
        <div className="btnRow">
          <button type="button" className="iconBtn" aria-label="Muat ulang" onClick={ordersRes.reload}>
            <RefreshCw size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="catRow" style={{margin: "10px 0"}}>
        {["ACTIVE", "ALL", ...ORDER_STATUSES].map(s => (
          <button
            type="button"
            key={s}
            className={`btn cat ${filter === s ? "primary" : ""}`}
            onClick={() => setFilter(s)}
          >
            {s === "ACTIVE" ? "Aktif" : s === "ALL" ? "Semua" : s}
          </button>
        ))}
      </div>
      <div className="searchWrap">
        <Search size={15} aria-hidden="true" />
        <input
          className="search"
          placeholder="Cari ID / pelanggan / meja..."
          aria-label="Cari pesanan"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>

      {ordersRes.setup ? (
        <p className="alert error">Backend belum terhubung. Isi GAS_WEB_APP_URL & GAS_API_KEY di environment server.</p>
      ) : ordersRes.error ? (
        <p className="alert error" role="alert">
          {ordersRes.error}{" "}
          <button type="button" className="btn" onClick={ordersRes.reload}>
            Coba lagi
          </button>
        </p>
      ) : shown.length === 0 ? (
        <div className="empty">Tidak ada pesanan pada filter ini.</div>
      ) : (
        <div className="tableWrap" style={{marginTop: 10}}>
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Order</th>
                <th scope="col">Pelanggan</th>
                <th scope="col">Meja</th>
                <th scope="col">Channel</th>
                <th scope="col">Total</th>
                <th scope="col">Bayar</th>
                <th scope="col">Status</th>
                <th scope="col">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(order => (
                <OrderRow
                  key={order.id}
                  order={order}
                  expanded={expanded === order.id}
                  onToggle={() => setExpanded(expanded === order.id ? "" : order.id)}
                  onStatus={status => setStatus(order, status)}
                  onPay={() => openPay(order)}
                  onRefund={() => refundOrder(order)}
                  onSplit={() => openSplitBill(order)}
                  role={role}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {payTarget ? (
        <div className="modal" role="dialog" aria-modal="true" aria-label={`Bayar ${payTarget.id}`}>
          <div className="modalCard glass">
            <div className="split">
              <h2>Bayar {payTarget.id}</h2>
              <button type="button" className="iconBtn" aria-label="Tutup" onClick={() => setPayTarget(null)}>
                <X size={17} aria-hidden="true" />
              </button>
            </div>
            <div className="payTotal">
              <span className="muted">Total tagihan</span>
              <b className="total">{rupiah(payTarget.total)}</b>
            </div>
            <div className="btnRow" style={{marginBottom:10}}><button type="button" className={`btn ${!splitPay?"primary":""}`} onClick={()=>setSplitPay(false)}>Satu Metode</button><button type="button" className={`btn ${splitPay?"primary":""}`} onClick={()=>setSplitPay(true)}>Split Payment</button></div>
            {!splitPay ? <><div className="segRow" role="radiogroup" aria-label="Metode pembayaran">{PAYMENT_METHODS.map(m => <button type="button" key={m} className={`seg ${method === m ? "segOn" : ""}`} role="radio" aria-checked={method === m} onClick={() => setMethod(m)}>{PAYMENT_LABELS[m]}</button>)}</div>
              {method === "CASH" ? <label className="label" style={{marginTop:10}}>Uang diterima<input className="input" inputMode="numeric" autoFocus value={paidInput ? Number(paidInput).toLocaleString("id-ID") : ""} onChange={e => setPaidInput(e.target.value.replace(/[^\d]/g, "").slice(0, 12))}/></label> : null}</>
              : <div>{splitPayments.map((row,index)=><div key={index} style={{marginBottom:10}}><div className="formGrid"><label className="label">Metode {index+1}<select className="input" value={row.method} onChange={e=>setSplitPayments(list=>list.map((x,i)=>i===index?{...x,method:e.target.value as PaymentMethod}:x))}>{PAYMENT_METHODS.map(m=><option key={m} value={m}>{PAYMENT_LABELS[m]}</option>)}</select></label><label className="label">Alokasi (Rp)<input className="input" inputMode="numeric" value={row.amount} onChange={e=>setSplitPayments(list=>list.map((x,i)=>i===index?{...x,amount:e.target.value.replace(/[^\d]/g,"")}:x))}/></label>{row.method==="CASH"?<label className="label">Tunai diterima<input className="input" inputMode="numeric" value={row.received} onChange={e=>setSplitPayments(list=>list.map((x,i)=>i===index?{...x,received:e.target.value.replace(/[^\d]/g,"")}:x))}/></label>:null}</div>{splitPayments.length>2?<button type="button" className="btn danger" style={{marginTop:6}} onClick={()=>setSplitPayments(list=>list.filter((_,i)=>i!==index))}><X size={14}/> Hapus metode</button>:null}</div>)}<div className="btnRow"><button type="button" className="btn" disabled={splitPayments.length>=5} onClick={()=>{const next=PAYMENT_METHODS.find(m=>!splitPayments.some(x=>x.method===m));if(next)setSplitPayments(list=>[...list,{method:next,amount:"",received:""}]);}}>+ Metode ({splitPayments.length}/5)</button>{splitPayments.length===2?<button type="button" className="btn" onClick={()=>{const first=Math.floor(payTarget.total/2);setSplitPayments([{...splitPayments[0],amount:String(first),received:String(first)},{...splitPayments[1],amount:String(payTarget.total-first)}]);}}>Bagi 50:50</button>:null}</div></div>}
            <button type="button" className="btn success fullWidth" style={{marginTop: 14}} disabled={busy} onClick={confirmPay}>
              <CreditCard size={15} aria-hidden="true" /> {busy ? "Memproses..." : "Konfirmasi Pembayaran"}
            </button>
          </div>
        </div>
      ) : null}

      {splitTarget ? <div className="modal" role="dialog" aria-modal="true" aria-label={`Split bill ${splitTarget.id}`}><div className="modalCard glass"><div className="split"><h2>Split Bill {splitTarget.id}</h2><button className="iconBtn" type="button" onClick={()=>setSplitTarget(null)}><X size={17}/></button></div><p className="muted">Pilih jumlah item yang dipindahkan menjadi tagihan baru. Split hanya tersedia sebelum diskon/promo/redeem poin.</p>{(splitTarget.items||[]).map(item=><div className="split rowLine" key={item.id}><span>{item.name} × {item.qty}</span><label className="label" style={{maxWidth:110}}>Pindah<input className="input" inputMode="numeric" value={splitQty[item.id]||"0"} onChange={e=>{const n=Math.min(Number(item.qty),Math.max(0,Number(e.target.value.replace(/[^\d]/g,""))||0));setSplitQty({...splitQty,[item.id]:String(n)});}}/></label></div>)}<button type="button" className="btn primary fullWidth" style={{marginTop:12}} disabled={busy} onClick={confirmSplitBill}>{busy?"Memproses...":"Buat Tagihan Terpisah"}</button></div></div>:null}

      {receiptOrder ? (
        <ReceiptModal order={receiptOrder} storeName={storeName} onClose={() => setReceiptOrder(null)} />
      ) : null}
    </div>
  );
}

function OrderRow({
  order,
  expanded,
  onToggle,
  onStatus,
  onPay,
  onRefund,
  onSplit,
  role
}: {
  order: GasOrder;
  expanded: boolean;
  onToggle: () => void;
  onStatus: (status: string) => void;
  onPay: () => void;
  onRefund: () => void;
  onSplit: () => void;
  role: NonNullable<SessionInfo["role"]>;
}) {
  const paid = order.status === "PAID";
  const canPay = ["admin", "manager", "cashier"].includes(role) && ACTIVE_STATUSES.includes(order.status);
  const canRefund = ["admin", "manager"].includes(role) && paid;
  const canSplit = ["admin","manager","cashier"].includes(role) && ACTIVE_STATUSES.includes(order.status) && Number(order.discount||0)===0 && (order.items||[]).reduce((s,i)=>s+Number(i.qty||0),0)>1;
  const roleTransitions: Record<string, string[]> = {
    admin: MANUAL_TRANSITIONS[order.status] || [],
    manager: MANUAL_TRANSITIONS[order.status] || [],
    cashier: (MANUAL_TRANSITIONS[order.status] || []).filter(s => ["CONFIRMED", "SERVED", "CANCELLED"].includes(s)),
    kitchen: (MANUAL_TRANSITIONS[order.status] || []).filter(s => ["CONFIRMED", "COOKING", "READY"].includes(s)),
    barista: (MANUAL_TRANSITIONS[order.status] || []).filter(s => ["CONFIRMED", "COOKING", "READY"].includes(s)),
    waiter: (MANUAL_TRANSITIONS[order.status] || []).filter(s => ["CONFIRMED", "SERVED"].includes(s)),
    staff: (MANUAL_TRANSITIONS[order.status] || []).filter(s => s === "CONFIRMED")
  };
  const manualStatuses = [order.status, ...(roleTransitions[role] || [])];
  return (
    <>
      <tr>
        <td>
          <b>{order.id}</b>
          <br />
          <span className="muted">{formatClock(order.createdAt)}</span>
        </td>
        <td>{order.customerName || "—"}</td>
        <td>{order.tableCode || "Takeaway"}</td>
        <td>
          <span className="badge">{order.channel}</span>
        </td>
        <td>{rupiah(order.total)}</td>
        <td>
          {order.paymentMethod ? (
            <span className="badge green">{PAYMENT_LABELS[order.paymentMethod as PaymentMethod] || order.paymentMethod}</span>
          ) : (
            <span className="badge amber">Belum</span>
          )}
        </td>
        <td>
          <span className={`badge ${statusTone(order.status)}`}>{order.status}</span>
        </td>
        <td>
          <div className="btnRow">
            {canPay ? (
              <button type="button" className="btn success" onClick={onPay}>
                Bayar
              </button>
            ) : null}
            {canRefund ? (
              <button type="button" className="btn danger" onClick={onRefund}>
                <RotateCcw size={14} aria-hidden="true" /> Refund
              </button>
            ) : null}
            {canSplit ? <button type="button" className="btn" onClick={onSplit} title="Split Bill"><Split size={14}/> Split</button> : null}
            <select
              className="input selectInline"
              aria-label={`Ubah status ${order.id}`}
              value={order.status}
              disabled={manualStatuses.length === 1}
              onChange={e => onStatus(e.target.value)}
            >
              {manualStatuses.map(status => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            <button type="button" className="iconBtn" aria-label="Rincian" aria-expanded={expanded} onClick={onToggle}>
              <ChevronDown size={15} aria-hidden="true" />
            </button>
          </div>
        </td>
      </tr>
      {expanded ? (
        <tr>
          <td colSpan={8}>
            <div className="orderDetail">
              {(order.items || []).map(item => (
                <div className="split" key={item.id}>
                  <span>
                    {item.name} × {item.qty}
                  </span>
                  <span>{rupiah(item.price * item.qty)}</span>
                </div>
              ))}
              <div className="split rowLine">
                <span>Subtotal</span>
                <span>{rupiah(order.subtotal)}</span>
              </div>
              {Number(order.discount) > 0 ? (
                <div className="split rowLine">
                  <span>Diskon</span>
                  <span>−{rupiah(Number(order.discount))}</span>
                </div>
              ) : null}
              <div className="split rowLine">
                <span>Pajak + Service</span>
                <span>{rupiah(order.tax + order.service)}</span>
              </div>
              <div className="split">
                <b>Total</b>
                <b>{rupiah(order.total)}</b>
              </div>
              {order.note ? <p className="muted">Catatan: {order.note}</p> : null}
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

const KITCHEN_FLOW: Record<string, string> = {
  NEW: "CONFIRMED",
  CONFIRMED: "COOKING",
  COOKING: "READY",
};

export function KitchenPage({notify, role = "admin"}: {notify: (message: string) => void; role?: NonNullable<SessionInfo["role"]>}) {
  const ordersRes = useResource<GasOrder[]>(
    () => gasCall<GasOrder[]>("getOrders", {withItems: true, limit: 100}),
    12_000
  );
  const orders = useMemo(() => ordersRes.data || [], [ordersRes.data]);
  const cols = ["NEW", "CONFIRMED", "COOKING", "READY"];

  useEffect(() => {
    const hardware = loadHardwareSettings();
    if (!hardware.autoPrintKitchen || !orders.length) return;
    const candidates = orders.filter(order => ["NEW", "CONFIRMED", "COOKING", "READY"].includes(order.status));
    let cancelled = false;
    (async () => {
      for (const order of candidates) {
        if (cancelled) break;
        try { await printKitchenOnce(order, hardware); }
        catch { /* KDS tetap berjalan; status koneksi tersedia di menu Perangkat */ }
      }
    })();
    return () => { cancelled = true; };
  }, [orders]);

  const advance = async (order: GasOrder) => {
    const next = KITCHEN_FLOW[order.status];
    if (!next) return;
    try {
      await gasCall("updateOrderStatus", {id: order.id, status: next});
      ordersRes.reload();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Gagal mengubah status");
    }
  };

  const cancel = async (order: GasOrder) => {
    const reason = window.prompt(`Alasan membatalkan ${order.id}:`, "")?.trim() || "";
    if (!reason) return;
    try {
      await gasCall("updateOrderStatus", {id: order.id, status: "CANCELLED", reason});
      notify(`${order.id} dibatalkan dan stok dikembalikan`);
      ordersRes.reload();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Gagal membatalkan");
    }
  };

  return (
    <div>
      <div className="split" style={{marginBottom: 12}}>
        <div>
          <h2>Kitchen Display</h2>
          <p className="muted">Auto-refresh 12 detik • tiket hidup</p>
        </div>
        <button type="button" className="iconBtn" aria-label="Muat ulang" onClick={ordersRes.reload}>
          <RefreshCw size={16} aria-hidden="true" />
        </button>
      </div>
      {ordersRes.setup ? (
        <p className="alert error">Backend belum terhubung. Periksa konfigurasi GAS di environment server.</p>
      ) : ordersRes.error ? (
        <p className="alert error" role="alert">
          {ordersRes.error}
        </p>
      ) : (
        <div className="grid kdsGrid">
          {cols.map(col => {
            const list = orders.filter(order => order.status === col);
            return (
              <div className="card glass" key={col}>
                <div className="split">
                  <h2>{col}</h2>
                  <span className="badge">{list.length}</span>
                </div>
                {list.length === 0 ? <div className="empty">Tidak ada order.</div> : null}
                {list.map(order => {
                  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(order.createdAt)) / 60000));
                  const late = minutes >= 15;
                  return (
                    <div className={`card ticket ${late ? "ticketLate" : ""}`} key={order.id}>
                      <div className="split">
                        <b>{order.id}</b>
                        <span className={late ? "textRed" : "muted"}>{minutes}m</span>
                      </div>
                      <p className="muted">
                        {order.tableCode || "Takeaway"} • {order.customerName || "Guest"} • {order.channel}
                      </p>
                      {(order.items || []).map(item => (
                        <div key={item.id} className="ticketItem">
                          • {item.name} × {item.qty}
                          {item.note ? <em className="muted"> ({item.note})</em> : null}
                        </div>
                      ))}
                      <div className="btnRow" style={{marginTop: 8}}>
                        <button type="button" className="btn" title="Cetak tiket dapur" onClick={async () => {
                          try {
                            const sent = await printKitchenDirect(order);
                            notify(sent ? `Tiket ${order.id} dikirim ke printer dapur` : "Atur printer direct di menu Perangkat");
                          } catch (e) { notify(e instanceof Error ? e.message : "Cetak tiket dapur gagal"); }
                        }}><Printer size={15} aria-hidden="true" /> Cetak</button>
                        {KITCHEN_FLOW[order.status] ? (
                          <button type="button" className="btn primary fullWidth" onClick={() => advance(order)}>
                            <Check size={15} aria-hidden="true" /> Lanjut
                          </button>
                        ) : <span className="badge green">Siap disajikan</span>}
                        {col === "NEW" && ["admin", "manager"].includes(role) ? (
                          <button
                            type="button"
                            className="btn danger"
                            aria-label={`Batalkan ${order.id}`}
                            onClick={() => cancel(order)}
                          >
                            <X size={15} aria-hidden="true" />
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

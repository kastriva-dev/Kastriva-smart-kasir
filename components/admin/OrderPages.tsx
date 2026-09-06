"use client";
import {useMemo, useState} from "react";
import {Check, ChevronDown, CreditCard, RefreshCw, Search, X} from "lucide-react";
import {rupiah} from "@/lib/data";
import {formatClock, gasCall, ORDER_STATUSES, PAYMENT_LABELS, PAYMENT_METHODS, type GasOrder, type PaymentMethod} from "@/lib/api";
import {useResource} from "@/components/admin/useResource";
import {ReceiptModal} from "@/components/admin/PosPage";

function statusTone(status: string): string {
  if (status === "PAID" || status === "SERVED") return "green";
  if (status === "NEW") return "amber";
  if (status === "CANCELLED") return "red";
  return "";
}

const ACTIVE_STATUSES = ["NEW", "CONFIRMED", "COOKING", "READY", "SERVED"];

export function OrdersPage({notify}: {notify: (message: string) => void}) {
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
    try {
      await gasCall("updateOrderStatus", {id: order.id, status});
      notify(`Status ${order.id} → ${status}`);
      ordersRes.reload();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Gagal mengubah status");
    }
  };

  const openPay = (order: GasOrder) => {
    setMethod("CASH");
    setPaidInput("");
    setPayTarget(order);
  };

  const confirmPay = async () => {
    if (!payTarget || busy) return;
    const paid = Number(paidInput.replace(/[^\d]/g, "")) || 0;
    if (method === "CASH" && paid < payTarget.total) {
      notify("Uang yang dibayar kurang dari total");
      return;
    }
    setBusy(true);
    try {
      const paidOrder = await gasCall<GasOrder>("payOrder", {
        id: payTarget.id,
        method,
        paidAmount: method === "CASH" ? paid : payTarget.total
      });
      setPayTarget(null);
      ordersRes.reload();
      setReceiptOrder(paidOrder);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Pembayaran gagal");
    } finally {
      setBusy(false);
    }
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
            <div className="segRow" role="radiogroup" aria-label="Metode pembayaran">
              {PAYMENT_METHODS.map(m => (
                <button
                  type="button"
                  key={m}
                  className={`seg ${method === m ? "segOn" : ""}`}
                  role="radio"
                  aria-checked={method === m}
                  onClick={() => setMethod(m)}
                >
                  {PAYMENT_LABELS[m]}
                </button>
              ))}
            </div>
            {method === "CASH" ? (
              <label className="label" style={{marginTop: 10}}>
                Uang diterima
                <input
                  className="input"
                  inputMode="numeric"
                  autoFocus
                  value={paidInput ? Number(paidInput).toLocaleString("id-ID") : ""}
                  onChange={e => setPaidInput(e.target.value.replace(/[^\d]/g, "").slice(0, 12))}
                />
              </label>
            ) : null}
            <button type="button" className="btn success fullWidth" style={{marginTop: 14}} disabled={busy} onClick={confirmPay}>
              <CreditCard size={15} aria-hidden="true" /> {busy ? "Memproses..." : "Konfirmasi Pembayaran"}
            </button>
          </div>
        </div>
      ) : null}

      {receiptOrder ? (
        <ReceiptModal order={receiptOrder} storeName="Kastriva" onClose={() => setReceiptOrder(null)} />
      ) : null}
    </div>
  );
}

function OrderRow({
  order,
  expanded,
  onToggle,
  onStatus,
  onPay
}: {
  order: GasOrder;
  expanded: boolean;
  onToggle: () => void;
  onStatus: (status: string) => void;
  onPay: () => void;
}) {
  const paid = order.status === "PAID";
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
            {!paid && order.status !== "CANCELLED" ? (
              <button type="button" className="btn success" onClick={onPay}>
                Bayar
              </button>
            ) : null}
            <select
              className="input selectInline"
              aria-label={`Ubah status ${order.id}`}
              value={order.status}
              onChange={e => onStatus(e.target.value)}
            >
              {ORDER_STATUSES.map(status => (
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
  READY: "SERVED"
};

export function KitchenPage({notify}: {notify: (message: string) => void}) {
  const ordersRes = useResource<GasOrder[]>(
    () => gasCall<GasOrder[]>("getOrders", {withItems: true, limit: 100}),
    12_000
  );
  const orders = ordersRes.data || [];
  const cols = ["NEW", "CONFIRMED", "COOKING", "READY"];

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
    try {
      await gasCall("updateOrderStatus", {id: order.id, status: "CANCELLED"});
      notify(`${order.id} dibatalkan`);
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
                        <button type="button" className="btn primary fullWidth" onClick={() => advance(order)}>
                          <Check size={15} aria-hidden="true" /> {col === "READY" ? "Sajikan" : "Lanjut"}
                        </button>
                        {col === "NEW" ? (
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

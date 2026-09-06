"use client";
import {useEffect, useMemo, useState} from "react";
import {Banknote, CreditCard, Pause, Play, Printer, QrCode, Trash2, Wallet, X} from "lucide-react";
import {rupiah} from "@/lib/data";
import {
  PAYMENT_LABELS,
  PAYMENT_METHODS,
  previewTotals,
  type GasMenu,
  type GasOrder,
  type GasSettings,
  type GasTable,
  type HeldOrder,
  type PaymentMethod,
  loadHeldOrders,
  saveHeldOrders
} from "@/lib/api";

type CartLine = {item: GasMenu; qty: number};

type Props = {
  menus: GasMenu[];
  tables: GasTable[];
  settings: GasSettings | null;
  storeName: string;
  notify: (message: string) => void;
  refreshMenus: () => void;
};

const METHOD_ICON: Record<PaymentMethod, React.ReactNode> = {
  CASH: <Banknote size={17} aria-hidden="true" />,
  QRIS: <QrCode size={17} aria-hidden="true" />,
  DEBIT: <CreditCard size={17} aria-hidden="true" />,
  EWALLET: <Wallet size={17} aria-hidden="true" />,
  TRANSFER: <Wallet size={17} aria-hidden="true" />
};

function hasStock(item: GasMenu): boolean {
  return typeof item.stock !== "number" || item.stock > 0;
}

function stockOf(item: GasMenu): number | null {
  return typeof item.stock === "number" ? item.stock : null;
}

export default function PosPage({menus, tables, settings, storeName, notify, refreshMenus}: Props) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cat, setCat] = useState("All");
  const [query, setQuery] = useState("");
  const [tableCode, setTableCode] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [orderNote, setOrderNote] = useState("");
  const [discount, setDiscount] = useState("");
  const [payOpen, setPayOpen] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [paidInput, setPaidInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<GasOrder | null>(null);
  const [held, setHeld] = useState<HeldOrder[]>([]);
  const [heldOpen, setHeldOpen] = useState(false);

  useEffect(() => setHeld(loadHeldOrders()), []);

  const categories = useMemo(
    () => ["All", ...Array.from(new Set(menus.map(m => m.category || "Lainnya")))],
    [menus]
  );
  const filtered = useMemo(
    () =>
      menus.filter(
        m =>
          (cat === "All" || (m.category || "Lainnya") === cat) &&
          m.name.toLowerCase().includes(query.trim().toLowerCase())
      ),
    [menus, cat, query]
  );

  const subtotal = useMemo(() => cart.reduce((sum, line) => sum + line.item.price * line.qty, 0), [cart]);
  const discountValue = Math.max(0, Math.round(Number(discount.replace(/[^\d]/g, "")) || 0));
  const totals = useMemo(() => previewTotals(subtotal, discountValue, settings), [subtotal, discountValue, settings]);

  const add = (item: GasMenu) => {
    if (!hasStock(item)) {
      notify(`Stok habis: ${item.name}`);
      return;
    }
    setCart(lines => {
      const found = lines.find(line => line.item.id === item.id);
      const currentQty = found ? found.qty : 0;
      const stock = stockOf(item);
      if (stock !== null && currentQty + 1 > stock) {
        notify(`Stok ${item.name} tersisa ${stock}`);
        return lines;
      }
      return found
        ? lines.map(line => (line.item.id === item.id ? {...line, qty: line.qty + 1} : line))
        : [...lines, {item, qty: 1}];
    });
  };

  const changeQty = (id: string, delta: number) =>
    setCart(lines =>
      lines
        .map(line => {
          if (line.item.id !== id) return line;
          const nextQty = line.qty + delta;
          const stock = stockOf(line.item);
          if (delta > 0 && stock !== null && nextQty > stock) {
            notify(`Stok ${line.item.name} tersisa ${stock}`);
            return line;
          }
          return {...line, qty: nextQty};
        })
        .filter(line => line.qty > 0)
    );

  const openPayment = () => {
    if (!cart.length) {
      notify("Keranjang masih kosong");
      return;
    }
    setMethod("CASH");
    setPaidInput("");
    setPayOpen(true);
  };

  const quickCash = (value: number | "exact") => {
    if (value === "exact") setPaidInput(String(totals.total));
    else setPaidInput(String(Math.ceil(totals.total / value) * value));
  };

  const paidAmount = Number(paidInput.replace(/[^\d]/g, "")) || 0;
  const change = method === "CASH" ? paidAmount - totals.total : 0;

  const confirmPayment = async () => {
    if (submitting) return;
    if (method === "CASH" && paidAmount < totals.total) {
      notify("Uang yang dibayar kurang dari total");
      return;
    }
    setSubmitting(true);
    try {
      const order = await createOrderFromCart();
      if (!order) return;
      const paid = method === "CASH" ? paidAmount : totals.total;
      const paidOrder = await finalizePayment(order, method, paid);
      if (paidOrder) {
        setReceipt(paidOrder);
        resetCart();
        setPayOpen(false);
        // Stok berkurang di server: segarkan badge stok pada grid menu.
        refreshMenus();
      }
    } catch (e) {
      notify(e instanceof Error ? e.message : "Transaksi gagal");
    } finally {
      setSubmitting(false);
    }
  };

  /** Membuat order POS di backend. Mengembalikan null bila gagal (sudah dinotifikasi). */
  const createOrderFromCart = async (): Promise<GasOrder | null> => {
    try {
      return await fetch("/api/gas", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          action: "createOrder",
          payload: {
            channel: "POS",
            tableCode,
            customerName: customerName.trim(),
            note: orderNote.trim(),
            discount: discountValue,
            items: cart.map(line => ({menuItemId: line.item.id, name: line.item.name, qty: line.qty}))
          }
        })
      })
        .then(async res => {
          const body = (await res.json()) as {ok?: boolean; data?: GasOrder; error?: string};
          if (!res.ok || !body.ok || !body.data) throw new Error(body.error || "Gagal menyimpan pesanan");
          return body.data;
        });
    } catch (e) {
      notify(e instanceof Error ? e.message : "Gagal menyimpan pesanan");
      return null;
    }
  };

  /** Membayar order yang baru dibuat. Mengembalikan null bila gagal (order tetap tersimpan). */
  const finalizePayment = async (order: GasOrder, payMethod: PaymentMethod, paid: number): Promise<GasOrder | null> => {
    try {
      return await fetch("/api/gas", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({action: "payOrder", payload: {id: order.id, method: payMethod, paidAmount: paid}})
      }).then(async res => {
        const body = (await res.json()) as {ok?: boolean; data?: GasOrder; error?: string};
        if (!res.ok || !body.ok || !body.data) throw new Error(body.error || "Pembayaran gagal dicatat");
        return body.data;
      });
    } catch (err) {
      // Order sudah tersimpan; kasir bisa menyelesaikan pembayaran di halaman Pesanan.
      notify(`Order ${order.id} tersimpan, pembayaran gagal: ${err instanceof Error ? err.message : "coba lagi"}`);
      return null;
    }
  };

  const resetCart = () => {
    setCart([]);
    setDiscount("");
    setCustomerName("");
    setOrderNote("");
  };

  const holdOrder = () => {
    if (!cart.length) {
      notify("Keranjang masih kosong");
      return;
    }
    const entry: HeldOrder = {
      id: `H-${Date.now().toString(36)}`,
      label: tableCode || customerName.trim() || "Takeaway",
      savedAt: Date.now(),
      tableCode,
      customerName: customerName.trim(),
      note: orderNote.trim(),
      lines: cart.map(line => ({
        menuItemId: line.item.id,
        name: line.item.name,
        price: line.item.price,
        qty: line.qty,
        emoji: line.item.emoji
      }))
    };
    const next = [...held, entry];
    setHeld(next);
    saveHeldOrders(next);
    resetCart();
    notify(`Pesanan ditahan (${entry.label})`);
  };

  const recallHeld = (entry: HeldOrder) => {
    const items: Record<string, GasMenu> = {};
    menus.forEach(m => (items[m.id] = m));
    const lines: CartLine[] = [];
    for (const line of entry.lines) {
      const item = items[line.menuItemId];
      if (!item) {
        notify(`Menu tidak tersedia lagi: ${line.name}`);
        continue;
      }
      lines.push({item, qty: line.qty});
    }
    if (!lines.length) return;
    setCart(lines);
    setTableCode(entry.tableCode);
    setCustomerName(entry.customerName);
    setOrderNote(entry.note);
    removeHeld(entry.id);
    setHeldOpen(false);
  };

  const removeHeld = (id: string) => {
    const next = held.filter(entry => entry.id !== id);
    setHeld(next);
    saveHeldOrders(next);
  };

  return (
    <div className="grid pos">
      <div>
        <div className="card glass">
          <div className="split">
            <div>
              <h2>Point of Sale</h2>
              <p className="muted">Dine-in • Takeaway • QR • Stok real-time</p>
            </div>
            <span className="badge green">Register #01</span>
          </div>
          <input
            className="search"
            placeholder="Cari menu..."
            aria-label="Cari menu"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <div className="catRow" style={{marginTop: 10}}>
            {categories.map(c => (
              <button
                type="button"
                key={c}
                className={`btn cat ${cat === c ? "primary" : ""}`}
                onClick={() => setCat(c)}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="grid menuGrid" style={{marginTop: 14}}>
          {filtered.length === 0 ? <div className="card glass empty">Menu tidak ditemukan.</div> : null}
          {filtered.map(item => {
            const stock = stockOf(item);
            const available = hasStock(item);
            return (
              <div className={`card glass menuItem ${available ? "" : "menuItemOff"}`} key={item.id}>
                <div className="menuIcon" aria-hidden="true">
                  {item.emoji || "🍽️"}
                </div>
                <h3>{item.name}</h3>
                <div className="split">
                  <span className="muted">{item.category || "Lainnya"}</span>
                  <span className="price">{rupiah(item.price)}</span>
                </div>
                {stock !== null && stock <= 5 ? (
                  <span className={`badge ${stock === 0 ? "red" : "amber"} stockBadge`}>
                    {stock === 0 ? "Habis" : `Sisa ${stock}`}
                  </span>
                ) : null}
                <button
                  type="button"
                  className="btn primary fullWidth"
                  style={{marginTop: 12}}
                  disabled={!available}
                  onClick={() => add(item)}
                >
                  {available ? "Tambah" : "Stok habis"}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <aside className="card glass cart">
        <div className="split">
          <h2>Pesanan Saat Ini</h2>
          <span className="badge">{cart.reduce((sum, line) => sum + line.qty, 0)} item</span>
        </div>

        <div className="formGrid" style={{marginTop: 10}}>
          <label className="label">
            Meja / Tipe
            <select className="input" value={tableCode} onChange={e => setTableCode(e.target.value)}>
              <option value="">Takeaway</option>
              {tables.map(table => (
                <option key={table.id} value={table.code}>
                  {table.code} ({table.seats} kursi)
                </option>
              ))}
            </select>
          </label>
          <label className="label">
            Nama pelanggan
            <input
              className="input"
              value={customerName}
              maxLength={80}
              placeholder="Opsional"
              onChange={e => setCustomerName(e.target.value)}
            />
          </label>
        </div>

        {!cart.length ? (
          <div className="empty">Pilih menu untuk memulai transaksi.</div>
        ) : (
          cart.map(line => (
            <div className="cartLine" key={line.item.id}>
              <div>
                <b>{line.item.emoji} {line.item.name}</b>
                <div className="muted">{rupiah(line.item.price)} × {line.qty} = {rupiah(line.item.price * line.qty)}</div>
              </div>
              <div className="qty">
                <button type="button" aria-label={`Kurangi ${line.item.name}`} onClick={() => changeQty(line.item.id, -1)}>
                  −
                </button>
                <b>{line.qty}</b>
                <button type="button" aria-label={`Tambah ${line.item.name}`} onClick={() => add(line.item)}>
                  +
                </button>
              </div>
            </div>
          ))
        )}

        <div className="formGrid" style={{marginTop: 10}}>
          <label className="label">
            Diskon (Rp)
            <input
              className="input"
              inputMode="numeric"
              value={discount}
              placeholder="0"
              onChange={e => setDiscount(e.target.value.replace(/[^\d]/g, "").slice(0, 12))}
            />
          </label>
          <label className="label">
            Catatan
            <input
              className="input"
              value={orderNote}
              maxLength={300}
              placeholder="Opsional"
              onChange={e => setOrderNote(e.target.value)}
            />
          </label>
        </div>

        <div style={{marginTop: 14}}>
          <div className="split">
            <span>Subtotal</span>
            <b>{rupiah(totals.subtotal)}</b>
          </div>
          {totals.discount > 0 ? (
            <div className="split muted" style={{marginTop: 6}}>
              <span>Diskon</span>
              <span>−{rupiah(totals.discount)}</span>
            </div>
          ) : null}
          <div className="split muted" style={{marginTop: 6}}>
            <span>Pajak {Math.round((settings?.taxRate ?? 0) * 100) / 100}%</span>
            <span>{rupiah(totals.tax)}</span>
          </div>
          <div className="split muted" style={{marginTop: 6}}>
            <span>Service {Math.round((settings?.serviceRate ?? 0) * 100) / 100}%</span>
            <span>{rupiah(totals.service)}</span>
          </div>
          <div className="split" style={{marginTop: 10}}>
            <span className="total">Total</span>
            <span className="total">{rupiah(totals.total)}</span>
          </div>

          <button type="button" className="btn success fullWidth" style={{marginTop: 14}} onClick={openPayment}>
            Bayar Sekarang
          </button>
          <div className="btnRow" style={{marginTop: 8}}>
            <button type="button" className="btn" onClick={holdOrder}>
              <Pause size={15} aria-hidden="true" /> Tahan
            </button>
            <button type="button" className="btn" onClick={() => setHeldOpen(true)}>
              <Play size={15} aria-hidden="true" /> Panggil ({held.length})
            </button>
            <button type="button" className="btn danger" aria-label="Kosongkan keranjang" onClick={resetCart}>
              <Trash2 size={15} aria-hidden="true" />
            </button>
          </div>
        </div>

        {heldOpen ? (
          <div className="heldList" style={{marginTop: 12}}>
            <div className="split">
              <b>Pesanan Ditahan</b>
              <button type="button" className="iconBtn" aria-label="Tutup daftar" onClick={() => setHeldOpen(false)}>
                <X size={15} aria-hidden="true" />
              </button>
            </div>
            {held.length === 0 ? <p className="muted">Tidak ada pesanan ditahan.</p> : null}
            {held.map(entry => (
              <div className="split rowLine" key={entry.id}>
                <span>
                  {entry.label} • {entry.lines.reduce((s, l) => s + l.qty, 0)} item
                </span>
                <span className="btnRow">
                  <button type="button" className="btn" onClick={() => recallHeld(entry)}>
                    Panggil
                  </button>
                  <button
                    type="button"
                    className="btn danger"
                    aria-label={`Hapus ${entry.label}`}
                    onClick={() => removeHeld(entry.id)}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </aside>

      {payOpen ? (
        <div className="modal" role="dialog" aria-modal="true" aria-label="Pembayaran">
          <div className="modalCard glass">
            <div className="split">
              <h2>Pembayaran</h2>
              <button type="button" className="iconBtn" aria-label="Tutup" onClick={() => setPayOpen(false)}>
                <X size={17} aria-hidden="true" />
              </button>
            </div>

            <div className="payTotal">
              <span className="muted">Total tagihan</span>
              <b className="total">{rupiah(totals.total)}</b>
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
                  {METHOD_ICON[m]} {PAYMENT_LABELS[m]}
                </button>
              ))}
            </div>

            {method === "CASH" ? (
              <div>
                <label className="label">
                  Uang diterima
                  <input
                    className="input cashInput"
                    inputMode="numeric"
                    autoFocus
                    value={paidInput ? Number(paidInput).toLocaleString("id-ID") : ""}
                    aria-invalid={paidAmount > 0 && paidAmount < totals.total}
                    onChange={e => setPaidInput(e.target.value.replace(/[^\d]/g, "").slice(0, 12))}
                  />
                </label>
                <div className="btnRow" style={{marginTop: 8}}>
                  <button type="button" className="btn" onClick={() => quickCash("exact")}>
                    Pas
                  </button>
                  {[20000, 50000, 100000].map(v => (
                    <button type="button" key={v} className="btn" onClick={() => quickCash(v)}>
                      {v / 1000}rb
                    </button>
                  ))}
                </div>
                <div className="split" style={{marginTop: 12}}>
                  <span>Kembalian</span>
                  <b className={change < 0 ? "textRed" : "textGreen"}>{rupiah(Math.max(change, 0))}</b>
                </div>
              </div>
            ) : (
              <p className="muted" style={{marginTop: 12}}>
                Pembayaran non-tunai dicatat senilai total tagihan. Pastikan pembayaran diterima sebelum konfirmasi.
              </p>
            )}

            <button type="button" className="btn success fullWidth" style={{marginTop: 16}} disabled={submitting} onClick={confirmPayment}>
              {submitting ? "Memproses..." : `Konfirmasi ${PAYMENT_LABELS[method]}`}
            </button>
          </div>
        </div>
      ) : null}

      {receipt ? (
        <ReceiptModal order={receipt} storeName={storeName} onClose={() => setReceipt(null)} />
      ) : null}
    </div>
  );
}

export function ReceiptModal({order, storeName, onClose}: {order: GasOrder; storeName: string; onClose: () => void}) {
  const items = order.items || [];
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Struk pembayaran">
      <div className="modalCard glass">
        <div className="split">
          <h2>Transaksi Berhasil</h2>
          <button type="button" className="iconBtn noPrint" aria-label="Tutup" onClick={onClose}>
            <X size={17} aria-hidden="true" />
          </button>
        </div>

        <div className="receiptPrint">
          <div className="receiptHead">
            <b>{storeName}</b>
            <span>Struk: {order.id}</span>
            <span>{new Date(order.createdAt).toLocaleString("id-ID")}</span>
            <span>{order.tableCode ? `Meja ${order.tableCode}` : "Takeaway"} • Kasir POS</span>
          </div>
          <div className="receiptBody">
            {items.map(item => (
              <div className="receiptLine" key={item.id}>
                <span>{item.name} x{item.qty}</span>
                <span>{rupiah(item.price * item.qty)}</span>
              </div>
            ))}
            <div className="receiptLine muted">
              <span>Subtotal</span>
              <span>{rupiah(order.subtotal)}</span>
            </div>
            {Number(order.discount) > 0 ? (
              <div className="receiptLine muted">
                <span>Diskon</span>
                <span>−{rupiah(Number(order.discount))}</span>
              </div>
            ) : null}
            <div className="receiptLine muted">
              <span>Pajak</span>
              <span>{rupiah(order.tax)}</span>
            </div>
            <div className="receiptLine muted">
              <span>Service</span>
              <span>{rupiah(order.service)}</span>
            </div>
            <div className="receiptLine receiptTotal">
              <span>TOTAL</span>
              <span>{rupiah(order.total)}</span>
            </div>
            <div className="receiptLine muted">
              <span>{PAYMENT_LABELS[(order.paymentMethod || "CASH") as PaymentMethod] || order.paymentMethod}</span>
              <span>{rupiah(Number(order.paidAmount) || order.total)}</span>
            </div>
            {Number(order.changeAmount) > 0 ? (
              <div className="receiptLine">
                <span>Kembalian</span>
                <span>{rupiah(Number(order.changeAmount))}</span>
              </div>
            ) : null}
          </div>
          <div className="receiptFoot">Terima kasih • Simpan struk ini</div>
        </div>

        <div className="btnRow" style={{marginTop: 14}}>
          <button type="button" className="btn primary noPrint" onClick={() => window.print()}>
            <Printer size={15} aria-hidden="true" /> Cetak Struk
          </button>
          <button type="button" className="btn noPrint" onClick={onClose}>
            Transaksi Baru
          </button>
        </div>
      </div>
    </div>
  );
}

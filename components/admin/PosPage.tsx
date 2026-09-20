"use client";
import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {Banknote, CreditCard, Pause, Play, Printer, QrCode, ScanBarcode, Trash2, Wallet, X, BadgePercent, UserRoundSearch} from "lucide-react";
import {rupiah} from "@/lib/data";
import BarcodeScannerModal from "@/components/admin/BarcodeScannerModal";
import {loadHardwareSettings, normalizeScannedBarcode, openCashDrawer, printKitchenOnce, printReceiptDirect} from "@/lib/hardware";
import {
  PAYMENT_LABELS,
  PAYMENT_METHODS,
  gasCall,
  previewTotals,
  type GasMenu,
  type GasOrder,
  type GasCustomer,
  type GasPromotion,
  type GasVoucher,
  type GasSettings,
  type GasTable,
  type HeldOrder,
  type PaymentMethod,
  loadHeldOrders,
  newClientOrderId,
  saveHeldOrders
} from "@/lib/api";

type CartLine = {item: GasMenu; qty: number};
type SplitPayLine = {method: PaymentMethod; amount: string; received: string};

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
  const [customerPhone, setCustomerPhone] = useState("");
  const [member, setMember] = useState<GasCustomer | null>(null);
  const [promotions, setPromotions] = useState<GasPromotion[]>([]);
  const [vouchers, setVouchers] = useState<GasVoucher[]>([]);
  const [promoId, setPromoId] = useState("");
  const [voucherCode, setVoucherCode] = useState("");
  const [pointsToRedeem, setPointsToRedeem] = useState("");
  const [orderNote, setOrderNote] = useState("");
  const [discountType, setDiscountType] = useState<"FIXED" | "PERCENT">("FIXED");
  const [discount, setDiscount] = useState("");
  const [payOpen, setPayOpen] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [paidInput, setPaidInput] = useState("");
  const [splitMode, setSplitMode] = useState(false);
  const [splitPayments, setSplitPayments] = useState<SplitPayLine[]>([{method:"CASH",amount:"",received:""},{method:"QRIS",amount:"",received:""}]);
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<GasOrder | null>(null);
  const [held, setHeld] = useState<HeldOrder[]>([]);
  const [heldOpen, setHeldOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const transactionKeyRef = useRef("");
  const scannerBufferRef = useRef("");
  const scannerLastRef = useRef(0);

  useEffect(() => setHeld(loadHeldOrders()), []);
  useEffect(() => {
    gasCall<GasPromotion[]>("getPromotions").then(rows => setPromotions(rows.filter(r => r.active !== false))).catch(() => {});
    gasCall<GasVoucher[]>("getVouchers").then(rows => setVouchers(rows.filter(r => r.active !== false))).catch(() => {});
  }, []);


  const add = useCallback((item: GasMenu) => {
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
  }, [notify]);

  const scanBarcode = useCallback((raw: string) => {
    const barcode = normalizeScannedBarcode(raw);
    if (!barcode) return;
    const item = menus.find(menu => normalizeScannedBarcode(menu.barcode || "") === barcode);
    if (!item) {
      notify(`Barcode ${barcode} tidak terdaftar`);
      return;
    }
    add(item);
    notify(`${item.name} ditambahkan dari barcode`);
  }, [add, menus, notify]);

  useEffect(() => {
    const settings = loadHardwareSettings();
    if (!settings.keyboardScanner) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (payOpen || cameraOpen || receipt) return;
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      const now = Date.now();
      if (now - scannerLastRef.current > 120) scannerBufferRef.current = "";
      scannerLastRef.current = now;
      if (event.key === "Enter" || event.key === "Tab") {
        const code = scannerBufferRef.current;
        scannerBufferRef.current = "";
        if (code.length >= 3) { event.preventDefault(); scanBarcode(code); }
        return;
      }
      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        scannerBufferRef.current += event.key;
        if (scannerBufferRef.current.length > 64) scannerBufferRef.current = scannerBufferRef.current.slice(-64);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [payOpen, cameraOpen, receipt, scanBarcode]);

  const categories = useMemo(
    () => ["All", ...Array.from(new Set(menus.map(m => m.category || "Lainnya")))],
    [menus]
  );
  const filtered = useMemo(
    () =>
      menus.filter(
        m =>
          (cat === "All" || (m.category || "Lainnya") === cat) &&
          (m.name.toLowerCase().includes(query.trim().toLowerCase()) || String(m.barcode || "").toLowerCase().includes(query.trim().toLowerCase()))
      ),
    [menus, cat, query]
  );

  const subtotal = useMemo(() => cart.reduce((sum, line) => sum + line.item.price * line.qty, 0), [cart]);
  const rawDiscountValue = Math.max(0, Number(discount.replace(/[^\d.]/g, "")) || 0);
  const manualDiscountPreview = discountType === "PERCENT" ? Math.round(subtotal * Math.min(rawDiscountValue, 100) / 100) : Math.round(rawDiscountValue);
  const calcRule = (rule?: {type:string;value:number;minSpend:number;maxDiscount:number;startAt?:string;endAt?:string;active?:boolean;usageLimit?:number;usedCount?:number}) => {
    if (!rule || rule.active === false || subtotal < Number(rule.minSpend || 0)) return 0;
    if (Number(rule.usageLimit || 0) > 0 && Number(rule.usedCount || 0) >= Number(rule.usageLimit || 0)) return 0;
    const now=Date.now(), start=rule.startAt?Date.parse(rule.startAt):NaN, end=rule.endAt?Date.parse(rule.endAt):NaN;
    if ((Number.isFinite(start)&&now<start)||(Number.isFinite(end)&&now>end)) return 0;
    let amount=rule.type === "PERCENT" ? Math.round(subtotal*Math.min(Number(rule.value)||0,100)/100) : Math.round(Number(rule.value)||0);
    if(Number(rule.maxDiscount)>0) amount=Math.min(amount,Number(rule.maxDiscount)); return Math.max(0,amount);
  };
  const promoPreview = calcRule(promotions.find(r=>r.id===promoId));
  const voucherPreview = calcRule(vouchers.find(r=>r.code.toUpperCase()===voucherCode.trim().toUpperCase()));
  const pointValue = Number(settings?.loyaltyPointValue || 100);
  const maxRedeemPoints = Math.min(Number(member?.points||0), Math.floor(subtotal * Number(settings?.maxRedeemPercent ?? 30) / 100 / Math.max(1,pointValue)));
  const redeemPoints = Math.min(Math.max(0,Number(pointsToRedeem)||0),maxRedeemPoints);
  const pointsPreview = redeemPoints * pointValue;
  const discountValue = Math.min(subtotal, manualDiscountPreview + promoPreview + voucherPreview + pointsPreview);
  const totals = useMemo(() => previewTotals(subtotal, discountValue, settings), [subtotal, discountValue, settings]);

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

  const lookupMember = async () => {
    if (!customerPhone.trim()) { setMember(null); notify("Isi nomor telepon member"); return; }
    try {
      const found = await gasCall<GasCustomer | null>("findCustomer", {phone: customerPhone.trim()});
      setMember(found);
      if (found) { if (!customerName.trim()) setCustomerName(found.name || ""); notify(`Member ${found.memberCode || found.name} • ${found.points || 0} poin`); }
      else notify("Member belum terdaftar; transaksi ini akan membuat member baru setelah nomor disimpan");
    } catch (e) { notify(e instanceof Error ? e.message : "Gagal mencari member"); }
  };

  const openPayment = () => {
    if (!cart.length) {
      notify("Keranjang masih kosong");
      return;
    }
    transactionKeyRef.current = newClientOrderId("POS");
    setMethod("CASH");
    setPaidInput("");
    setSplitMode(false);
    setSplitPayments([{method:"CASH",amount:String(totals.total),received:String(totals.total)},{method:"QRIS",amount:"",received:""}]);
    setPayOpen(true);
  };

  const quickCash = (value: number | "exact") => {
    if (value === "exact") setPaidInput(String(totals.total));
    else setPaidInput(String(Math.ceil(totals.total / value) * value));
  };

  const paidAmount = Number(paidInput.replace(/[^\d]/g, "")) || 0;
  const change = method === "CASH" ? paidAmount - totals.total : 0;
  const splitAllocated = splitPayments.reduce((sum,row)=>sum+(Number(row.amount.replace(/[^\d]/g,""))||0),0);

  const confirmPayment = async () => {
    if (submitting) return;
    let paymentPayload: {method: PaymentMethod; paidAmount: number} | {payments: {method: PaymentMethod; amount: number; receivedAmount: number}[]} ;
    if (splitMode) {
      const rows = splitPayments.filter(row => Number(row.amount.replace(/[^\d]/g,"")) > 0).map(row => ({
        method: row.method,
        amount: Number(row.amount.replace(/[^\d]/g,"")) || 0,
        receivedAmount: row.method === "CASH" ? (Number(row.received.replace(/[^\d]/g,"")) || 0) : (Number(row.amount.replace(/[^\d]/g,"")) || 0)
      }));
      const allocated = rows.reduce((sum,row)=>sum+row.amount,0);
      if (rows.length < 2) { notify("Split payment membutuhkan minimal 2 metode"); return; }
      if (new Set(rows.map(r=>r.method)).size !== rows.length) { notify("Metode split payment tidak boleh sama"); return; }
      if (allocated !== totals.total) { notify(`Total alokasi split harus ${rupiah(totals.total)} (sekarang ${rupiah(allocated)})`); return; }
      const badCash = rows.find(r=>r.method === "CASH" && r.receivedAmount < r.amount);
      if (badCash) { notify("Uang tunai yang diterima kurang dari alokasi tunai"); return; }
      paymentPayload = {payments: rows};
    } else {
      if (method === "CASH" && paidAmount < totals.total) { notify("Uang yang dibayar kurang dari total"); return; }
      paymentPayload = {method, paidAmount: method === "CASH" ? paidAmount : totals.total};
    }
    setSubmitting(true);
    try {
      const order = await createOrderFromCart();
      if (!order) return;
      const hardware = loadHardwareSettings();
      if (hardware.autoPrintKitchen) {
        try { await printKitchenOnce(order, hardware); }
        catch (e) { notify(e instanceof Error ? `Order tersimpan, printer dapur: ${e.message}` : "Order tersimpan, printer dapur gagal"); }
      }
      const paidOrder = await finalizePayment(order, paymentPayload);
      if (paidOrder) {
        const hardware = loadHardwareSettings();
        if (hardware.autoPrintReceipt) {
          try { await printReceiptDirect(paidOrder, storeName, hardware); }
          catch (e) { notify(e instanceof Error ? `Pembayaran berhasil, printer struk: ${e.message}` : "Pembayaran berhasil, printer struk gagal"); }
        }
        const hasCash = splitMode ? ("payments" in paymentPayload && paymentPayload.payments.some(p=>p.method === "CASH")) : method === "CASH";
        if (hasCash && hardware.openDrawerOnCash) {
          try { await openCashDrawer(hardware); } catch (e) { notify(e instanceof Error ? `Pembayaran berhasil, cash drawer: ${e.message}` : "Pembayaran berhasil, cash drawer gagal"); }
        }
        setReceipt(paidOrder);
        resetCart();
        setPayOpen(false);
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
            phone: customerPhone.trim(),
            note: orderNote.trim(),
            discount: manualDiscountPreview,
            manualDiscountType: discountType,
            manualDiscountValue: rawDiscountValue,
            promoId,
            voucherCode: voucherCode.trim().toUpperCase(),
            pointsToRedeem: redeemPoints,
            clientOrderId: transactionKeyRef.current || (transactionKeyRef.current = newClientOrderId("POS")),
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
  const finalizePayment = async (order: GasOrder, payment: {method: PaymentMethod; paidAmount: number} | {payments: {method: PaymentMethod; amount: number; receivedAmount: number}[]}): Promise<GasOrder | null> => {
    try {
      return await fetch("/api/gas", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({action: "payOrder", payload: {id: order.id, ...payment}})
      }).then(async res => {
        const body = (await res.json()) as {ok?: boolean; data?: GasOrder; error?: string};
        if (!res.ok || !body.ok || !body.data) throw new Error(body.error || "Pembayaran gagal dicatat");
        return body.data;
      });
    } catch (err) {
      notify(`Order ${order.id} tersimpan, pembayaran gagal: ${err instanceof Error ? err.message : "coba lagi"}`);
      return null;
    }
  };

  const resetCart = () => {
    setCart([]);
    setDiscount("");
    setDiscountType("FIXED");
    setCustomerName("");
    setCustomerPhone("");
    setMember(null);
    setPromoId("");
    setVoucherCode("");
    setPointsToRedeem("");
    setOrderNote("");
    transactionKeyRef.current = "";
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
          <div className="barcodeSearchRow">
            <input
              className="search"
              placeholder="Cari menu / scan barcode..."
              aria-label="Cari menu"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key !== "Enter") return;
                const exact = menus.find(menu => normalizeScannedBarcode(menu.barcode || "") === normalizeScannedBarcode(query));
                if (exact) { e.preventDefault(); add(exact); setQuery(""); notify(`${exact.name} ditambahkan dari barcode`); }
              }}
            />
            {loadHardwareSettings().cameraScanner ? (
              <button type="button" className="btn" onClick={() => setCameraOpen(true)} title="Scan barcode dengan kamera">
                <ScanBarcode size={16} aria-hidden="true" /> Kamera
              </button>
            ) : null}
          </div>
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
              {tables.map(table => <option key={table.id} value={table.code}>{table.code} ({table.seats} kursi)</option>)}
            </select>
          </label>
          <label className="label">Nama pelanggan<input className="input" value={customerName} maxLength={80} placeholder="Opsional" onChange={e => setCustomerName(e.target.value)} /></label>
          <label className="label">No. HP / Member
            <div className="btnRow"><input className="input" value={customerPhone} maxLength={20} placeholder="08..." onChange={e=>{setCustomerPhone(e.target.value.replace(/[^\d+]/g,""));setMember(null);}} />
              <button type="button" className="btn" onClick={lookupMember} title="Cari member"><UserRoundSearch size={15}/></button>
            </div>
          </label>
          {member?<div className="alert"><b>{member.memberCode || "MEMBER"}</b> • {member.name} • <b>{member.points || 0} poin</b></div>:null}
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
          <label className="label">Diskon manual
            <div className="btnRow"><select className="input" value={discountType} onChange={e=>setDiscountType(e.target.value as "FIXED"|"PERCENT")}><option value="FIXED">Rp</option><option value="PERCENT">%</option></select>
              <input className="input" inputMode="decimal" value={discount} placeholder="0" onChange={e=>setDiscount(e.target.value.replace(/[^\d.]/g,"").slice(0,12))}/>
            </div>
          </label>
          <label className="label">Promo
            <select className="input" value={promoId} onChange={e=>setPromoId(e.target.value)}><option value="">— Tanpa promo —</option>{promotions.filter(r=>r.active!==false).map(r=><option key={r.id} value={r.id}>{r.name} ({r.type==="PERCENT"?`${r.value}%`:rupiah(r.value)})</option>)}</select>
          </label>
          <label className="label">Voucher
            <input className="input" value={voucherCode} maxLength={40} placeholder="Kode voucher" onChange={e=>setVoucherCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g,""))}/>
          </label>
          <label className="label">Redeem poin {member?`(maks ${maxRedeemPoints})`:""}
            <input className="input" inputMode="numeric" disabled={!member || settings?.loyaltyEnabled===false} value={pointsToRedeem} placeholder="0" onChange={e=>setPointsToRedeem(e.target.value.replace(/[^\d]/g,"").slice(0,10))}/>
          </label>
          <label className="label">Catatan<input className="input" value={orderNote} maxLength={300} placeholder="Opsional" onChange={e => setOrderNote(e.target.value)} /></label>
        </div>

        <div style={{marginTop: 14}}>
          <div className="split">
            <span>Subtotal</span>
            <b>{rupiah(totals.subtotal)}</b>
          </div>
          {manualDiscountPreview > 0 ? <div className="split muted" style={{marginTop:6}}><span>Diskon manual {discountType==="PERCENT"?`(${rawDiscountValue}%)`:""}</span><span>−{rupiah(Math.min(subtotal,manualDiscountPreview))}</span></div>:null}
          {promoPreview > 0 ? <div className="split muted" style={{marginTop:6}}><span><BadgePercent size={13}/> Promo</span><span>−{rupiah(promoPreview)}</span></div>:null}
          {voucherPreview > 0 ? <div className="split muted" style={{marginTop:6}}><span>Voucher {voucherCode}</span><span>−{rupiah(voucherPreview)}</span></div>:null}
          {pointsPreview > 0 ? <div className="split muted" style={{marginTop:6}}><span>Redeem {redeemPoints} poin</span><span>−{rupiah(pointsPreview)}</span></div>:null}
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

            <div className="btnRow" style={{marginBottom:10}}><button type="button" className={`btn ${!splitMode?"primary":""}`} onClick={()=>setSplitMode(false)}>Satu Metode</button><button type="button" className={`btn ${splitMode?"primary":""}`} onClick={()=>setSplitMode(true)}>Split Payment</button></div>
            {!splitMode ? <>
              <div className="segRow" role="radiogroup" aria-label="Metode pembayaran">
                {PAYMENT_METHODS.map(m => <button type="button" key={m} className={`seg ${method === m ? "segOn" : ""}`} role="radio" aria-checked={method === m} onClick={() => setMethod(m)}>{METHOD_ICON[m]} {PAYMENT_LABELS[m]}</button>)}
              </div>
              {method === "CASH" ? <div><label className="label">Uang diterima<input className="input cashInput" inputMode="numeric" autoFocus value={paidInput ? Number(paidInput).toLocaleString("id-ID") : ""} aria-invalid={paidAmount > 0 && paidAmount < totals.total} onChange={e => setPaidInput(e.target.value.replace(/[^\d]/g, "").slice(0, 12))}/></label>
                <div className="btnRow" style={{marginTop:8}}><button type="button" className="btn" onClick={()=>quickCash("exact")}>Pas</button>{[20000,50000,100000].map(v=><button type="button" key={v} className="btn" onClick={()=>quickCash(v)}>{v/1000}rb</button>)}</div>
                <div className="split" style={{marginTop:12}}><span>Kembalian</span><b className={change<0?"textRed":"textGreen"}>{rupiah(Math.max(change,0))}</b></div></div>
              : <p className="muted" style={{marginTop:12}}>Pembayaran non-tunai dicatat senilai total tagihan.</p>}
            </> : <div>
              {splitPayments.map((row,index)=><div key={index} style={{marginBottom:10}}><div className="formGrid"><label className="label">Metode {index+1}<select className="input" value={row.method} onChange={e=>setSplitPayments(list=>list.map((x,i)=>i===index?{...x,method:e.target.value as PaymentMethod}:x))}>{PAYMENT_METHODS.map(m=><option key={m} value={m}>{PAYMENT_LABELS[m]}</option>)}</select></label>
                <label className="label">Alokasi (Rp)<input className="input" inputMode="numeric" value={row.amount} onChange={e=>setSplitPayments(list=>list.map((x,i)=>i===index?{...x,amount:e.target.value.replace(/[^\d]/g,"")}:x))}/></label>
                {row.method==="CASH"?<label className="label">Tunai diterima<input className="input" inputMode="numeric" value={row.received} onChange={e=>setSplitPayments(list=>list.map((x,i)=>i===index?{...x,received:e.target.value.replace(/[^\d]/g,"")}:x))}/></label>:null}</div>{splitPayments.length>2?<button type="button" className="btn danger" style={{marginTop:6}} onClick={()=>setSplitPayments(list=>list.filter((_,i)=>i!==index))}><X size={14}/> Hapus metode</button>:null}</div>)}
              <div className="split"><span>Alokasi</span><b className={splitAllocated===totals.total?"textGreen":"textRed"}>{rupiah(splitAllocated)} / {rupiah(totals.total)}</b></div>
              <div className="btnRow" style={{marginTop:8}}><button type="button" className="btn" disabled={splitPayments.length>=5} onClick={()=>{const next=PAYMENT_METHODS.find(m=>!splitPayments.some(x=>x.method===m));if(next)setSplitPayments(list=>[...list,{method:next,amount:"",received:""}]);}}>+ Metode ({splitPayments.length}/5)</button>{splitPayments.length===2?<button type="button" className="btn" onClick={()=>{const first=Math.floor(totals.total/2);setSplitPayments([{...splitPayments[0],amount:String(first),received:String(first)},{...splitPayments[1],amount:String(totals.total-first)}]);}}>Bagi 50:50</button>:null}</div>
            </div>}

            <button type="button" className="btn success fullWidth" style={{marginTop: 16}} disabled={submitting} onClick={confirmPayment}>
              {submitting ? "Memproses..." : splitMode ? "Konfirmasi Split Payment" : `Konfirmasi ${PAYMENT_LABELS[method]}`}
            </button>
          </div>
        </div>
      ) : null}

      {cameraOpen ? (
        <BarcodeScannerModal onClose={() => setCameraOpen(false)} onScan={barcode => { setCameraOpen(false); scanBarcode(barcode); }} />
      ) : null}

      {receipt ? (
        <ReceiptModal order={receipt} storeName={storeName} onClose={() => setReceipt(null)} />
      ) : null}
    </div>
  );
}

export function ReceiptModal({order, storeName, onClose}: {order: GasOrder; storeName: string; onClose: () => void}) {
  const items = order.items || [];
  let paymentRows = order.payments || [];
  if (!paymentRows.length && order.paymentSummary) { try { paymentRows = JSON.parse(order.paymentSummary); } catch { paymentRows = []; } }
  const [printStatus, setPrintStatus] = useState("");
  const thermalPrint = async () => {
    try {
      const sent = await printReceiptDirect(order, storeName);
      if (!sent) { window.print(); return; }
      setPrintStatus("Struk dikirim ke printer thermal");
    } catch (e) { setPrintStatus(e instanceof Error ? e.message : "Printer thermal gagal"); }
  };
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
            {paymentRows.length > 1 ? paymentRows.map((pay,idx)=><div className="receiptLine muted" key={`${pay.method}-${idx}`}><span>{PAYMENT_LABELS[pay.method as PaymentMethod] || pay.method}</span><span>{rupiah(Number(pay.amount)||0)}</span></div>) : <div className="receiptLine muted"><span>{PAYMENT_LABELS[(order.paymentMethod || "CASH") as PaymentMethod] || order.paymentMethod}</span><span>{rupiah(Number(order.total)||0)}</span></div>}
            {order.memberCode ? <div className="receiptLine muted"><span>Member {order.memberCode}</span><span>{Number(order.pointsEarned)||0} poin +</span></div> : null}
            {Number(order.changeAmount) > 0 ? (
              <div className="receiptLine">
                <span>Kembalian</span>
                <span>{rupiah(Number(order.changeAmount))}</span>
              </div>
            ) : null}
          </div>
          <div className="receiptFoot">Terima kasih • Simpan struk ini</div>
        </div>

        {printStatus ? <p className="muted noPrint">{printStatus}</p> : null}
        <div className="btnRow" style={{marginTop: 14}}>
          <button type="button" className="btn primary noPrint" onClick={thermalPrint}>
            <Printer size={15} aria-hidden="true" /> Cetak Struk
          </button>
          <button type="button" className="btn noPrint" onClick={() => window.print()}>Browser Print</button>
          <button type="button" className="btn noPrint" onClick={onClose}>
            Transaksi Baru
          </button>
        </div>
      </div>
    </div>
  );
}

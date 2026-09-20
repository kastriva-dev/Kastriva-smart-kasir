"use client";
import {useCallback, useEffect, useMemo, useState} from "react";
import Image from "next/image";
import {CloudUpload, Minus, Plus, RefreshCw, ShoppingCart, WifiOff, X} from "lucide-react";
import {rupiah} from "@/lib/data";
import {
  fetchPublicMenu,
  fetchPublicSettings,
  newClientOrderId,
  previewTotals,
  type GasMenu,
  type GasSettings
} from "@/lib/api";

type CartLine = {item: GasMenu; qty: number};

const WA_PHONE = (process.env.NEXT_PUBLIC_CASHIER_WHATSAPP || "").replace(/\D/g, "");

type PendingOrder = {id: string; payload: Record<string, unknown>; savedAt: number};

function queueKey(storeId: string, tableId: string) {
  return `kastriva:pendingOrder:${storeId}:${tableId}`;
}

function loadQueue(key: string): PendingOrder[] {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? (parsed as PendingOrder[]) : [];
  } catch {
    return [];
  }
}

function saveQueue(key: string, list: PendingOrder[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(list.slice(-10)));
  } catch {
    /* penyimpanan tidak tersedia: abaikan */
  }
}

function enqueuePending(key: string, payload: Record<string, unknown>): PendingOrder[] {
  const queue = loadQueue(key);
  const id = String(payload.clientOrderId || newClientOrderId("QR"));
  payload.clientOrderId = id;
  if (!queue.some(entry => String(entry.payload?.clientOrderId || entry.id) === id)) {
    queue.push({id, payload, savedAt: Date.now()});
  }
  saveQueue(key, queue);
  return queue;
}

export default function CustomerOrdering({storeId, tableId}: {storeId: string; tableId: string}) {
  const [menus, setMenus] = useState<GasMenu[]>([]);
  const [settings, setSettings] = useState<GasSettings | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [okMessage, setOkMessage] = useState("");
  const [lastOrder, setLastOrder] = useState<{id: string; total: number} | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [online, setOnline] = useState(true);

  const storageKey = `kastriva:cart:${storeId}:${tableId}`;
  const queueKeyStr = queueKey(storeId, tableId);

  const loadData = useCallback(async () => {
    setLoadState("loading");
    setLoadError("");
    try {
      const [menuList, storeSettings] = await Promise.all([fetchPublicMenu(storeId), fetchPublicSettings(storeId)]);
      setMenus(menuList);
      setSettings(storeSettings);
      setLoadState("ready");
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Gagal memuat menu");
      setLoadState("error");
    }
  }, [storeId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const flushQueue = useCallback(async () => {
    const queue = loadQueue(queueKeyStr);
    if (!queue.length) return;
    const remaining: PendingOrder[] = [];
    for (const entry of queue) {
      try {
        const res = await fetch("/api/orders", {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({action: "createOrder", payload: entry.payload})
        });
        const body = (await res.json()) as {ok?: boolean; data?: {id?: string; total?: number}; error?: string};
        if (res.ok && body.ok && body.data) {
          setLastOrder({id: body.data.id || "?", total: Number(body.data.total) || 0});
          setOkMessage("Pesanan offline berhasil terkirim otomatis.");
        } else if (res.status >= 500 || res.status === 429) {
          remaining.push(entry);
        } else {
          setError(body.error || `Pesanan offline ${entry.id} ditolak server`);
        }
      } catch {
        remaining.push(entry);
      }
    }
    saveQueue(queueKeyStr, remaining);
    setPendingCount(remaining.length);
  }, [queueKeyStr]);

  useEffect(() => {
    setPendingCount(loadQueue(queueKeyStr).length);
    const update = () => setOnline(navigator.onLine);
    update();
    const onOnline = () => {
      setOnline(true);
      void flushQueue();
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", () => setOnline(false));
    if (navigator.onLine) void flushQueue();
    return () => {
      window.removeEventListener("online", onOnline);
    };
  }, [queueKeyStr, flushQueue]);

  const cats = useMemo(
    () => ["All", ...Array.from(new Set(menus.map(m => m.category || "Lainnya")))],
    [menus]
  );
  const list = useMemo(
    () =>
      menus.filter(
        m =>
          (cat === "All" || (m.category || "Lainnya") === cat) &&
          m.name.toLowerCase().includes(q.trim().toLowerCase())
      ),
    [menus, cat, q]
  );

  const subtotal = useMemo(() => cart.reduce((sum, line) => sum + line.item.price * line.qty, 0), [cart]);
  const totals = useMemo(() => previewTotals(subtotal, 0, settings), [subtotal, settings]);
  const itemCount = cart.reduce((sum, line) => sum + line.qty, 0);

  // Keranjang bertahan saat halaman ter-refresh / kembali dari WhatsApp.
  useEffect(() => {
    if (!menus.length) return;
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (!saved) return;
      const parsed: unknown = JSON.parse(saved);
      if (!Array.isArray(parsed)) return;
      const restored: CartLine[] = [];
      for (const entry of parsed) {
        if (!entry || typeof entry !== "object") continue;
        const row = entry as {id?: unknown; qty?: unknown};
        const item = menus.find(m => m.id === String(row.id));
        const qty = Number(row.qty);
        if (item && Number.isInteger(qty) && qty > 0 && qty <= 99) restored.push({item, qty});
      }
      if (restored.length) setCart(restored);
    } catch {
      /* localStorage tidak tersedia atau isinya rusak: abaikan */
    }
  }, [menus, storageKey]);

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(cart.map(l => ({id: l.item.id, qty: l.qty}))));
    } catch {
      /* mode private browsing: abaikan */
    }
  }, [cart, storageKey]);

  const stockOf = (item: GasMenu): number | null => (typeof item.stock === "number" ? item.stock : null);

  const add = (item: GasMenu) => {
    const stock = stockOf(item);
    if (stock !== null && stock <= 0) {
      setError(`Maaf, ${item.name} sedang habis.`);
      return;
    }
    setCart(lines => {
      const found = lines.find(line => line.item.id === item.id);
      const currentQty = found ? found.qty : 0;
      if (stock !== null && currentQty + 1 > stock) {
        setError(`Stok ${item.name} tersisa ${stock}`);
        return lines;
      }
      if (found && found.qty >= 99) return lines;
      return found
        ? lines.map(line => (line.item.id === item.id ? {...line, qty: line.qty + 1} : line))
        : [...lines, {item, qty: 1}];
    });
  };

  const changeQty = (id: string, delta: number) =>
    setCart(lines =>
      lines
        .map(line => (line.item.id === id ? {...line, qty: line.qty + delta} : line))
        .filter(line => line.qty > 0)
    );

  const waLink = (orderId?: string) => {
    const lines = cart.map(l => `• ${l.item.name} x${l.qty} = ${rupiah(l.item.price * l.qty)}`).join("\n");
    const text = [
      "*PESANAN BARU - KASTRIVA*",
      "",
      `Toko: ${settings?.storeName || storeId}`,
      `Meja: ${tableId}`,
      `Nama: ${name.trim() || "-"}`,
      orderId ? `No. Order: ${orderId}` : "",
      "",
      lines,
      "",
      `Subtotal: ${rupiah(totals.subtotal)}`,
      `Service: ${rupiah(totals.service)}`,
      `*TOTAL: ${rupiah(totals.total)}*`,
      `Catatan: ${note.trim() || "-"}`
    ]
      .filter(Boolean)
      .join("\n");
    const query = `?text=${encodeURIComponent(text)}`;
    return WA_PHONE ? `https://wa.me/${WA_PHONE}${query}` : `https://wa.me/${query}`;
  };

  const send = async () => {
    if (!cart.length) {
      setError("Tambahkan menu terlebih dahulu.");
      return;
    }
    setSending(true);
    setError("");
    setOkMessage("");
    const payload = {
      storeId,
      tableCode: tableId,
      customerName: name.trim(),
      note: note.trim(),
      channel: "QR",
      clientOrderId: newClientOrderId("QR"),
      // Harga tidak dikirim: server menghitung ulang dari data menu.
      items: cart.map(l => ({menuItemId: l.item.id, name: l.item.name, qty: l.qty, note: ""}))
    };

    if (!navigator.onLine) {
      const queue = enqueuePending(queueKeyStr, payload);
      setPendingCount(queue.length);
      setOkMessage("Anda sedang offline. Pesanan disimpan dan otomatis terkirim saat koneksi kembali.");
      setCart([]);
      setCartOpen(false);
      setSending(false);
      return;
    }

    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({action: "createOrder", payload})
      });
      const data: {ok?: boolean; data?: {id?: string; total?: number}; error?: string} = await res
        .json()
        .catch(() => ({}));
      if (!res.ok || !data.ok || !data.data) {
        // 5xx/429 adalah hasil yang belum pasti: retry harus memakai clientOrderId yang sama.
        if (res.status >= 500 || res.status === 429) {
          const queue = enqueuePending(queueKeyStr, payload);
          setPendingCount(queue.length);
          setOkMessage("Server belum memberi kepastian. Pesanan diamankan dan akan dicoba ulang tanpa membuat duplikat.");
          setCart([]);
          setCartOpen(false);
          return;
        }
        throw new Error(data.error || "Gagal menyimpan pesanan");
      }
      setLastOrder({id: data.data.id || "?", total: Number(data.data.total) || 0});
      setOkMessage("Pesanan tersimpan! Kasir kami segera memproses.");
      setCart([]);
      setNote("");
      setCartOpen(false);
    } catch (e) {
      // Fetch gagal sebelum respons diterima: outcome server tidak pasti, jadi simpan
      // payload yang SAMA. Idempotency server mencegah order ganda saat retry.
      const queue = enqueuePending(queueKeyStr, payload);
      setPendingCount(queue.length);
      setOkMessage("Koneksi bermasalah. Pesanan diamankan dan otomatis dicoba ulang tanpa duplikasi.");
      setCart([]);
      setCartOpen(false);
      if (navigator.onLine) setError(e instanceof Error ? e.message : "Koneksi ke server terputus");
    } finally {
      setSending(false);
    }
  };

  const storeDisplay = settings?.storeName || process.env.NEXT_PUBLIC_STORE_NAME || "Kastriva";

  return (
    <main className="custPage">
      <div className="card glass custHead">
        <Image className="logo" src="/brand/logo.png" alt={storeDisplay} width={44} height={44} />
        <div style={{minWidth: 0, flex: 1}}>
          <h1 style={{margin: 0, fontSize: 18}}>{storeDisplay}</h1>
          <p className="muted" style={{margin: "2px 0 0", fontSize: 13}}>
            Meja {tableId} • Digital Menu
          </p>
        </div>
        {!online ? (
          <span className="badge red offlineBadge">
            <WifiOff size={13} aria-hidden="true" /> Offline
          </span>
        ) : null}
      </div>

      {error ? (
        <p className="alert error" role="alert" style={{marginTop: 12}}>
          {error}
        </p>
      ) : null}
      {okMessage ? (
        <p className="alert ok" role="status" style={{marginTop: 12}}>
          {okMessage}
          {lastOrder ? (
            <>
              <br />
              <b>
                No. Order {lastOrder.id} • Total {rupiah(lastOrder.total)}
              </b>
            </>
          ) : null}
        </p>
      ) : null}
      {pendingCount > 0 ? (
        <p className="alert" role="status" style={{marginTop: 12}}>
          <CloudUpload size={14} aria-hidden="true" /> {pendingCount} pesanan menunggu koneksi — akan terkirim
          otomatis.
        </p>
      ) : null}

      {loadState === "loading" ? (
        <div className="card glass" style={{marginTop: 12}}>
          <div className="skeleton" style={{height: 42}} />
          <div className="skeleton" style={{height: 58, marginTop: 10}} />
          <div className="skeleton" style={{height: 58}} />
          <div className="skeleton" style={{height: 58}} />
        </div>
      ) : loadState === "error" ? (
        <div className="card glass" style={{marginTop: 12}}>
          <p className="alert error" role="alert">
            {loadError}
          </p>
          <button type="button" className="btn primary" onClick={() => void loadData()}>
            <RefreshCw size={15} aria-hidden="true" /> Coba Lagi
          </button>
        </div>
      ) : (
        <>
          <div className="card glass custTools">
            <div className="searchWrap">
              <SearchIcon />
              <input
                className="search"
                placeholder="Cari makanan atau minuman..."
                aria-label="Cari menu"
                value={q}
                onChange={e => setQ(e.target.value)}
              />
            </div>
            <div className="catRow" style={{marginTop: 9}}>
              {cats.map(c => (
                <button
                  type="button"
                  className={`btn cat ${c === cat ? "primary" : ""}`}
                  key={c}
                  onClick={() => setCat(c)}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="custLayout">
            <section className="menuList" aria-label="Daftar menu">
              {list.length === 0 ? <div className="card glass empty">Menu tidak ditemukan.</div> : null}
              {list.map(item => {
                const stock = stockOf(item);
                const available = stock === null || stock > 0;
                const inCart = cart.find(line => line.item.id === item.id);
                return (
                  <div className={`card glass menuRow ${available ? "" : "menuItemOff"}`} key={item.id}>
                    <div className="thumb" aria-hidden="true">
                      {item.emoji || "🍽️"}
                    </div>
                    <div className="info">
                      <h3 title={item.name}>{item.name}</h3>
                      <span className="price">{rupiah(item.price)}</span>
                      {stock !== null && stock <= 5 && available ? (
                        <span className="badge amber stockHint">Sisa {stock}</span>
                      ) : null}
                    </div>
                    {available ? (
                      inCart ? (
                        <div className="qty">
                          <button
                            type="button"
                            className="addBtn"
                            aria-label={`Kurangi ${item.name}`}
                            onClick={() => changeQty(item.id, -1)}
                          >
                            <Minus size={14} aria-hidden="true" />
                          </button>
                          <b>{inCart.qty}</b>
                          <button
                            type="button"
                            className="addBtn"
                            aria-label={`Tambah ${item.name}`}
                            onClick={() => add(item)}
                          >
                            <Plus size={14} aria-hidden="true" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="btn primary addBtn"
                          aria-label={`Tambah ${item.name}`}
                          onClick={() => add(item)}
                        >
                          <Plus size={16} aria-hidden="true" />
                        </button>
                      )
                    ) : (
                      <span className="badge red">Habis</span>
                    )}
                  </div>
                );
              })}
            </section>

            <aside className="card glass custCart" aria-label="Pesanan Anda">
              <CartPanel
                cart={cart}
                totals={totals}
                name={name}
                setName={setName}
                note={note}
                setNote={setNote}
                sending={sending}
                online={online}
                waLink={waLink()}
                showWa={Boolean(WA_PHONE)}
                changeQty={changeQty}
                send={send}
                compact
              />
            </aside>
          </div>
        </>
      )}

      {/* Bilah bawah mobile: ringkasan keranjang, ketuk untuk membuka */}
      {loadState === "ready" && itemCount > 0 ? (
        <div className="custBar glass">
          <span>
            <b>{itemCount} item</b>
            <span className="muted"> • {rupiah(totals.total)}</span>
          </span>
          <button type="button" className="btn primary" onClick={() => setCartOpen(true)}>
            <ShoppingCart size={15} aria-hidden="true" /> Lihat Pesanan
          </button>
        </div>
      ) : null}

      {cartOpen ? (
        <div className="modal" role="dialog" aria-modal="true" aria-label="Pesanan Anda">
          <div className="modalCard glass">
            <div className="split">
              <h2>Pesanan Anda</h2>
              <button type="button" className="iconBtn" aria-label="Tutup" onClick={() => setCartOpen(false)}>
                <X size={17} aria-hidden="true" />
              </button>
            </div>
            <CartPanel
              cart={cart}
              totals={totals}
              name={name}
              setName={setName}
              note={note}
              setNote={setNote}
              sending={sending}
              online={online}
              waLink={waLink()}
              showWa={Boolean(WA_PHONE)}
              changeQty={changeQty}
              send={send}
            />
          </div>
        </div>
      ) : null}
    </main>
  );
}

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

type CartPanelProps = {
  cart: CartLine[];
  totals: {subtotal: number; discount: number; tax: number; service: number; total: number};
  name: string;
  setName: (value: string) => void;
  note: string;
  setNote: (value: string) => void;
  sending: boolean;
  online: boolean;
  waLink: string;
  showWa: boolean;
  changeQty: (id: string, delta: number) => void;
  send: () => void;
  compact?: boolean;
};

function CartPanel({
  cart,
  totals,
  name,
  setName,
  note,
  setNote,
  sending,
  online,
  waLink,
  showWa,
  changeQty,
  send,
  compact
}: CartPanelProps) {
  return (
    <div>
      <div className="split">
        <h2 style={{margin: 0}}>Pesanan Anda</h2>
        <span className="badge">{cart.reduce((sum, line) => sum + line.qty, 0)} item</span>
      </div>

      {cart.length === 0 ? (
        <div className="empty">Belum ada menu. Pilih dari daftar di sebelah kiri.</div>
      ) : (
        cart.map(line => (
          <div className="cartLine" key={line.item.id}>
            <div style={{minWidth: 0}}>
              <b>
                {line.item.emoji} {line.item.name}
              </b>
              <div className="muted">
                {rupiah(line.item.price)} × {line.qty} = {rupiah(line.item.price * line.qty)}
              </div>
            </div>
            <div className="qty">
              <button type="button" className="addBtn" aria-label={`Kurangi ${line.item.name}`} onClick={() => changeQty(line.item.id, -1)}>
                <Minus size={14} aria-hidden="true" />
              </button>
              <b>{line.qty}</b>
              <button type="button" className="addBtn" aria-label={`Tambah ${line.item.name}`} onClick={() => changeQty(line.item.id, 1)}>
                <Plus size={14} aria-hidden="true" />
              </button>
            </div>
          </div>
        ))
      )}

      <div className={compact ? "formGrid" : "formGrid"} style={{marginTop: 10}}>
        <label className="label">
          Nama
          <input
            className="input"
            value={name}
            maxLength={80}
            placeholder="Opsional"
            onChange={e => setName(e.target.value)}
          />
        </label>
        <label className="label">
          Catatan
          <input
            className="input"
            value={note}
            maxLength={300}
            placeholder="Tidak pedas, ..."
            onChange={e => setNote(e.target.value)}
          />
        </label>
      </div>

      <div className="split muted" style={{marginTop: 12}}>
        <span>Subtotal</span>
        <span>{rupiah(totals.subtotal)}</span>
      </div>
      <div className="split muted" style={{marginTop: 5}}>
        <span>Pajak</span>
        <span>{rupiah(totals.tax)}</span>
      </div>
      <div className="split muted" style={{marginTop: 5}}>
        <span>Service</span>
        <span>{rupiah(totals.service)}</span>
      </div>
      <div className="split" style={{marginTop: 8}}>
        <span className="total">Total</span>
        <span className="total">{rupiah(totals.total)}</span>
      </div>

      <button
        type="button"
        className="btn success fullWidth"
        style={{marginTop: 12}}
        disabled={sending || cart.length === 0}
        onClick={send}
      >
        {sending ? "Mengirim..." : "Kirim Pesanan ke Kasir"}
      </button>
      {showWa && cart.length > 0 ? (
        <a
          className="btn fullWidth"
          style={{marginTop: 8, textAlign: "center"}}
          href={waLink}
          target="_blank"
          rel="noreferrer"
        >
          Konfirmasi via WhatsApp
        </a>
      ) : null}
      {!online ? (
        <p className="muted" style={{marginTop: 8, fontSize: 12}}>
          Mode offline: pesanan akan tersimpan dan terkirim otomatis saat koneksi kembali.
        </p>
      ) : null}
    </div>
  );
}

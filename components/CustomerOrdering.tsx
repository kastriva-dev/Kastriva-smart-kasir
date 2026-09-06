"use client";
import {useCallback, useEffect, useMemo, useState} from "react";
import Image from "next/image";
import {CloudUpload, RefreshCw, WifiOff} from "lucide-react";
import {rupiah} from "@/lib/data";
import {
  fetchPublicMenu,
  fetchPublicSettings,
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

export default function CustomerOrdering({storeId, tableId}: {storeId: string; tableId: string}) {
  const [menus, setMenus] = useState<GasMenu[]>([]);
  const [settings, setSettings] = useState<GasSettings | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
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
      const [menuList, storeSettings] = await Promise.all([fetchPublicMenu(), fetchPublicSettings()]);
      setMenus(menuList);
      setSettings(storeSettings);
      setLoadState("ready");
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Gagal memuat menu");
      setLoadState("error");
    }
  }, []);

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
        } else {
          remaining.push(entry);
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
    window.addEventListener("online", () => {
      setOnline(true);
      void flushQueue();
    });
    window.addEventListener("offline", () => setOnline(false));
    if (navigator.onLine) void flushQueue();
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
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

  // Keranjang bertahan saat halaman ter-refresh / kembali dari WhatsApp.
  useEffect(() => {
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
    // menus sengaja tidak di-depend: pemulihan cukup sekali setelah data siap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, menus.length > 0]);

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
      // Harga tidak dikirim: server menghitung ulang dari data menu.
      items: cart.map(l => ({menuItemId: l.item.id, name: l.item.name, qty: l.qty, note: ""}))
    };

    if (!navigator.onLine) {
      const queue = loadQueue(queueKeyStr);
      queue.push({id: `P-${Date.now().toString(36)}`, payload, savedAt: Date.now()});
      saveQueue(queueKeyStr, queue);
      setPendingCount(queue.length);
      setOkMessage("Anda sedang offline. Pesanan disimpan dan otomatis terkirim saat koneksi kembali.");
      setCart([]);
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
      if (!res.ok || !data.ok || !data.data) throw new Error(data.error || "Gagal menyimpan pesanan");
      setLastOrder({id: data.data.id || "?", total: Number(data.data.total) || 0});
      setOkMessage("Pesanan tersimpan! Kasir kami segera memproses.");
      setCart([]);
      setNote("");
    } catch (e) {
      // Bisa jadi koneksi putus di tengah jalan: masukkan antrean offline.
      const message = e instanceof Error ? e.message : "Gagal menyimpan pesanan";
      if (!navigator.onLine) {
        const queue = loadQueue(queueKeyStr);
        queue.push({id: `P-${Date.now().toString(36)}`, payload, savedAt: Date.now()});
        saveQueue(queueKeyStr, queue);
        setPendingCount(queue.length);
        setOkMessage("Koneksi terputus. Pesanan otomatis terkirim saat online kembali.");
        setCart([]);
      } else {
        setError(message);
      }
    } finally {
      setSending(false);
    }
  };

  const storeDisplay = settings?.storeName || process.env.NEXT_PUBLIC_STORE_NAME || "Kastriva";

  return (
    <main className="hero">
      <div className="customer">
        <div className="card glass">
          <div className="pageHead">
            <Image className="logo" src="/brand/logo.png" alt={storeDisplay} width={62} height={62} />
            <div>
              <h1 style={{margin: 0}}>{storeDisplay}</h1>
              <p className="muted" style={{margin: "4px 0"}}>
                Meja {tableId} • Digital Menu
              </p>
            </div>
            {!online ? (
              <span className="badge red offlineBadge">
                <WifiOff size={13} aria-hidden="true" /> Offline
              </span>
            ) : null}
          </div>
        </div>

        {loadState === "loading" ? (
          <div className="card glass" style={{marginTop: 14}}>
            <div className="skeleton" style={{height: 46}} />
            <div className="skeleton" style={{height: 120, marginTop: 10}} />
            <div className="skeleton" style={{height: 120}} />
          </div>
        ) : loadState === "error" ? (
          <div className="card glass" style={{marginTop: 14}}>
            <p className="alert error" role="alert">
              {loadError}
            </p>
            <button type="button" className="btn primary" onClick={() => void loadData()}>
              <RefreshCw size={15} aria-hidden="true" /> Coba Lagi
            </button>
          </div>
        ) : (
          <>
            <div className="card glass" style={{marginTop: 14}}>
              <input
                className="search"
                placeholder="Cari makanan atau minuman..."
                aria-label="Cari menu"
                value={q}
                onChange={e => setQ(e.target.value)}
              />
              <div className="catRow" style={{marginTop: 10}}>
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

            <div className="grid customerGrid" style={{marginTop: 14}}>
              {list.length === 0 ? <div className="card glass empty">Menu tidak ditemukan.</div> : null}
              {list.map(item => {
                const stock = stockOf(item);
                const available = stock === null || stock > 0;
                return (
                  <div className={`card glass ${available ? "" : "menuItemOff"}`} key={item.id}>
                    <div className="menuIcon menuIconLg" aria-hidden="true">
                      {item.emoji || "🍽️"}
                    </div>
                    <h3>{item.name}</h3>
                    <p className="muted">{item.category || "Lainnya"}</p>
                    <div className="split">
                      <b className="price">{rupiah(item.price)}</b>
                      <button type="button" className="btn primary" disabled={!available} onClick={() => add(item)}>
                        {available ? "Tambah" : "Habis"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <div className="card glass customerCart" style={{marginTop: 14}}>
          <div className="split">
            <h2>Pesanan Anda</h2>
            <span className="badge">{cart.reduce((sum, line) => sum + line.qty, 0)} item</span>
          </div>

          {cart.length === 0 ? (
            <div className="empty">Keranjang masih kosong.</div>
          ) : (
            cart.map(line => (
              <div className="cartLine" key={line.item.id}>
                <div>
                  <b>{line.item.name}</b>
                  <div className="muted">{rupiah(line.item.price * line.qty)}</div>
                </div>
                <div className="qty">
                  <button
                    type="button"
                    aria-label={`Kurangi ${line.item.name}`}
                    onClick={() => changeQty(line.item.id, -1)}
                  >
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

          <div className="formGrid" style={{marginTop: 12}}>
            <Field label="Nama" value={name} setValue={setName} placeholder="Opsional" />
            <Field label="Catatan" value={note} setValue={setNote} placeholder="Tidak pedas, tanpa bawang..." />
          </div>

          <div className="split muted" style={{marginTop: 14}}>
            <span>Subtotal</span>
            <span>{rupiah(totals.subtotal)}</span>
          </div>
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

          {error ? (
            <p className="alert error" role="alert">
              {error}
            </p>
          ) : null}
          {okMessage ? (
            <p className="alert ok" role="status">
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
            <p className="alert" role="status">
              <CloudUpload size={14} aria-hidden="true" /> {pendingCount} pesanan menunggu koneksi — akan terkirim
              otomatis.
            </p>
          ) : null}

          <button
            type="button"
            className="btn success fullWidth"
            style={{marginTop: 12}}
            disabled={sending || cart.length === 0 || loadState !== "ready"}
            onClick={send}
          >
            {sending ? "Mengirim..." : "Kirim Pesanan ke Kasir"}
          </button>
          {cart.length > 0 && WA_PHONE ? (
            <a className="btn fullWidth" style={{marginTop: 8, textAlign: "center"}} href={waLink()} target="_blank" rel="noreferrer">
              Konfirmasi via WhatsApp
            </a>
          ) : null}
        </div>
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  setValue,
  placeholder
}: {
  label: string;
  value: string;
  setValue: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="label">
      {label}
      <input
        className="input"
        value={value}
        maxLength={label === "Catatan" ? 300 : 80}
        onChange={e => setValue(e.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

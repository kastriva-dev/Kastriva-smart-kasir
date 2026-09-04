"use client";
import {useEffect, useMemo, useState} from "react";
import Image from "next/image";
import {calcTotals, menus, rupiah, STORE_NAME, type Menu} from "@/lib/data";

type CartLine = {item: Menu; qty: number};

const WA_PHONE = (process.env.NEXT_PUBLIC_CASHIER_WHATSAPP || "").replace(/\D/g, "");

export default function CustomerOrdering({storeId, tableId}: {storeId: string; tableId: string}) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [okMessage, setOkMessage] = useState("");

  const cats = useMemo(() => ["All", ...Array.from(new Set(menus.map(m => m.category)))], []);
  const list = useMemo(
    () =>
      menus.filter(
        m => (cat === "All" || m.category === cat) && m.name.toLowerCase().includes(q.trim().toLowerCase())
      ),
    [cat, q]
  );

  const subtotal = useMemo(() => cart.reduce((sum, line) => sum + line.item.price * line.qty, 0), [cart]);
  const totals = useMemo(() => calcTotals(subtotal), [subtotal]);

  // Keranjang bertahan saat halaman ter-refresh / kembali dari WhatsApp.
  const storageKey = `kastriva:cart:${storeId}:${tableId}`;
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
  }, [storageKey]);

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(cart.map(l => ({id: l.item.id, qty: l.qty}))));
    } catch {
      /* mode private browsing: abaikan */
    }
  }, [cart, storageKey]);

  const add = (item: Menu) =>
    setCart(lines => {
      const found = lines.find(line => line.item.id === item.id);
      if (found && found.qty >= 99) return lines;
      return found
        ? lines.map(line => (line.item.id === item.id ? {...line, qty: line.qty + 1} : line))
        : [...lines, {item, qty: 1}];
    });

  const changeQty = (id: string, delta: number) =>
    setCart(lines =>
      lines
        .map(line => (line.item.id === id ? {...line, qty: line.qty + delta} : line))
        .filter(line => line.qty > 0)
    );

  const waLink = () => {
    const lines = cart.map(l => `• ${l.item.name} x${l.qty} = ${rupiah(l.item.price * l.qty)}`).join("\n");
    const text = [
      "*PESANAN BARU - KASTRIVA*",
      "",
      `Toko: ${storeId}`,
      `Meja: ${tableId}`,
      `Nama: ${name.trim() || "-"}`,
      "",
      lines,
      "",
      `Subtotal: ${rupiah(totals.subtotal)}`,
      `Service: ${rupiah(totals.service)}`,
      `*TOTAL: ${rupiah(totals.total)}*`,
      `Catatan: ${note.trim() || "-"}`
    ].join("\n");
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
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          action: "createOrder",
          payload: {
            storeId,
            tableCode: tableId,
            customerName: name.trim(),
            note: note.trim(),
            channel: "QR",
            // Harga tidak dikirim: server menghitung ulang dari data menu.
            items: cart.map(l => ({menuItemId: l.item.id, name: l.item.name, qty: l.qty, note: ""}))
          }
        })
      });
      const data: {ok?: boolean; error?: string} = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || "Gagal menyimpan pesanan");
      // Link dibuat sebelum keranjang dikosongkan supaya isi pesan tetap lengkap.
      const link = waLink();
      setOkMessage("Pesanan tersimpan. Membuka WhatsApp kasir...");
      setCart([]);
      window.location.assign(link);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan pesanan");
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="hero">
      <div className="customer">
        <div className="card glass">
          <div className="pageHead">
            <Image className="logo" src="/brand/logo.png" alt="Kastriva" width={62} height={62} />
            <div>
              <h1 style={{margin: 0}}>{STORE_NAME}</h1>
              <p className="muted" style={{margin: "4px 0"}}>
                Meja {tableId} • Digital Menu
              </p>
            </div>
          </div>
        </div>

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
              <button type="button" className={`btn cat ${c === cat ? "primary" : ""}`} key={c} onClick={() => setCat(c)}>
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="grid customerGrid" style={{marginTop: 14}}>
          {list.length === 0 ? <div className="card glass empty">Menu tidak ditemukan.</div> : null}
          {list.map(item => (
            <div className="card glass" key={item.id}>
              <div className="menuIcon menuIconLg" aria-hidden="true">
                {item.emoji}
              </div>
              <h3>{item.name}</h3>
              <p className="muted">{item.category}</p>
              <div className="split">
                <b className="price">{rupiah(item.price)}</b>
                <button type="button" className="btn primary" onClick={() => add(item)}>
                  Tambah
                </button>
              </div>
            </div>
          ))}
        </div>

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
            <span>Service</span>
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
            </p>
          ) : null}

          <button
            type="button"
            className="btn success fullWidth"
            style={{marginTop: 12}}
            disabled={sending || cart.length === 0}
            onClick={send}
          >
            {sending ? "Mengirim..." : "Kirim ke WhatsApp Kasir"}
          </button>
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

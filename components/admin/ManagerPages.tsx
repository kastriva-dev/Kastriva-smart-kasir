"use client";
import {useEffect, useMemo, useState} from "react";
import {Plus, QrCode, RefreshCw} from "lucide-react";
import QrCanvas from "@/components/QrCanvas";
import {STORE_ID, rupiah} from "@/lib/data";
import {
  formatDay,
  gasCall,
  type GasCategory,
  type GasCustomer,
  type GasInventory,
  type GasMenu,
  type GasOrder,
  type GasReservation,
  type GasStaff,
  type GasTable
} from "@/lib/api";
import {useResource} from "@/components/admin/useResource";
import {EmptyState, ErrorState, Field, Modal, Skeleton} from "@/components/admin/ui";

/* ================= Meja ================= */

export function TablesPage({tables, reloadTables, notify}: {
  tables: GasTable[];
  reloadTables: () => void;
  notify: (message: string) => void;
}) {
  const ordersRes = useResource<GasOrder[]>(() => gasCall<GasOrder[]>("getOrders", {limit: 200}), 30_000);
  const [qrTable, setQrTable] = useState<GasTable | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [code, setCode] = useState("");
  const [seats, setSeats] = useState("4");
  const [busy, setBusy] = useState(false);

  const orders = useMemo(() => ordersRes.data || [], [ordersRes.data]);
  const activeByTable = useMemo(() => {
    const map: Record<string, GasOrder> = {};
    orders.forEach(order => {
      if (!["PAID", "CANCELLED"].includes(order.status) && order.tableCode) {
        map[order.tableCode.toLowerCase()] = order;
      }
    });
    return map;
  }, [orders]);

  const statusOf = (table: GasTable): string =>
    activeByTable[String(table.code).toLowerCase()] ? "OCCUPIED" : table.status || "AVAILABLE";

  const addTable = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await gasCall("saveTable", {code, seats: Number(seats) || 4, status: "AVAILABLE"});
      notify(`Meja ${code} ditambahkan`);
      setAddOpen(false);
      setCode("");
      setSeats("4");
      reloadTables();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Gagal menambah meja");
    } finally {
      setBusy(false);
    }
  };

  const freeTable = async (table: GasTable) => {
    try {
      await gasCall("saveTable", {id: table.id, code: table.code, seats: table.seats, status: "AVAILABLE"});
      notify(`Meja ${table.code} dikosongkan`);
      reloadTables();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Gagal memperbarui meja");
    }
  };

  return (
    <div>
      <div className="split" style={{marginBottom: 12}}>
        <div>
          <h2>Manajemen Meja</h2>
          <p className="muted">Status otomatis dari pesanan aktif • QR per meja</p>
        </div>
        <div className="btnRow">
          <button type="button" className="iconBtn" aria-label="Muat ulang" onClick={() => { reloadTables(); ordersRes.reload(); }}>
            <RefreshCw size={16} aria-hidden="true" />
          </button>
          <button type="button" className="btn primary" onClick={() => setAddOpen(true)}>
            <Plus size={15} aria-hidden="true" /> Meja
          </button>
        </div>
      </div>

      {tables.length === 0 ? (
        <EmptyState message="Belum ada meja. Tambahkan meja pertama." />
      ) : (
        <div className="grid tableGrid">
          {tables.map(table => {
            const status = statusOf(table);
            const order = activeByTable[String(table.code).toLowerCase()];
            return (
              <div className="card glass" key={table.id}>
                <div className="split">
                  <h2>{table.code}</h2>
                  <span className={`badge ${status === "AVAILABLE" ? "green" : status === "RESERVED" ? "amber" : "red"}`}>
                    {status}
                  </span>
                </div>
                <p className="muted">{table.seats} kursi{order ? ` • ${order.id}` : ""}</p>
                <div className="btnRow" style={{marginTop: 10}}>
                  <button type="button" className="btn" onClick={() => setQrTable(table)}>
                    <QrCode size={15} aria-hidden="true" /> QR
                  </button>
                  {status !== "AVAILABLE" ? (
                    <button type="button" className="btn" onClick={() => freeTable(table)}>
                      Kosongkan
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {addOpen ? (
        <Modal title="Tambah Meja" onClose={() => setAddOpen(false)}>
          <div className="formGrid">
            <Field label="Kode meja">
              <input className="input" value={code} placeholder="meja-11" maxLength={32}
                onChange={e => setCode(e.target.value)} />
            </Field>
            <Field label="Jumlah kursi">
              <input className="input" inputMode="numeric" value={seats} maxLength={3}
                onChange={e => setSeats(e.target.value.replace(/[^\d]/g, ""))} />
            </Field>
          </div>
          <button type="button" className="btn primary fullWidth" style={{marginTop: 14}} disabled={busy || !code.trim()} onClick={addTable}>
            {busy ? "Menyimpan..." : "Simpan Meja"}
          </button>
        </Modal>
      ) : null}

      {qrTable ? <QrModal table={qrTable} onClose={() => setQrTable(null)} /> : null}
    </div>
  );
}

export function QrModal({table, onClose}: {table: GasTable; onClose: () => void}) {
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const path = `/customer/${STORE_ID}/${table.code}`;
  const url = origin ? `${origin}${path}` : path;
  const [copied, setCopied] = useState("");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied("URL disalin");
    } catch {
      setCopied("Salin manual dari teks di bawah");
    }
  };

  return (
    <Modal title={`QR Meja ${table.code}`} onClose={onClose}>
      <div style={{display: "grid", placeItems: "center"}}>
        <QrCanvas value={url} size={220} alt={`QR ${table.code}`} />
      </div>
      <p className="qr">{url}</p>
      <div className="btnRow">
        <button type="button" className="btn primary" onClick={copy}>
          Copy URL
        </button>
        {copied ? <span className="muted">{copied}</span> : null}
      </div>
    </Modal>
  );
}

/* ================= Menu ================= */

type MenuDraft = {
  id?: string;
  name: string;
  categoryId: string;
  newCategory: string;
  price: string;
  cost: string;
  stock: string;
  emoji: string;
  description: string;
  active: boolean;
};

const emptyDraft: MenuDraft = {
  name: "",
  categoryId: "",
  newCategory: "",
  price: "",
  cost: "",
  stock: "",
  emoji: "",
  description: "",
  active: true
};

export function MenuManagerPage({menus, reloadMenus, notify}: {
  menus: GasMenu[];
  reloadMenus: () => void;
  notify: (message: string) => void;
}) {
  const catsRes = useResource<GasCategory[]>(() => gasCall<GasCategory[]>("getCategories"), 0);
  const categories = catsRes.data || [];
  const [draft, setDraft] = useState<MenuDraft | null>(null);
  const [busy, setBusy] = useState(false);

  const openNew = () => setDraft({...emptyDraft});
  const openEdit = (item: GasMenu) =>
    setDraft({
      id: item.id,
      name: item.name,
      categoryId: item.categoryId || "",
      newCategory: "",
      price: String(item.price ?? ""),
      cost: String(item.cost ?? ""),
      stock: item.stock === "" || item.stock === null || item.stock === undefined ? "" : String(item.stock),
      emoji: item.emoji || "",
      description: item.description || "",
      active: item.active !== false
    });

  const save = async () => {
    if (!draft || busy) return;
    setBusy(true);
    try {
      await saveMenuWithCategory(draft, categories, notify);
      setDraft(null);
      reloadMenus();
      catsRes.reload();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Gagal menyimpan menu");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (item: GasMenu) => {
    if (!window.confirm(`Hapus menu "${item.name}"?`)) return;
    try {
      await gasCall("deleteData", {sheet: "Menu", id: item.id});
      notify(`Menu ${item.name} dihapus`);
      reloadMenus();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Gagal menghapus menu");
    }
  };

  const toggleActive = async (item: GasMenu) => {
    try {
      await gasCall("saveMenu", {
        id: item.id,
        name: item.name,
        price: item.price,
        cost: item.cost ?? 0,
        stock: item.stock ?? "",
        categoryId: item.categoryId || "",
        emoji: item.emoji || "",
        description: item.description || "",
        active: item.active === false
      });
      reloadMenus();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Gagal mengubah status menu");
    }
  };

  return (
    <div className="card glass">
      <div className="split">
        <div>
          <h2>Menu Engineering</h2>
          <p className="muted">Harga, stok, kategori, dan ketersediaan • {menus.length} menu</p>
        </div>
        <div className="btnRow">
          <button type="button" className="iconBtn" aria-label="Muat ulang" onClick={reloadMenus}>
            <RefreshCw size={16} aria-hidden="true" />
          </button>
          <button type="button" className="btn primary" onClick={openNew}>
            <Plus size={15} aria-hidden="true" /> Menu
          </button>
        </div>
      </div>

      {menus.length === 0 ? (
        <EmptyState message="Belum ada menu." />
      ) : (
        <div className="tableWrap">
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Menu</th>
                <th scope="col">Kategori</th>
                <th scope="col">Harga</th>
                <th scope="col">Modal</th>
                <th scope="col">Margin</th>
                <th scope="col">Stok</th>
                <th scope="col">Status</th>
                <th scope="col">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {menus.map(item => (
                <tr key={item.id}>
                  <td>
                    <span aria-hidden="true">{item.emoji || "🍽️"}</span> <b>{item.name}</b>
                  </td>
                  <td>{item.category || "—"}</td>
                  <td>{rupiah(item.price)}</td>
                  <td>{rupiah(item.cost || 0)}</td>
                  <td>{item.price > 0 ? Math.round((1 - (item.cost || 0) / item.price) * 100) : 0}%</td>
                  <td>{item.stock === "" || item.stock === null || item.stock === undefined ? "—" : String(item.stock)}</td>
                  <td>
                    <button type="button" className={`badge ${item.active !== false ? "green" : "red"}`} onClick={() => toggleActive(item)}>
                      {item.active !== false ? "AKTIF" : "OFF"}
                    </button>
                  </td>
                  <td>
                    <div className="btnRow">
                      <button type="button" className="btn" onClick={() => openEdit(item)}>
                        Edit
                      </button>
                      <button type="button" className="btn danger" onClick={() => remove(item)}>
                        Hapus
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {draft ? (
        <Modal title={draft.id ? "Edit Menu" : "Menu Baru"} onClose={() => setDraft(null)}>
          <div className="formGrid">
            <Field label="Nama menu">
              <input className="input" value={draft.name} maxLength={120}
                onChange={e => setDraft({...draft, name: e.target.value})} />
            </Field>
            <Field label="Kategori">
              <select className="input" value={draft.categoryId}
                onChange={e => setDraft({...draft, categoryId: e.target.value, newCategory: ""})}>
                <option value="">— Pilih —</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Atau kategori baru">
              <input className="input" value={draft.newCategory} maxLength={60} placeholder="Kosongkan bila memakai di atas"
                onChange={e => setDraft({...draft, newCategory: e.target.value})} />
            </Field>
            <Field label="Emoji">
              <input className="input" value={draft.emoji} maxLength={8} placeholder="🍜"
                onChange={e => setDraft({...draft, emoji: e.target.value})} />
            </Field>
            <Field label="Harga (Rp)">
              <input className="input" inputMode="numeric" value={draft.price}
                onChange={e => setDraft({...draft, price: e.target.value.replace(/[^\d]/g, "").slice(0, 12)})} />
            </Field>
            <Field label="Modal (Rp)">
              <input className="input" inputMode="numeric" value={draft.cost}
                onChange={e => setDraft({...draft, cost: e.target.value.replace(/[^\d]/g, "").slice(0, 12)})} />
            </Field>
            <Field label="Stok (kosong = tidak dilacak)">
              <input className="input" inputMode="numeric" value={draft.stock}
                onChange={e => setDraft({...draft, stock: e.target.value.replace(/[^\d]/g, "").slice(0, 6)})} />
            </Field>
            <Field label="Deskripsi">
              <input className="input" value={draft.description} maxLength={300}
                onChange={e => setDraft({...draft, description: e.target.value})} />
            </Field>
          </div>
          <label className="split rowLine" style={{marginTop: 8}}>
            <span>Menu aktif (tampil di POS & QR)</span>
            <input type="checkbox" checked={draft.active} onChange={e => setDraft({...draft, active: e.target.checked})} />
          </label>
          <button type="button" className="btn primary fullWidth" style={{marginTop: 12}} disabled={busy || !draft.name.trim()} onClick={save}>
            {busy ? "Menyimpan..." : "Simpan Menu"}
          </button>
        </Modal>
      ) : null}
    </div>
  );
}

/** Menyimpan menu; bila kategori baru diisi, kategori dibuat dulu lewat saveCategory. */
async function saveMenuWithCategory(
  draft: MenuDraft,
  categories: GasCategory[],
  notify: (message: string) => void
): Promise<void> {
  let categoryId = draft.categoryId;
  const newName = draft.newCategory.trim();
  if (newName) {
    const existing = categories.find(c => String(c.name).toLowerCase() === newName.toLowerCase());
    if (existing) {
      categoryId = existing.id;
    } else {
      try {
        const created = await gasCall<{id?: string}>("saveCategory", {name: newName});
        categoryId = created.id || "";
      } catch {
        notify("Kategori baru gagal dibuat, memakai kategori terpilih");
      }
    }
  }
  await gasCall("saveMenu", {
    id: draft.id,
    name: draft.name,
    categoryId,
    price: Number(draft.price) || 0,
    cost: Number(draft.cost) || 0,
    stock: draft.stock === "" ? "" : Number(draft.stock) || 0,
    emoji: draft.emoji,
    description: draft.description,
    active: draft.active
  });
}

/* ================= Inventory ================= */

export function InventoryPage({notify}: {notify: (message: string) => void}) {
  const invRes = useResource<GasInventory[]>(() => gasCall<GasInventory[]>("getInventory"), 60_000);
  const rows = invRes.data || [];
  const [draft, setDraft] = useState<Partial<GasInventory> | null>(null);
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
      invRes.reload();
      notify("Inventory disimpan");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Gagal menyimpan inventory");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row: GasInventory) => {
    if (!window.confirm(`Hapus bahan "${row.name}"?`)) return;
    try {
      await gasCall("deleteData", {sheet: "Inventory", id: row.id});
      invRes.reload();
      notify("Bahan dihapus");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Gagal menghapus");
    }
  };

  const low = rows.filter(r => Number(r.stock) <= Number(r.parLevel)).length;

  return (
    <div className="card glass">
      <div className="split">
        <div>
          <h2>Stock Control</h2>
          <p className="muted">{rows.length} bahan • {low} di bawah par level</p>
        </div>
        <div className="btnRow">
          <button type="button" className="iconBtn" aria-label="Muat ulang" onClick={invRes.reload}>
            <RefreshCw size={16} aria-hidden="true" />
          </button>
          <button type="button" className="btn primary" onClick={() => setDraft({name: "", unit: "pcs", stock: 0, parLevel: 0, cost: 0})}>
            <Plus size={15} aria-hidden="true" /> Bahan
          </button>
        </div>
      </div>

      {invRes.error ? <ErrorState message={invRes.error} setup={invRes.setup} onRetry={invRes.reload} /> : null}
      {invRes.loading && !rows.length ? <Skeleton /> : null}
      {rows.length === 0 && !invRes.error && !invRes.loading ? <EmptyState message="Belum ada data inventory." /> : null}

      {rows.length ? (
        <div className="tableWrap">
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Bahan</th>
                <th scope="col">Stok</th>
                <th scope="col">Par Level</th>
                <th scope="col">Harga Modal</th>
                <th scope="col">Status</th>
                <th scope="col">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id}>
                  <td><b>{row.name}</b> <span className="muted">({row.unit})</span></td>
                  <td>{row.stock}</td>
                  <td>{row.parLevel}</td>
                  <td>{rupiah(row.cost)}</td>
                  <td>
                    <span className={`badge ${Number(row.stock) <= Number(row.parLevel) ? "red" : "green"}`}>
                      {Number(row.stock) <= Number(row.parLevel) ? "RESTOCK" : "OK"}
                    </span>
                  </td>
                  <td>
                    <div className="btnRow">
                      <button type="button" className="btn" onClick={() => setDraft(row)}>Edit</button>
                      <button type="button" className="btn danger" onClick={() => remove(row)}>Hapus</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {draft ? (
        <Modal title={draft.id ? "Edit Bahan" : "Bahan Baru"} onClose={() => setDraft(null)}>
          <div className="formGrid">
            <Field label="Nama bahan">
              <input className="input" value={draft.name || ""} maxLength={120}
                onChange={e => setDraft({...draft, name: e.target.value})} />
            </Field>
            <Field label="Satuan">
              <input className="input" value={draft.unit || ""} maxLength={16} placeholder="kg / liter / pcs"
                onChange={e => setDraft({...draft, unit: e.target.value})} />
            </Field>
            <Field label="Stok">
              <input className="input" inputMode="decimal" value={String(draft.stock ?? "")}
                onChange={e => setDraft({...draft, stock: Number(e.target.value.replace(/[^\d.]/g, "")) || 0})} />
            </Field>
            <Field label="Par level (batas minimum)">
              <input className="input" inputMode="decimal" value={String(draft.parLevel ?? "")}
                onChange={e => setDraft({...draft, parLevel: Number(e.target.value.replace(/[^\d.]/g, "")) || 0})} />
            </Field>
            <Field label="Harga modal">
              <input className="input" inputMode="numeric" value={String(draft.cost ?? "")}
                onChange={e => setDraft({...draft, cost: Number(e.target.value.replace(/[^\d]/g, "")) || 0})} />
            </Field>
          </div>
          <button type="button" className="btn primary fullWidth" style={{marginTop: 12}} disabled={busy || !String(draft.name || "").trim()} onClick={save}>
            {busy ? "Menyimpan..." : "Simpan"}
          </button>
        </Modal>
      ) : null}
    </div>
  );
}

/* ================= Reservasi ================= */

export function ReservationsPage({notify}: {notify: (message: string) => void}) {
  const resRes = useResource<GasReservation[]>(() => gasCall<GasReservation[]>("getReservations"), 60_000);
  const rows = resRes.data || [];
  const [draft, setDraft] = useState<Partial<GasReservation> | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!draft || busy) return;
    setBusy(true);
    try {
      await gasCall("saveReservation", {
        id: draft.id,
        guestName: draft.guestName,
        phone: draft.phone || "",
        partySize: Number(draft.partySize) || 2,
        reservedAt: draft.reservedAt || "",
        status: draft.status || "BOOKED",
        note: draft.note || ""
      });
      setDraft(null);
      resRes.reload();
      notify("Reservasi disimpan");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Gagal menyimpan reservasi");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row: GasReservation) => {
    if (!window.confirm(`Hapus reservasi ${row.guestName}?`)) return;
    try {
      await gasCall("deleteData", {sheet: "Reservations", id: row.id});
      resRes.reload();
      notify("Reservasi dihapus");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Gagal menghapus");
    }
  };

  const setStatus = async (row: GasReservation, status: string) => {
    try {
      await gasCall("saveReservation", {...row, status});
      resRes.reload();
      notify(`Reservasi ${row.guestName} → ${status}`);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Gagal mengubah status");
    }
  };

  return (
    <div className="card glass">
      <div className="split">
        <div>
          <h2>Reservasi & Booking</h2>
          <p className="muted">{rows.length} reservasi tercatat</p>
        </div>
        <div className="btnRow">
          <button type="button" className="iconBtn" aria-label="Muat ulang" onClick={resRes.reload}>
            <RefreshCw size={16} aria-hidden="true" />
          </button>
          <button type="button" className="btn primary"
            onClick={() => setDraft({guestName: "", phone: "", partySize: 2, reservedAt: "", status: "BOOKED", note: ""})}>
            <Plus size={15} aria-hidden="true" /> Reservasi
          </button>
        </div>
      </div>

      {resRes.error ? <ErrorState message={resRes.error} setup={resRes.setup} onRetry={resRes.reload} /> : null}
      {resRes.loading && !rows.length ? <Skeleton /> : null}
      {rows.length === 0 && !resRes.error && !resRes.loading ? <EmptyState message="Belum ada reservasi." /> : null}

      {rows.length ? (
        <div className="tableWrap">
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Tamu</th>
                <th scope="col">Kontak</th>
                <th scope="col">Waktu</th>
                <th scope="col">Pax</th>
                <th scope="col">Status</th>
                <th scope="col">Catatan</th>
                <th scope="col">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id}>
                  <td><b>{row.guestName}</b></td>
                  <td>{row.phone || "—"}</td>
                  <td>{row.reservedAt || "—"}</td>
                  <td>{row.partySize}</td>
                  <td>
                    <select className="input selectInline" aria-label={`Status ${row.guestName}`} value={row.status}
                      onChange={e => setStatus(row, e.target.value)}>
                      {["BOOKED", "CONFIRMED", "SEATED", "CANCELLED"].map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </td>
                  <td className="muted">{row.note || "—"}</td>
                  <td>
                    <div className="btnRow">
                      <button type="button" className="btn" onClick={() => setDraft(row)}>Edit</button>
                      <button type="button" className="btn danger" onClick={() => remove(row)}>Hapus</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {draft ? (
        <Modal title={draft.id ? "Edit Reservasi" : "Reservasi Baru"} onClose={() => setDraft(null)}>
          <div className="formGrid">
            <Field label="Nama tamu">
              <input className="input" value={draft.guestName || ""} maxLength={80}
                onChange={e => setDraft({...draft, guestName: e.target.value})} />
            </Field>
            <Field label="Nomor telepon">
              <input className="input" inputMode="tel" value={draft.phone || ""} maxLength={20} placeholder="08xxxxxxxxxx"
                onChange={e => setDraft({...draft, phone: e.target.value.replace(/[^\d+]/g, "")})} />
            </Field>
            <Field label="Jumlah orang">
              <input className="input" inputMode="numeric" value={String(draft.partySize ?? 2)} maxLength={3}
                onChange={e => setDraft({...draft, partySize: Number(e.target.value.replace(/[^\d]/g, "")) || 1})} />
            </Field>
            <Field label="Waktu (tanggal & jam)">
              <input className="input" type="datetime-local" value={draft.reservedAt || ""}
                onChange={e => setDraft({...draft, reservedAt: e.target.value})} />
            </Field>
            <Field label="Catatan">
              <input className="input" value={draft.note || ""} maxLength={300} placeholder="Ulang tahun, dekat jendela..."
                onChange={e => setDraft({...draft, note: e.target.value})} />
            </Field>
          </div>
          <button type="button" className="btn primary fullWidth" style={{marginTop: 12}} disabled={busy || !String(draft.guestName || "").trim()} onClick={save}>
            {busy ? "Menyimpan..." : "Simpan Reservasi"}
          </button>
        </Modal>
      ) : null}
    </div>
  );
}

/* ================= Pelanggan & Staff ================= */

export function CustomersPage() {
  const custRes = useResource<GasCustomer[]>(() => gasCall<GasCustomer[]>("getCustomers"), 60_000);
  const rows = (custRes.data || []).slice().sort((a, b) => Number(b.totalSpend || 0) - Number(a.totalSpend || 0));

  return (
    <div className="card glass">
      <div className="split">
        <div>
          <h2>CRM Pelanggan</h2>
          <p className="muted">Otomatis dari pesanan dengan nomor telepon • {rows.length} pelanggan</p>
        </div>
        <button type="button" className="iconBtn" aria-label="Muat ulang" onClick={custRes.reload}>
          <RefreshCw size={16} aria-hidden="true" />
        </button>
      </div>
      {custRes.error ? <ErrorState message={custRes.error} setup={custRes.setup} onRetry={custRes.reload} /> : null}
      {custRes.loading && !rows.length ? <Skeleton /> : null}
      {rows.length === 0 && !custRes.error && !custRes.loading ? <EmptyState message="Belum ada pelanggan terdaftar." /> : null}
      {rows.length ? (
        <div className="tableWrap">
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Nama</th>
                <th scope="col">Telepon</th>
                <th scope="col">Kunjungan</th>
                <th scope="col">Total Belanja</th>
                <th scope="col">Terakhir</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id}>
                  <td><b>{row.name}</b></td>
                  <td>{row.phone || "—"}</td>
                  <td>{row.visits}×</td>
                  <td>{rupiah(row.totalSpend)}</td>
                  <td className="muted">{row.updatedAt ? formatDay(row.updatedAt) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

const STAFF_ROLES = ["Kasir", "Manager", "Kitchen", "Waiter", "Barista", "Staff"];

type StaffDraft = {
  id?: string;
  name: string;
  role: string;
  pin: string;
  active: boolean;
};

export function StaffPage({notify}: {notify: (message: string) => void}) {
  const staffRes = useResource<GasStaff[]>(() => gasCall<GasStaff[]>("getStaff"), 120_000);
  const rows = staffRes.data || [];
  const [draft, setDraft] = useState<StaffDraft | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!draft || busy) return;
    setBusy(true);
    try {
      await gasCall("saveStaff", {
        id: draft.id,
        name: draft.name,
        role: draft.role,
        pin: draft.pin,
        active: draft.active
      });
      setDraft(null);
      staffRes.reload();
      notify("Staff tersimpan");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Gagal menyimpan staff");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row: GasStaff) => {
    if (!window.confirm(`Hapus staff "${row.name}"?`)) return;
    try {
      await gasCall("deleteData", {sheet: "Staff", id: row.id});
      staffRes.reload();
      notify("Staff dihapus");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Gagal menghapus");
    }
  };

  const toggleActive = async (row: GasStaff) => {
    try {
      await gasCall("saveStaff", {id: row.id, name: row.name, role: row.role, active: row.active === false});
      staffRes.reload();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Gagal mengubah status staff");
    }
  };

  return (
    <div className="card glass">
      <div className="split">
        <div>
          <h2>Staff &amp; Shift</h2>
          <p className="muted">{rows.length} staff • PIN kasir tersimpan sebagai hash, tidak bisa dilihat ulang</p>
        </div>
        <div className="btnRow">
          <button type="button" className="iconBtn" aria-label="Muat ulang" onClick={staffRes.reload}>
            <RefreshCw size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() => setDraft({name: "", role: "Kasir", pin: "", active: true})}
          >
            <Plus size={15} aria-hidden="true" /> Staff
          </button>
        </div>
      </div>

      {staffRes.error ? <ErrorState message={staffRes.error} setup={staffRes.setup} onRetry={staffRes.reload} /> : null}
      {staffRes.loading && !rows.length ? <Skeleton /> : null}
      {rows.length === 0 && !staffRes.error && !staffRes.loading ? (
        <EmptyState message="Belum ada staff. Tambahkan staff pertama lewat tombol + Staff." />
      ) : null}

      {rows.length ? (
        <div className="tableWrap">
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Nama</th>
                <th scope="col">Role</th>
                <th scope="col">PIN</th>
                <th scope="col">Status</th>
                <th scope="col">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id}>
                  <td>
                    <b>{row.name}</b>
                  </td>
                  <td>{row.role || "staff"}</td>
                  <td>{row.pinHash ? <span className="badge green">Terpasang</span> : <span className="badge">Belum</span>}</td>
                  <td>
                    <button
                      type="button"
                      className={`badge ${row.active !== false ? "green" : "red"}`}
                      onClick={() => toggleActive(row)}
                      aria-label={`Ubah status ${row.name}`}
                    >
                      {row.active !== false ? "AKTIF" : "OFF"}
                    </button>
                  </td>
                  <td>
                    <div className="btnRow">
                      <button
                        type="button"
                        className="btn"
                        onClick={() =>
                          setDraft({id: row.id, name: row.name, role: row.role || "Kasir", pin: "", active: row.active !== false})
                        }
                      >
                        Edit
                      </button>
                      <button type="button" className="btn danger" onClick={() => remove(row)}>
                        Hapus
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {draft ? (
        <Modal title={draft.id ? "Edit Staff" : "Staff Baru"} onClose={() => setDraft(null)}>
          <div className="formGrid">
            <Field label="Nama staff">
              <input
                className="input"
                value={draft.name}
                maxLength={80}
                onChange={e => setDraft({...draft, name: e.target.value})}
              />
            </Field>
            <Field label="Role">
              <select className="input" value={draft.role} onChange={e => setDraft({...draft, role: e.target.value})}>
                {STAFF_ROLES.map(role => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={draft.id ? "PIN baru (kosongkan bila tidak diubah)" : "PIN kasir (4-8 digit, opsional)"}>
              <input
                className="input"
                inputMode="numeric"
                value={draft.pin}
                maxLength={8}
                placeholder="••••"
                autoComplete="off"
                onChange={e => setDraft({...draft, pin: e.target.value.replace(/[^\d]/g, "")})}
              />
            </Field>
          </div>
          <label className="split rowLine" style={{marginTop: 8}}>
            <span>Staff aktif</span>
            <input type="checkbox" checked={draft.active} onChange={e => setDraft({...draft, active: e.target.checked})} />
          </label>
          <p className="muted" style={{fontSize: 12, marginTop: 10}}>
            PIN disimpan sebagai hash — tidak bisa dilihat kembali setelah disimpan. Untuk mengganti, isi PIN baru.
          </p>
          <button
            type="button"
            className="btn primary fullWidth"
            style={{marginTop: 10}}
            disabled={busy || !draft.name.trim()}
            onClick={save}
          >
            {busy ? "Menyimpan..." : "Simpan Staff"}
          </button>
        </Modal>
      ) : null}
    </div>
  );
}

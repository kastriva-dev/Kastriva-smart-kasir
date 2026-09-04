"use client";
import {useEffect, useMemo, useRef, useState} from "react";
import Image from "next/image";
import {useRouter} from "next/navigation";
import {
  BarChart3,
  Bell,
  BookOpen,
  CalendarDays,
  ChefHat,
  ChevronRight,
  ClipboardList,
  Grid2X2,
  LayoutDashboard,
  LogOut,
  Menu as MenuIcon,
  Package,
  QrCode,
  Settings,
  ShoppingCart,
  Users
} from "lucide-react";
import type {LucideIcon} from "lucide-react";
import QrCanvas from "@/components/QrCanvas";
import {
  calcTotals,
  initialOrders,
  menus,
  nowTime,
  rupiah,
  SERVICE_RATE,
  STORE_ID,
  tables,
  type Menu,
  type Order
} from "@/lib/data";

const nav: readonly [string, LucideIcon][] = [
  ["Dashboard", LayoutDashboard],
  ["POS", ShoppingCart],
  ["Pesanan", ClipboardList],
  ["Dapur", ChefHat],
  ["Meja", Grid2X2],
  ["Reservasi", CalendarDays],
  ["Menu", BookOpen],
  ["Inventory", Package],
  ["Pelanggan", Users],
  ["Staff", Users],
  ["Laporan", BarChart3],
  ["QR & Online", QrCode],
  ["Pengaturan", Settings]
];

type CartLine = {item: Menu; qty: number};

export default function AdminApp() {
  const router = useRouter();
  const [page, setPage] = useState("Dashboard");
  const [open, setOpen] = useState(false);
  const [orders, setOrders] = useState<Order[]>(initialOrders);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cat, setCat] = useState("All");
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const orderSeq = useRef(0);

  const notify = (message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2200);
  };

  // Timer dibersihkan saat unmount agar tidak setState pada komponen yang sudah hilang.
  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  const [today, setToday] = useState("");
  useEffect(
    () => setToday(new Date().toLocaleDateString("id-ID", {weekday: "long", day: "2-digit", month: "long"})),
    []
  );

  const [loggingOut, setLoggingOut] = useState(false);
  const logout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", {method: "POST"});
      // replace() supaya tombol back tidak kembali ke dashboard setelah logout.
      router.replace("/login");
      router.refresh();
    } catch {
      notify("Gagal logout, coba lagi");
      setLoggingOut(false);
    }
  };

  const add = (item: Menu) =>
    setCart(lines => {
      const found = lines.find(line => line.item.id === item.id);
      return found
        ? lines.map(line => (line.item.id === item.id ? {...line, qty: line.qty + 1} : line))
        : [...lines, {item, qty: 1}];
    });

  const subtotal = useMemo(() => cart.reduce((sum, line) => sum + line.item.price * line.qty, 0), [cart]);
  const totals = useMemo(() => calcTotals(subtotal), [subtotal]);
  const categories = useMemo(() => ["All", ...Array.from(new Set(menus.map(m => m.category)))], []);
  const filtered = useMemo(
    () =>
      menus.filter(
        m => (cat === "All" || m.category === cat) && m.name.toLowerCase().includes(query.trim().toLowerCase())
      ),
    [cat, query]
  );

  const updateStatus = (id: string, status: Order["status"]) =>
    setOrders(list => list.map(order => (order.id === id ? {...order, status} : order)));

  const completeSale = () => {
    if (!cart.length) {
      notify("Keranjang kosong");
      return;
    }
    orderSeq.current += 1;
    const order: Order = {
      // Date.now() saja bisa bentrok saat dua transaksi dibuat pada milidetik yang sama.
      id: `ORD-${Date.now().toString(36).toUpperCase()}-${orderSeq.current}`,
      table: "Counter",
      customer: "Walk-in",
      status: "PAID",
      total: totals.total,
      items: cart.map(line => `${line.item.name} x${line.qty}`),
      time: nowTime(),
      channel: "POS"
    };
    setOrders(list => [order, ...list]);
    setCart([]);
    notify(`Transaksi ${rupiah(order.total)} berhasil disimpan`);
  };

  const render = () => {
    if (page === "POS")
      return (
        <PosPage
          filtered={filtered}
          categories={categories}
          cat={cat}
          setCat={setCat}
          query={query}
          setQuery={setQuery}
          add={add}
          cart={cart}
          setCart={setCart}
          totals={totals}
          completeSale={completeSale}
        />
      );
    if (page === "Pesanan") return <OrdersPage orders={orders} updateStatus={updateStatus} />;
    if (page === "Dapur") return <KitchenPage orders={orders} updateStatus={updateStatus} />;
    if (page === "Meja") return <TablesPage />;
    if (page === "Reservasi")
      return (
        <SimplePage
          title="Reservasi & Booking"
          icon={<CalendarDays />}
          desc="Kelola booking, deposit, guest note, seating preference dan waiting list."
          rows={["RSV-901 • 19:00 • 4 pax • VIP", "RSV-902 • 19:30 • 2 pax • Window", "RSV-903 • 20:00 • 6 pax • Birthday"]}
        />
      );
    if (page === "Menu") return <MenuPage />;
    if (page === "Inventory") return <InventoryPage />;
    if (page === "Pelanggan")
      return (
        <SimplePage
          title="CRM Pelanggan"
          icon={<Users />}
          desc="Profil tamu, visit history, loyalty, preferences dan birthday reminder."
          rows={["Budi Santoso • 14 visits • Gold", "Sari Wijaya • 8 visits • Silver", "Andi Pratama • 5 visits • Member"]}
        />
      );
    if (page === "Staff")
      return (
        <SimplePage
          title="Staff & Shift"
          icon={<Users />}
          desc="Role-based access, shift, attendance, cashier accountability."
          rows={["Ayu • Manager • On duty", "Rizky • Cashier • On duty", "Dimas • Kitchen • On duty"]}
        />
      );
    if (page === "Laporan") return <ReportsPage orders={orders} />;
    if (page === "QR & Online") return <OnlinePage />;
    if (page === "Pengaturan") return <SettingsPage />;
    return <Dashboard orders={orders} setPage={setPage} />;
  };

  return (
    <div className="app">
      <aside className={`sidebar glass ${open ? "open" : ""}`}>
        <div className="brand">
          <Image src="/brand/logo.png" alt="Kastriva" width={44} height={44} />
          <div>
            <b>KASTRIVA SMART</b>
            <small>Enterprise POS</small>
          </div>
        </div>
        <nav className="nav">
          {nav.map(([label, Icon]) => (
            <button
              key={label}
              type="button"
              className={page === label ? "active" : ""}
              aria-current={page === label ? "page" : undefined}
              onClick={() => {
                setPage(label);
                setOpen(false);
              }}
            >
              <Icon size={17} aria-hidden="true" />
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebarBottom">
          <button type="button" className="navLogout" onClick={logout} disabled={loggingOut}>
            <LogOut size={17} aria-hidden="true" />
            {loggingOut ? "Keluar..." : "Logout"}
          </button>
        </div>
      </aside>

      <div
        className={`overlay ${open ? "show" : ""}`}
        role="presentation"
        onClick={() => setOpen(false)}
      />

      <main className="main">
        <header className="topbar">
          <button
            type="button"
            className="iconBtn mobileMenu"
            aria-label="Buka menu navigasi"
            onClick={() => setOpen(true)}
          >
            <MenuIcon size={20} aria-hidden="true" />
          </button>
          <div className="pageTitle">
            <h1>{page}</h1>
            <p>Kastriva Grand Dining{today ? ` • ${today}` : ""}</p>
          </div>
          <div className="topActions">
            <button type="button" className="iconBtn" aria-label="Notifikasi">
              <Bell size={18} aria-hidden="true" />
            </button>
            <button type="button" className="btn primary hideSm" onClick={() => setPage("POS")}>
              <ShoppingCart size={16} aria-hidden="true" /> New Order
            </button>
          </div>
        </header>
        {render()}
      </main>

      {toast ? (
        <div className="toast" role="status" aria-live="polite">
          {toast}
        </div>
      ) : null}
    </div>
  );
}

function Dashboard({orders, setPage}: {orders: Order[]; setPage: (page: string) => void}) {
  const chart = [52, 68, 45, 81, 72, 92, 78, 98, 85, 74, 91, 100, 88, 96];
  const topMenu: [string, number][] = [
    ["Beef Tenderloin", 92],
    ["Truffle Pasta", 78],
    ["Signature Mocktail", 71],
    ["Salmon Miso", 64]
  ];
  return (
    <div className="grid" style={{gap: 16}}>
      <div className="grid stats">
        <Stat label="Sales Hari Ini" value={rupiah(18450000)} trend="+18.6% vs kemarin" />
        <Stat label="Orders" value="128" trend="+12.4% volume" />
        <Stat label="Average Check" value={rupiah(144140)} trend="+6.8%" />
        <Stat label="Table Turnover" value="3.7x" trend="+0.4x" />
      </div>

      <div className="grid layout2">
        <div className="card glass">
          <div className="split">
            <div>
              <h2>Sales Performance</h2>
              <p className="muted">7 hari terakhir • Gross sales</p>
            </div>
            <span className="badge green">LIVE</span>
          </div>
          <div className="chart">
            {chart.map((value, i) => (
              <div key={i} className="chartBar" style={{height: `${value}%`, opacity: 0.55 + i / 30}} />
            ))}
          </div>
          <div className="split">
            <span className="muted">Mon</span>
            <span className="muted">Sun</span>
          </div>
        </div>

        <div className="card glass">
          <h2>Live Operations</h2>
          <div className="grid" style={{gap: 10}}>
            <Live label="New orders" value={String(orders.filter(o => o.status === "NEW").length)} tone="amber" />
            <Live label="Cooking" value={String(orders.filter(o => o.status === "COOKING").length)} tone="green" />
            <Live label="Ready to serve" value={String(orders.filter(o => o.status === "READY").length)} tone="green" />
            <Live
              label="Occupied tables"
              value={`${tables.filter(t => t.status === "OCCUPIED").length} / ${tables.length}`}
              tone="amber"
            />
            <Live label="Reservations" value="9 tonight" tone="green" />
          </div>
        </div>
      </div>

      <div className="grid layout3">
        <div className="card glass">
          <h3>Recent Orders</h3>
          {orders.slice(0, 4).map(order => (
            <div className="cartLine" key={order.id}>
              <div>
                <b>{order.id}</b>
                <div className="muted">
                  {order.table} • {order.customer}
                </div>
              </div>
              <div style={{textAlign: "right"}}>
                <b>{rupiah(order.total)}</b>
                <br />
                <span className="badge">{order.status}</span>
              </div>
            </div>
          ))}
          <button type="button" className="btn" style={{marginTop: 12}} onClick={() => setPage("Pesanan")}>
            View all
          </button>
        </div>

        <div className="card glass">
          <h3>Top Menu</h3>
          {topMenu.map(([name, value]) => (
            <div key={name} style={{marginBottom: 14}}>
              <div className="split">
                <span>{name}</span>
                <b>{value}%</b>
              </div>
              <div className="bar" style={{marginTop: 7}}>
                <i style={{width: `${value}%`}} />
              </div>
            </div>
          ))}
        </div>

        <div className="card glass">
          <h3>Manager Alerts</h3>
          <p className="muted">2 menu stock berada di bawah par level.</p>
          <p className="muted">1 reservation membutuhkan konfirmasi deposit.</p>
          <p className="muted">3 order QR belum dikonfirmasi kasir.</p>
          <button type="button" className="btn primary" onClick={() => setPage("Inventory")}>
            Review alerts
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({label, value, trend}: {label: string; value: string; trend: string}) {
  return (
    <div className="stat glass">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      <div className="trend">{trend}</div>
    </div>
  );
}

function Live({label, value, tone}: {label: string; value: string; tone: "green" | "amber"}) {
  return (
    <div className="split rowLine">
      <span>{label}</span>
      <span className={`badge ${tone}`}>{value}</span>
    </div>
  );
}

type PosPageProps = {
  filtered: Menu[];
  categories: string[];
  cat: string;
  setCat: (value: string) => void;
  query: string;
  setQuery: (value: string) => void;
  add: (item: Menu) => void;
  cart: CartLine[];
  setCart: React.Dispatch<React.SetStateAction<CartLine[]>>;
  totals: ReturnType<typeof calcTotals>;
  completeSale: () => void;
};

function PosPage({
  filtered,
  categories,
  cat,
  setCat,
  query,
  setQuery,
  add,
  cart,
  setCart,
  totals,
  completeSale
}: PosPageProps) {
  const changeQty = (id: string, delta: number) =>
    setCart(lines =>
      lines
        .map(line => (line.item.id === id ? {...line, qty: line.qty + delta} : line))
        .filter(line => line.qty > 0)
    );

  return (
    <div className="grid pos">
      <div>
        <div className="card glass">
          <div className="split">
            <div>
              <h2>Point of Sale</h2>
              <p className="muted">Dine-in • Takeaway • Delivery • QR</p>
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
          {filtered.map(item => (
            <div className="card glass menuItem" key={item.id}>
              <div className="menuIcon" aria-hidden="true">
                {item.emoji}
              </div>
              <h3>{item.name}</h3>
              <div className="split">
                <span className="muted">{item.category}</span>
                <span className="price">{rupiah(item.price)}</span>
              </div>
              <button
                type="button"
                className="btn primary fullWidth"
                style={{marginTop: 12}}
                onClick={() => add(item)}
              >
                Add to order
              </button>
            </div>
          ))}
        </div>
      </div>

      <aside className="card glass cart">
        <div className="split">
          <h2>Current Order</h2>
          <span className="badge">{cart.reduce((sum, line) => sum + line.qty, 0)} items</span>
        </div>
        {!cart.length ? (
          <div className="empty">Pilih menu untuk memulai transaksi.</div>
        ) : (
          cart.map(line => (
            <div className="cartLine" key={line.item.id}>
              <div>
                <b>{line.item.name}</b>
                <div className="muted">{rupiah(line.item.price)}</div>
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
                <button
                  type="button"
                  aria-label={`Tambah ${line.item.name}`}
                  onClick={() => changeQty(line.item.id, 1)}
                >
                  +
                </button>
              </div>
            </div>
          ))
        )}
        <div style={{marginTop: 18}}>
          <div className="split">
            <span>Subtotal</span>
            <b>{rupiah(totals.subtotal)}</b>
          </div>
          <div className="split muted" style={{marginTop: 8}}>
            <span>Service {Math.round(SERVICE_RATE * 100)}%</span>
            <span>{rupiah(totals.service)}</span>
          </div>
          <div className="split" style={{marginTop: 12}}>
            <span className="total">Total</span>
            <span className="total">{rupiah(totals.total)}</span>
          </div>
          <button
            type="button"
            className="btn success fullWidth"
            style={{marginTop: 15}}
            onClick={completeSale}
          >
            Charge &amp; Complete
          </button>
          <button
            type="button"
            className="btn fullWidth"
            style={{marginTop: 8}}
            onClick={() => setCart([])}
          >
            Clear
          </button>
        </div>
      </aside>
    </div>
  );
}

const STATUS_OPTIONS: Order["status"][] = [
  "NEW",
  "CONFIRMED",
  "COOKING",
  "READY",
  "SERVED",
  "PAID",
  "CANCELLED"
];

function statusTone(status: Order["status"]) {
  if (status === "PAID" || status === "SERVED") return "green";
  if (status === "NEW") return "amber";
  if (status === "CANCELLED") return "red";
  return "";
}

function OrdersPage({
  orders,
  updateStatus
}: {
  orders: Order[];
  updateStatus: (id: string, status: Order["status"]) => void;
}) {
  return (
    <div className="card glass">
      <div className="split">
        <div>
          <h2>Order Management</h2>
          <p className="muted">Omnichannel order queue • POS / QR / WhatsApp</p>
        </div>
        <button type="button" className="btn primary">
          + Manual Order
        </button>
      </div>
      <div className="tableWrap">
        <table className="data">
          <thead>
            <tr>
              <th scope="col">Order</th>
              <th scope="col">Guest</th>
              <th scope="col">Table</th>
              <th scope="col">Channel</th>
              <th scope="col">Total</th>
              <th scope="col">Status</th>
              <th scope="col">Action</th>
            </tr>
          </thead>
          <tbody>
            {orders.map(order => (
              <tr key={order.id}>
                <td>
                  <b>{order.id}</b>
                  <br />
                  <span className="muted">{order.time}</span>
                </td>
                <td>{order.customer}</td>
                <td>{order.table}</td>
                <td>
                  <span className="badge">{order.channel}</span>
                </td>
                <td>{rupiah(order.total)}</td>
                <td>
                  <span className={`badge ${statusTone(order.status)}`}>{order.status}</span>
                </td>
                <td>
                  <select
                    className="input selectInline"
                    aria-label={`Ubah status ${order.id}`}
                    value={order.status}
                    onChange={e => updateStatus(order.id, e.target.value as Order["status"])}
                  >
                    {STATUS_OPTIONS.map(status => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const KITCHEN_FLOW: Record<string, Order["status"]> = {
  NEW: "CONFIRMED",
  CONFIRMED: "COOKING",
  COOKING: "READY",
  READY: "SERVED"
};

function KitchenPage({
  orders,
  updateStatus
}: {
  orders: Order[];
  updateStatus: (id: string, status: Order["status"]) => void;
}) {
  const cols: Order["status"][] = ["NEW", "CONFIRMED", "COOKING", "READY"];
  return (
    <div className="grid layout3">
      {cols.map(col => {
        const list = orders.filter(order => order.status === col);
        return (
          <div className="card glass" key={col}>
            <div className="split">
              <h2>{col}</h2>
              <span className="badge">{list.length}</span>
            </div>
            {list.length === 0 ? <div className="empty">Tidak ada order.</div> : null}
            {list.map(order => (
              <div className="card ticket" key={order.id}>
                <div className="split">
                  <b>{order.id}</b>
                  <span className="muted">{order.time}</span>
                </div>
                <p className="muted">
                  {order.table} • {order.customer}
                </p>
                {order.items.map(item => (
                  <div key={item} className="ticketItem">
                    • {item}
                  </div>
                ))}
                <button
                  type="button"
                  className="btn primary fullWidth"
                  style={{marginTop: 8}}
                  onClick={() => updateStatus(order.id, KITCHEN_FLOW[col])}
                >
                  {col === "READY" ? "Serve" : "Next status"}
                </button>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function TablesPage() {
  return (
    <div className="grid tableGrid">
      {tables.map(table => (
        <div className="card glass" key={table.id}>
          <div className="split">
            <h2>{table.id}</h2>
            <span
              className={`badge ${
                table.status === "AVAILABLE" ? "green" : table.status === "RESERVED" ? "amber" : "red"
              }`}
            >
              {table.status}
            </span>
          </div>
          <p className="muted">{table.seats} seats</p>
          <button type="button" className="btn fullWidth">
            Open table
          </button>
        </div>
      ))}
    </div>
  );
}

function SimplePage({
  title,
  icon,
  desc,
  rows
}: {
  title: string;
  icon: React.ReactNode;
  desc: string;
  rows: string[];
}) {
  return (
    <div className="card glass">
      <div className="pageHead">
        <div className="menuIcon" aria-hidden="true">
          {icon}
        </div>
        <div>
          <h2>{title}</h2>
          <p className="muted">{desc}</p>
        </div>
      </div>
      <div className="grid" style={{marginTop: 15}}>
        {rows.map(row => (
          <div className="card subCard" key={row}>
            <div className="split">
              <span>{row}</span>
              <ChevronRight size={16} aria-hidden="true" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MenuPage() {
  return (
    <div className="card glass">
      <div className="split">
        <div>
          <h2>Menu Engineering</h2>
          <p className="muted">Recipe, modifier, pricing, availability dan profitability.</p>
        </div>
        <button type="button" className="btn primary">
          + Add menu
        </button>
      </div>
      <div className="tableWrap">
        <table className="data">
          <thead>
            <tr>
              <th scope="col">Menu</th>
              <th scope="col">Category</th>
              <th scope="col">Price</th>
              <th scope="col">Cost</th>
              <th scope="col">Margin</th>
              <th scope="col">Stock</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {menus.map(item => (
              <tr key={item.id}>
                <td>
                  <span aria-hidden="true">{item.emoji}</span> <b>{item.name}</b>
                </td>
                <td>{item.category}</td>
                <td>{rupiah(item.price)}</td>
                <td>{rupiah(item.cost)}</td>
                <td>{item.price > 0 ? Math.round((1 - item.cost / item.price) * 100) : 0}%</td>
                <td>{item.stock}</td>
                <td>
                  <span className={`badge ${item.active ? "green" : "red"}`}>
                    {item.active ? "ACTIVE" : "OFF"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InventoryPage() {
  const stock: [string, number, number][] = [
    ["Beef Tenderloin", 18, 25],
    ["Salmon", 12, 20],
    ["Truffle", 4, 10],
    ["Coffee Beans", 32, 15],
    ["Fresh Milk", 8, 20]
  ];
  return (
    <div className="grid layout2">
      <div className="card glass">
        <h2>Stock Control</h2>
        <p className="muted">Par level, recipe deduction, purchase &amp; wastage.</p>
        {stock.map(([name, current, par]) => (
          <div key={name} className="rowLine">
            <div className="split">
              <span>{name}</span>
              <b>{current} unit</b>
            </div>
            <div className="bar" style={{marginTop: 8}}>
              <i style={{width: `${par > 0 ? Math.min(100, (current / par) * 100) : 0}%`}} />
            </div>
          </div>
        ))}
      </div>
      <div className="card glass">
        <h2>Purchase &amp; Wastage</h2>
        <button type="button" className="btn primary fullWidth">
          + Purchase Order
        </button>
        <button type="button" className="btn fullWidth" style={{marginTop: 9}}>
          Record Wastage
        </button>
        <div style={{marginTop: 18}} className="muted">
          Last PO • PO-2409 • {rupiah(8420000)}
        </div>
      </div>
    </div>
  );
}

function ReportsPage({orders}: {orders: Order[]}) {
  const rows: [string, string][] = [
    ["Gross Sales", rupiah(18450000)],
    ["Discount", rupiah(320000)],
    ["Tax & Service", rupiah(1420000)],
    ["COGS", rupiah(6240000)],
    ["Gross Profit", rupiah(13310000)]
  ];
  const mix: [string, number][] = [
    ["Cash", 32],
    ["QRIS", 41],
    ["Debit/Credit", 19],
    ["E-Wallet", 8]
  ];
  return (
    <div className="grid layout2">
      <div className="card glass">
        <h2>Executive Reports</h2>
        <p className="muted">Sales, COGS, gross margin, payment mix dan staff performance.</p>
        {rows.map(([label, value]) => (
          <div className="split rowLine" key={label}>
            <span>{label}</span>
            <b>{value}</b>
          </div>
        ))}
        <button type="button" className="btn primary" style={{marginTop: 14}}>
          Export PDF
        </button>
        <button type="button" className="btn" style={{marginTop: 14, marginLeft: 8}}>
          Export Excel
        </button>
      </div>
      <div className="card glass">
        <h2>Payment Mix</h2>
        {mix.map(([label, value]) => (
          <div style={{marginBottom: 15}} key={label}>
            <div className="split">
              <span>{label}</span>
              <b>{value}%</b>
            </div>
            <div className="bar" style={{marginTop: 7}}>
              <i style={{width: `${value}%`}} />
            </div>
          </div>
        ))}
        <p className="muted">Total orders analyzed: {orders.length} sample orders.</p>
      </div>
    </div>
  );
}

function OnlinePage() {
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState("");
  const path = `/customer/${STORE_ID}/meja-01`;

  // window.location dibaca setelah mount supaya HTML server dan client identik (bukan hydration mismatch).
  useEffect(() => setOrigin(window.location.origin), []);

  const url = origin ? `${origin}${path}` : path;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied("URL disalin");
    } catch {
      setCopied("Tidak dapat menyalin, salin manual");
    }
  };

  const settings = [
    "Accept QR orders",
    "WhatsApp cashier handoff",
    "Auto confirm low-risk orders",
    "Show table number",
    "Allow customer notes",
    "Enable order cut-off"
  ];

  return (
    <div className="grid layout2">
      <div className="card glass">
        <div className="split">
          <div>
            <h2>QR Ordering</h2>
            <p className="muted">Per-table ordering, digital menu and WhatsApp handoff.</p>
          </div>
          <QrCode aria-hidden="true" />
        </div>
        <div style={{marginTop: 15}}>
          <QrCanvas value={url} size={240} alt="QR meja 01" />
        </div>
        <p className="qr">{url}</p>
        <button type="button" className="btn primary" onClick={copy}>
          Copy URL
        </button>
        {copied ? (
          <span className="muted" style={{marginLeft: 10}}>
            {copied}
          </span>
        ) : null}
      </div>
      <div className="card glass">
        <h2>Online Order Settings</h2>
        {settings.map((label, i) => (
          <label className="split rowLine" key={label}>
            <span>{label}</span>
            <input type="checkbox" defaultChecked={i < 5} />
          </label>
        ))}
      </div>
    </div>
  );
}

function SettingsPage() {
  return (
    <div className="grid layout2">
      <div className="card glass">
        <h2>Store Profile</h2>
        <div className="formGrid">
          <Field label="Business name" value="Kastriva Grand Dining" />
          <Field label="Branch" value="Jakarta • Senopati" />
          <Field label="Tax" value="11%" />
          <Field label="Service charge" value={`${Math.round(SERVICE_RATE * 100)}%`} />
          <Field label="Currency" value="IDR" />
          <Field label="Timezone" value="Asia/Jakarta" />
        </div>
        <button type="button" className="btn primary" style={{marginTop: 15}}>
          Save settings
        </button>
      </div>
      <div className="card glass">
        <h2>Security &amp; Integrations</h2>
        {[
          "Cashier approval PIN",
          "Role-based permissions",
          "WhatsApp Business",
          "QRIS / Payment Gateway",
          "Cloud backup",
          "Audit log"
        ].map(label => (
          <div className="split rowLine" key={label}>
            <span>{label}</span>
            <span className="badge green">Configured</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Field({label, value}: {label: string; value: string}) {
  return (
    <label className="label">
      {label}
      <input className="input" defaultValue={value} />
    </label>
  );
}

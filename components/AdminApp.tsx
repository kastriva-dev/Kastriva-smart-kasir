"use client";
import {useEffect, useRef, useState} from "react";
import Image from "next/image";
import {useRouter} from "next/navigation";
import {
  BarChart3,
  Bell,
  BookOpen,
  CalendarDays,
  ChefHat,
  ClipboardList,
  Grid2X2,
  LayoutDashboard,
  LogOut,
  Menu as MenuIcon,
  Package,
  QrCode,
  Settings,
  ShoppingCart,
  Users,
  WifiOff
} from "lucide-react";
import type {LucideIcon} from "lucide-react";
import {fetchPublicMenu, fetchPublicSettings, type GasMenu, type GasSettings, type GasTable} from "@/lib/api";
import {useOnline, useResource} from "@/components/admin/useResource";
import {gasCall} from "@/lib/api";
import PosPage from "@/components/admin/PosPage";
import {KitchenPage, OrdersPage} from "@/components/admin/OrderPages";
import {
  CustomersPage,
  InventoryPage,
  MenuManagerPage,
  ReservationsPage,
  StaffPage,
  TablesPage
} from "@/components/admin/ManagerPages";
import {Dashboard, OnlinePage, ReportsPage, SettingsPage} from "@/components/admin/InsightPages";

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

export default function AdminApp() {
  const router = useRouter();
  const [page, setPage] = useState("Dashboard");
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const online = useOnline();

  const settingsRes = useResource<GasSettings>(() => fetchPublicSettings(), 300_000);
  const menusRes = useResource<GasMenu[]>(() => fetchPublicMenu(), 120_000);
  const tablesRes = useResource<GasTable[]>(() => gasCall<GasTable[]>("getTables"), 60_000);

  const menus = menusRes.data || [];
  const tables = tablesRes.data || [];

  const notify = (message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2600);
  };

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    []
  );

  const [today, setToday] = useState("");
  useEffect(
    () =>
      setToday(
        new Date().toLocaleDateString("id-ID", {weekday: "long", day: "2-digit", month: "long", year: "numeric"})
      ),
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

  const storeName = settingsRes.data?.storeName || process.env.NEXT_PUBLIC_STORE_NAME || "Kastriva Smart Kasir";

  const render = () => {
    if (page === "POS")
      return (
        <PosPage
          menus={menus}
          tables={tables}
          settings={settingsRes.data}
          storeName={storeName}
          notify={notify}
          refreshMenus={menusRes.reload}
        />
      );
    if (page === "Pesanan") return <OrdersPage notify={notify} />;
    if (page === "Dapur") return <KitchenPage notify={notify} />;
    if (page === "Meja") return <TablesPage tables={tables} reloadTables={tablesRes.reload} notify={notify} />;
    if (page === "Reservasi") return <ReservationsPage notify={notify} />;
    if (page === "Menu") return <MenuManagerPage menus={menus} reloadMenus={menusRes.reload} notify={notify} />;
    if (page === "Inventory") return <InventoryPage notify={notify} />;
    if (page === "Pelanggan") return <CustomersPage />;
    if (page === "Staff") return <StaffPage />;
    if (page === "Laporan") return <ReportsPage />;
    if (page === "QR & Online") return <OnlinePage tables={tables} />;
    if (page === "Pengaturan")
      return (
        <SettingsPage settings={settingsRes.data} reloadSettings={settingsRes.reload} notify={notify} />
      );
    return <Dashboard tables={tables} setPage={setPage} />;
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
          <span className={`connPill ${online ? "" : "connOff"}`}>
            <span className="dot" aria-hidden="true" />
            {online ? "Online" : "Offline — data terakhir"}
          </span>
          <button type="button" className="navLogout" onClick={logout} disabled={loggingOut}>
            <LogOut size={17} aria-hidden="true" />
            {loggingOut ? "Keluar..." : "Logout"}
          </button>
        </div>
      </aside>

      <div className={`overlay ${open ? "show" : ""}`} role="presentation" onClick={() => setOpen(false)} />

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
            <p>
              {storeName}
              {today ? ` • ${today}` : ""}
            </p>
          </div>
          <div className="topActions">
            {!online ? (
              <span className="badge red offlineBadge">
                <WifiOff size={13} aria-hidden="true" /> Offline
              </span>
            ) : null}
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

"use client";
import {useEffect, useRef, useState} from "react";
import Image from "next/image";
import {useRouter} from "next/navigation";
import {
  Activity,
  BarChart3,
  Bell,
  BookOpen,
  CalendarDays,
  ChefHat,
  CircleHelp,
  ClipboardList,
  Crown,
  Grid2X2,
  LayoutDashboard,
  LogOut,
  Menu as MenuIcon,
  Package,
  BadgePercent,
  QrCode,
  Settings,
  ScanBarcode,
  ShoppingCart,
  Clock3,
  UserRound,
  Users,
  WifiOff
} from "lucide-react";
import type {LucideIcon} from "lucide-react";
import {fetchPublicMenu, fetchPublicSettings, type GasMenu, type GasSettings, type GasStore, type GasTable, type SessionInfo} from "@/lib/api";
import {useOnline, useResource} from "@/components/admin/useResource";
import {gasCall} from "@/lib/api";
import PosPage from "@/components/admin/PosPage";
import {KitchenPage, OrdersPage} from "@/components/admin/OrderPages";
import GuideModal from "@/components/admin/GuideModal";
import {
  CustomersPage,
  MenuManagerPage,
  ReservationsPage,
  StaffPage,
  TablesPage
} from "@/components/admin/ManagerPages";
import {Dashboard, OnlinePage, ReportsPage, SettingsPage} from "@/components/admin/InsightPages";
import ShiftPage from "@/components/admin/ShiftPage";
import InventoryProPage from "@/components/admin/InventoryProPage";
import HardwarePage from "@/components/admin/HardwarePage";
import PromoLoyaltyPage from "@/components/admin/PromoLoyaltyPage";
import {AdvancedAnalyticsPage, OwnerSaasPage} from "@/components/admin/SaasPages";

const nav: readonly [string, LucideIcon][] = [
  ["Dashboard", LayoutDashboard], ["POS", ShoppingCart], ["Pesanan", ClipboardList], ["Dapur", ChefHat],
  ["Meja", Grid2X2], ["Reservasi", CalendarDays], ["Menu", BookOpen], ["Inventory", Package],
  ["Promo & Loyalty", BadgePercent], ["Pelanggan", Users], ["Shift", Clock3], ["Staff", Users], ["Laporan", BarChart3],
  ["Analytics", Activity], ["QR & Online", QrCode], ["Perangkat", ScanBarcode], ["Owner & SaaS", Crown], ["Pengaturan", Settings]
];

const ROLE_PAGES: Record<string, string[]> = {
  admin: nav.map(([label]) => label),
  manager: nav.map(([label]) => label).filter(label => label !== "Owner & SaaS"),
  cashier: ["POS", "Pesanan", "Reservasi", "Pelanggan", "Shift", "Perangkat"],
  kitchen: ["Dapur", "Pesanan", "Shift"],
  barista: ["Dapur", "Pesanan", "Shift"],
  waiter: ["Pesanan", "Meja", "Reservasi", "Pelanggan", "Shift"],
  staff: ["Pesanan", "Shift"]
};

const ROLE_DEFAULT: Record<string, string> = {admin:"Dashboard", manager:"Dashboard", cashier:"Shift", kitchen:"Shift", barista:"Shift", waiter:"Shift", staff:"Shift"};

export default function AdminApp() {
  const router = useRouter();
  const [page, setPage] = useState("Dashboard");
  const [open, setOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const online = useOnline();
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [outletStores, setOutletStores] = useState<GasStore[]>([]);
  const [outletSwitching, setOutletSwitching] = useState(false);

  useEffect(() => {
    fetch("/api/auth/session", {cache:"no-store"}).then(r => r.json()).then(body => {
      const info = body?.data as SessionInfo | undefined;
      if (!info?.authenticated) return;
      setSession(info);
      setPage(ROLE_DEFAULT[info.role || "staff"] || "Pesanan");
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (session?.role !== "admin") return;
    gasCall<GasStore[]>("getStores").then(setOutletStores).catch(() => setOutletStores([]));
  }, [session?.role]);

  const sessionStoreId = session?.storeId || "";
  const settingsRes = useResource<GasSettings>(() => fetchPublicSettings(sessionStoreId), 300_000);
  const menusRes = useResource<GasMenu[]>(() => fetchPublicMenu(sessionStoreId), 120_000);
  const tablesRes = useResource<GasTable[]>(() => gasCall<GasTable[]>("getTables"), 60_000);

  useEffect(() => {
    if (!session) return;
    settingsRes.reload();
    menusRes.reload();
    tablesRes.reload();
    // Resource fetchers always point at the latest session/outlet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.storeId]);

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
  const role = session?.role || "staff";
  const allowedPages = ROLE_PAGES[role] || ROLE_PAGES.staff;
  const allowedNav = nav.filter(([label]) => allowedPages.includes(label));
  const activeStoreId = session?.storeId || settingsRes.data?.storeId || outletStores[0]?.id || "";

  const switchOutlet = async (storeId: string) => {
    if (!storeId || storeId === activeStoreId || outletSwitching) return;
    setOutletSwitching(true);
    try {
      const res = await fetch("/api/auth/outlet", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({storeId})});
      const body = await res.json() as {ok?:boolean;error?:string};
      if (!res.ok || !body.ok) throw new Error(body.error || "Gagal mengganti outlet");
      window.location.reload();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Gagal mengganti outlet");
      setOutletSwitching(false);
    }
  };

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
    if (page === "Pesanan") return <OrdersPage notify={notify} role={session?.role || "staff"} storeName={storeName} />;
    if (page === "Dapur") return <KitchenPage notify={notify} role={session?.role || "staff"} />;
    if (page === "Meja") return <TablesPage tables={tables} reloadTables={tablesRes.reload} notify={notify} />;
    if (page === "Reservasi") return <ReservationsPage notify={notify} />;
    if (page === "Menu") return <MenuManagerPage menus={menus} reloadMenus={menusRes.reload} notify={notify} />;
    if (page === "Inventory") return <InventoryProPage menus={menus} reloadMenus={menusRes.reload} notify={notify} />;
    if (page === "Promo & Loyalty") return <PromoLoyaltyPage settings={settingsRes.data} reloadSettings={settingsRes.reload} notify={notify} />;
    if (page === "Pelanggan") return <CustomersPage />;
    if (page === "Shift" && session) return <ShiftPage session={session} notify={notify} />;
    if (page === "Staff") return <StaffPage notify={notify} />;
    if (page === "Laporan") return <ReportsPage />;
    if (page === "Analytics") return <AdvancedAnalyticsPage />;
    if (page === "Owner & SaaS") return <OwnerSaasPage notify={notify} selectedStoreId={activeStoreId} />;
    if (page === "QR & Online") return <OnlinePage tables={tables} />;
    if (page === "Perangkat") return <HardwarePage notify={notify} />;
    if (page === "Pengaturan")
      return (
        <SettingsPage settings={settingsRes.data} reloadSettings={settingsRes.reload} notify={notify} />
      );
    return <Dashboard tables={tables} setPage={setPage} />;
  };

  if (!session) return <main className="hero"><div className="card glass"><p className="muted">Memuat session staff...</p></div></main>;

  return (
    <div className="app">
      <aside className={`sidebar glass ${open ? "open" : ""}`}>
        <div className="brand">
          <Image src="/brand/logo.png" alt="Kastriva" width={44} height={44} />
          <div>
            <b>KASTRIVA SMART</b>
            <small>POS Pro • {session ? String(session.role).toUpperCase() : "..."}</small>
          </div>
        </div>
        <nav className="nav">
          {allowedNav.map(([label, Icon]) => (
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
            {session?.role === "admin" && outletStores.length ? (
              <select className="input" aria-label="Pilih outlet aktif" value={activeStoreId} disabled={outletSwitching} onChange={e => void switchOutlet(e.target.value)} style={{width:190}}>
                {outletStores.map(store => <option key={store.id} value={store.id}>{store.name}</option>)}
              </select>
            ) : null}
            {session ? <span className="badge"><UserRound size={13} aria-hidden="true" /> {session.name || session.username}</span> : null}
            {!online ? (
              <span className="badge red offlineBadge">
                <WifiOff size={13} aria-hidden="true" /> Offline
              </span>
            ) : null}
            <button
              type="button"
              className="iconBtn"
              aria-label="Panduan penggunaan"
              title="Panduan penggunaan"
              onClick={() => setGuideOpen(true)}
            >
              <CircleHelp size={18} aria-hidden="true" />
            </button>
            <button type="button" className="iconBtn" aria-label="Notifikasi">
              <Bell size={18} aria-hidden="true" />
            </button>
            {allowedPages.includes("POS") ? <button type="button" className="btn primary hideSm" onClick={() => setPage("POS")}>
              <ShoppingCart size={16} aria-hidden="true" /> New Order
            </button> : null}
          </div>
        </header>
        {render()}
      </main>

      {toast ? (
        <div className="toast" role="status" aria-live="polite">
          {toast}
        </div>
      ) : null}

      {guideOpen ? <GuideModal onClose={() => setGuideOpen(false)} /> : null}
    </div>
  );
}

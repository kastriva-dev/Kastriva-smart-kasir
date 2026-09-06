/**
 * Data layer sisi browser untuk dashboard kasir.
 * Semua panggilan berjalan lewat /api/gas (proxy server) — kredensial backend
 * tidak pernah menyentuh client, dan action admin diotentikasi oleh cookie session.
 */

export type GasMenu = {
  id: string;
  storeId?: string;
  categoryId?: string;
  category?: string;
  name: string;
  description?: string;
  price: number;
  cost?: number;
  stock?: number | "";
  active?: boolean;
  emoji?: string;
  imageUrl?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type GasOrderItem = {
  id: string;
  orderId: string;
  menuItemId: string;
  name: string;
  price: number;
  qty: number;
  note?: string;
};

export type GasOrder = {
  id: string;
  storeId: string;
  tableId: string;
  tableCode: string;
  customerName: string;
  phone: string;
  channel: string;
  status: string;
  subtotal: number;
  discount: number;
  tax: number;
  service: number;
  total: number;
  note: string;
  createdAt: string;
  updatedAt: string;
  paymentMethod?: string;
  paidAmount?: number | "";
  changeAmount?: number | "";
  items?: GasOrderItem[];
};

export type GasTable = {
  id: string;
  storeId: string;
  code: string;
  seats: number;
  status: string;
  createdAt?: string;
};

export type GasCustomer = {
  id: string;
  storeId: string;
  name: string;
  phone: string;
  email: string;
  tier: string;
  visits: number;
  totalSpend: number;
  createdAt: string;
  updatedAt?: string;
};

export type GasInventory = {
  id: string;
  storeId: string;
  name: string;
  unit: string;
  stock: number;
  parLevel: number;
  cost: number;
  updatedAt: string;
};

export type GasReservation = {
  id: string;
  storeId: string;
  guestName: string;
  phone: string;
  partySize: number;
  reservedAt: string;
  status: string;
  note: string;
  createdAt: string;
};

export type GasStaff = {
  id: string;
  storeId: string;
  name: string;
  role: string;
  /** Hanya ada di payload tulis; getStaff menyembunyikannya dari pembacaan. */
  pinHash?: string;
  active: boolean;
  createdAt: string;
};

export type GasCategory = {
  id: string;
  storeId: string;
  name: string;
  sortOrder: number;
  active: boolean;
};

export type GasSettings = {
  storeId: string;
  storeName: string;
  phone: string;
  address: string;
  taxRate: number;
  serviceRate: number;
};

export type GasReport = {
  range: "today" | "7d" | "30d";
  orderCount: number;
  grossSales: number;
  discount: number;
  tax: number;
  service: number;
  netSales: number;
  avgCheck: number;
  paymentMix: Record<string, number>;
  statusCount: Record<string, number>;
  topItems: {name: string; qty: number; revenue: number}[];
  series: {date: string; total: number}[];
};

export const ORDER_STATUSES = ["NEW", "CONFIRMED", "COOKING", "READY", "SERVED", "PAID", "CANCELLED"] as const;
export const PAYMENT_METHODS = ["CASH", "QRIS", "DEBIT", "EWALLET", "TRANSFER"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  CASH: "Tunai",
  QRIS: "QRIS",
  DEBIT: "Debit/Kartu",
  EWALLET: "E-Wallet",
  TRANSFER: "Transfer"
};

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function parse<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as {ok?: boolean; data?: T; error?: string};
  if (!res.ok || !body.ok) throw new ApiError(body.error || "Permintaan gagal", res.status);
  return body.data as T;
}

/** Panggil action lewat proxy /api/gas (POST). */
export async function gasCall<T = unknown>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch("/api/gas", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({action, payload}),
      cache: "no-store"
    });
  } catch {
    throw new ApiError("Tidak dapat menghubungi server — periksa koneksi", 0);
  }
  return parse<T>(res);
}

/** Menu publik untuk POS dan halaman customer (GET, bisa dicache SW). */
export async function fetchPublicMenu(): Promise<GasMenu[]> {
  let res: Response;
  try {
    res = await fetch("/api/orders?action=getMenu", {cache: "no-store"});
  } catch {
    throw new ApiError("Tidak dapat menghubungi server — periksa koneksi", 0);
  }
  return parse<GasMenu[]>(res);
}

export async function fetchPublicSettings(): Promise<GasSettings> {
  return gasCall<GasSettings>("getSettings");
}

/** Tarif GAS menerima 0.11 maupun 11 sebagai "11%". Normalisasi ke desimal. */
export function normalizeRate(rate: number): number {
  return rate > 1 ? rate / 100 : rate;
}

/**
 * Pratinjau total di client — formula sama dengan createOrder_ di Code.gs.
 * Angka final tetap dihitung ulang server.
 */
export function previewTotals(subtotal: number, discount: number, settings?: Partial<GasSettings> | null) {
  const base = Math.max(0, Math.round(subtotal));
  const disc = Math.min(Math.max(0, Math.round(discount)), base);
  const taxRate = normalizeRate(Number(settings?.taxRate) || 0);
  const serviceRate = normalizeRate(Number(settings?.serviceRate) || 0);
  const tax = Math.round(base * taxRate);
  const service = Math.round(base * serviceRate);
  return {subtotal: base, discount: disc, tax, service, total: base - disc + tax + service};
}

/* ---------------- Held orders (pesanan ditahan) ---------------- */

export type HeldOrder = {
  id: string;
  label: string;
  savedAt: number;
  lines: {menuItemId: string; name: string; price: number; qty: number; emoji?: string}[];
  tableCode: string;
  customerName: string;
  note: string;
};

const HELD_KEY = "kastriva:heldOrders";

export function loadHeldOrders(): HeldOrder[] {
  try {
    const raw = window.localStorage.getItem(HELD_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(entry => entry && typeof entry === "object" && Array.isArray((entry as HeldOrder).lines));
  } catch {
    return [];
  }
}

export function saveHeldOrders(list: HeldOrder[]) {
  try {
    window.localStorage.setItem(HELD_KEY, JSON.stringify(list.slice(-20)));
  } catch {
    /* penyimpanan tidak tersedia: abaikan */
  }
}

export function formatClock(iso: string): string {
  const t = Date.parse(iso);
  if (!isFinite(t)) return "-";
  return new Date(t).toLocaleTimeString("id-ID", {hour: "2-digit", minute: "2-digit"});
}

export function formatDay(iso: string): string {
  const t = Date.parse(iso);
  if (!isFinite(t)) return "-";
  return new Date(t).toLocaleDateString("id-ID", {day: "2-digit", month: "short"});
}

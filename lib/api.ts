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
  barcode?: string;
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
  cost?: number;
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
  clientOrderId?: string;
  cancelReason?: string;
  cancelledAt?: string;
  refundedAmount?: number | "";
  refundReason?: string;
  refundedAt?: string;
  staffId?: string;
  staffName?: string;
  shiftId?: string;
  registerId?: string;
  manualDiscount?: number | "";
  discountType?: string;
  discountValue?: number | "";
  promoId?: string;
  promoName?: string;
  promoDiscount?: number | "";
  voucherCode?: string;
  voucherDiscount?: number | "";
  memberId?: string;
  memberCode?: string;
  pointsRedeemed?: number | "";
  pointsDiscount?: number | "";
  pointsEarned?: number | "";
  paymentSummary?: string;
  splitFromOrderId?: string;
  items?: GasOrderItem[];
  payments?: GasPayment[];
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
  memberCode?: string;
  points?: number;
  lifetimePoints?: number;
  lastVisitAt?: string;
};

export type GasPromotion = {
  id: string; storeId: string; name: string; type: "PERCENT" | "FIXED" | string; value: number;
  minSpend: number; maxDiscount: number; startAt?: string; endAt?: string; active: boolean; createdAt?: string; updatedAt?: string;
};

export type GasVoucher = {
  id: string; storeId: string; code: string; name: string; type: "PERCENT" | "FIXED" | string; value: number;
  minSpend: number; maxDiscount: number; usageLimit: number; usedCount: number; startAt?: string; endAt?: string; active: boolean; createdAt?: string; updatedAt?: string;
};

export type GasPayment = {
  id: string; storeId: string; orderId: string; method: PaymentMethod; amount: number; receivedAmount: number; changeAmount: number; reference?: string;
  staffId?: string; staffName?: string; shiftId?: string; registerId?: string; createdAt: string;
};

export type GasLoyaltyTransaction = {
  id: string; storeId: string; customerId: string; memberCode: string; orderId: string; type: string; points: number; balanceAfter: number; note?: string; createdAt: string;
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

export type GasSupplier = {
  id: string;
  storeId: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  note?: string;
  active?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type GasPurchaseItem = {
  id: string;
  purchaseId: string;
  inventoryId: string;
  inventoryName: string;
  qty: number;
  unitCost: number;
  total: number;
};

export type GasPurchase = {
  id: string;
  storeId: string;
  supplierId: string;
  supplierName: string;
  invoiceNo?: string;
  status: "DRAFT" | "RECEIVED" | "CANCELLED" | string;
  total: number;
  note?: string;
  createdAt: string;
  receivedAt?: string;
  receivedBy?: string;
  cancelledAt?: string;
  items?: GasPurchaseItem[];
};

export type GasRecipe = {
  id: string;
  storeId: string;
  menuItemId: string;
  menuName?: string;
  inventoryId: string;
  inventoryName?: string;
  qty: number;
  unit: string;
  unitCost?: number;
  lineCost?: number;
};

export type GasStockMovement = {
  id: string;
  storeId: string;
  inventoryId: string;
  inventoryName: string;
  type: string;
  qty: number;
  beforeStock: number;
  afterStock: number;
  unitCost: number;
  totalCost: number;
  referenceType?: string;
  referenceId?: string;
  note?: string;
  staffId?: string;
  staffName?: string;
  createdAt: string;
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
  /** Backend tidak pernah mengirim hash PIN; hanya indikator boolean. */
  hasPin?: boolean;
  active: boolean;
  createdAt: string;
};


export type GasShift = {
  id: string;
  storeId: string;
  staffId: string;
  staffName: string;
  role: string;
  registerId: string;
  status: "OPEN" | "CLOSED" | string;
  openingCash: number;
  openedAt: string;
  closingCash?: number | "";
  expectedCash?: number | "";
  cashSales?: number | "";
  cashRefunds?: number | "";
  difference?: number | "";
  closedAt?: string;
  note?: string;
};

export type SessionInfo = {
  configured: boolean;
  authenticated: boolean;
  username: string | null;
  name: string | null;
  staffId: string | null;
  storeId: string | null;
  role: "admin" | "manager" | "cashier" | "kitchen" | "waiter" | "barista" | "staff" | null;
  expiresAt: string | null;
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
  loyaltyEnabled?: boolean;
  loyaltySpendPerPoint?: number;
  loyaltyPointValue?: number;
  maxRedeemPercent?: number;
};

export type GasReport = {
  range: "today" | "7d" | "30d";
  orderCount: number;
  totalOrders?: number;
  grossSales: number;
  discount: number;
  tax: number;
  service: number;
  netSales: number;
  outstandingSales?: number;
  refundedSales?: number;
  refundCount?: number;
  avgCheck: number;
  cogs?: number;
  grossProfit?: number;
  grossMargin?: number;
  paymentMix: Record<string, number>;
  statusCount: Record<string, number>;
  topItems: {name: string; qty: number; revenue: number}[];
  series: {date: string; total: number}[];
};

export type GasStore = {
  id: string; name: string; slug: string; phone?: string; address?: string; taxRate?: number; serviceRate?: number; active?: boolean; createdAt?: string;
};

export type GasSubscription = {
  id: string; installationId: string; plan: string; status: "TRIAL" | "ACTIVE" | "EXPIRED" | string; trialStart: string; trialEnd: string; activeUntil?: string; maxOutlets: number; licenseId?: string; updatedAt?: string; daysRemaining: number; isActive: boolean;
};

export type GasOwnerDashboard = {
  range: string; generatedAt: string; totals: {netSales:number;cogs:number;grossProfit:number;grossMargin:number;orders:number;outstanding:number;refunds:number};
  outlets: {storeId:string;name:string;slug:string;netSales:number;orders:number;avgCheck:number;cogs:number;grossProfit:number;grossMargin:number;outstanding:number;refunds:number;lowStock:number}[];
};

export type GasAdvancedAnalytics = {
  storeId:string; days:number; paidOrders:number; uniqueCustomers:number; repeatCustomers:number; repeatRate:number; generatedAt:string;
  hourly:{label:string;value:number}[]; weekday:{label:string;value:number}[]; channel:{label:string;value:number}[]; staff:{label:string;value:number}[]; category:{label:string;value:number}[];
};

export type GasSyncState = {
  storeId:string; serverTime:string; lastChangeAt:string; mode:string; counts:{orders:number;menu:number;customers:number;inventory:number};
};

export type GasBackup = {
  format:string; version:number; exportedAt:string; checksum:string; store:GasStore; data:Record<string, unknown[]>;
};

export const ORDER_STATUSES = ["NEW", "CONFIRMED", "COOKING", "READY", "SERVED", "PAID", "CANCELLED", "REFUNDED"] as const;
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
export async function fetchPublicMenu(storeId = ""): Promise<GasMenu[]> {
  let res: Response;
  try {
    const qs = new URLSearchParams({action: "getMenu"});
    if (storeId) qs.set("storeId", storeId);
    res = await fetch(`/api/orders?${qs.toString()}`, {cache: "no-store"});
  } catch {
    throw new ApiError("Tidak dapat menghubungi server — periksa koneksi", 0);
  }
  return parse<GasMenu[]>(res);
}

export async function fetchPublicSettings(storeId = ""): Promise<GasSettings> {
  return gasCall<GasSettings>("getSettings", storeId ? {storeId} : {});
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

export function newClientOrderId(prefix = "ORD"): string {
  const safePrefix = prefix.replace(/[^A-Z0-9_-]/gi, "").slice(0, 12) || "ORD";
  const id = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return `${safePrefix}-${id}`.slice(0, 96);
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

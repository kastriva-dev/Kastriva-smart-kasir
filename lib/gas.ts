import {createHash, timingSafeEqual} from "node:crypto";
// Import dengan ekstensi .ts supaya modul ini juga bisa dijalankan langsung
// oleh test runner Node (strip-types butuh ekstensi eksplisit).
import {SESSION_COOKIE, verifySession, type SessionRole} from "./session.ts";

/**
 * Server-side client untuk Google Apps Script.
 * File ini hanya boleh diimport dari route handler / server component:
 * di dalamnya ada GAS_API_KEY dan ADMIN_API_TOKEN.
 */

export type GasResponse<T = unknown> = {
  ok: boolean;
  data?: T;
  error?: string;
  [key: string]: unknown;
};

export type OrderItemInput = {
  menuItemId: string;
  name?: string;
  qty: number;
  note?: string;
};

export type CreateOrderInput = {
  storeId?: string;
  tableCode?: string;
  tableId?: string;
  customerName?: string;
  phone?: string;
  channel?: string;
  note?: string;
  discount?: number;
  clientOrderId?: string;
  manualDiscountType?: "FIXED" | "PERCENT";
  manualDiscountValue?: number;
  promoId?: string;
  voucherCode?: string;
  pointsToRedeem?: number;
  items: OrderItemInput[];
};

const GAS_URL = (process.env.GAS_WEB_APP_URL || "").trim();
const GAS_KEY = (process.env.GAS_API_KEY || "").trim();
const ADMIN_TOKEN = (process.env.ADMIN_API_TOKEN || "").trim();
const TIMEOUT_MS = clamp(Number(process.env.GAS_TIMEOUT_MS) || 15000, 1000, 60000);

/** Action yang boleh dipanggil browser tanpa session. */
export const PUBLIC_ACTIONS = new Set(["health", "getMenu", "getTables", "getSettings", "createOrder"]);

/** Action internal yang dilindungi permission role. Nama dipertahankan untuk kompatibilitas test lama. */
export const ADMIN_ACTIONS = new Set([
  "getOrders", "getOrder", "updateOrderStatus", "payOrder", "refundOrder", "splitOrder",
  "getCustomers", "findCustomer", "getPromotions", "getVouchers", "getLoyaltyTransactions", "getInventory", "getSuppliers", "getPurchases", "getRecipes", "getStockMovements", "getReservations", "getStaff", "getCategories", "getReport",
  "getShifts", "getCurrentShift", "openShift", "closeShift",
  "getStores", "getOwnerDashboard", "getAnalytics", "getSyncState", "exportBackup", "getSubscription",
  "saveMenu", "saveCategory", "saveTable", "saveInventory", "savePromotion", "saveVoucher", "saveSupplier", "saveRecipe", "createPurchase", "receivePurchase", "cancelPurchase", "adjustInventory", "saveReservation", "saveCustomer",
  "saveStaff", "saveSettings", "saveStore", "deleteData", "deleteMenu", "audit"
]);

export const ORDER_STATUSES = ["NEW", "CONFIRMED", "COOKING", "READY", "SERVED", "PAID", "CANCELLED", "REFUNDED"] as const;
export const ORDER_CHANNELS = ["POS", "QR", "WA"] as const;
export const PAYMENT_METHODS = ["CASH", "QRIS", "DEBIT", "EWALLET", "TRANSFER"] as const;
export const DELETABLE_SHEETS = ["Menu", "Tables", "Inventory", "Promotions", "Vouchers", "Suppliers", "Reservations", "Customers", "Staff"] as const;

export type AccessContext = {
  authenticated: boolean;
  isAdmin: boolean;
  role: SessionRole | "guest";
  actorId: string;
  actorName: string;
  storeId: string;
};

const OWNER_ONLY_ACTIONS = new Set(["getOwnerDashboard", "getStores", "saveStore", "exportBackup"]);

const ROLE_ACTIONS: Record<SessionRole, ReadonlySet<string>> = {
  admin: new Set(ADMIN_ACTIONS),
  manager: new Set([...ADMIN_ACTIONS].filter(action => !OWNER_ONLY_ACTIONS.has(action))),
  cashier: new Set(["getOrders", "getOrder", "updateOrderStatus", "payOrder", "splitOrder", "getCustomers", "findCustomer", "getPromotions", "getVouchers", "getReport", "getCurrentShift", "getShifts", "openShift", "closeShift", "saveReservation", "getReservations"]),
  kitchen: new Set(["getOrders", "getOrder", "updateOrderStatus", "getCurrentShift", "openShift", "closeShift"]),
  waiter: new Set(["getOrders", "getOrder", "updateOrderStatus", "getReservations", "saveReservation", "saveTable", "getCustomers", "findCustomer", "getCurrentShift", "openShift", "closeShift"]),
  barista: new Set(["getOrders", "getOrder", "updateOrderStatus", "getCurrentShift", "openShift", "closeShift"]),
  staff: new Set(["getOrders", "getOrder", "updateOrderStatus", "getCurrentShift", "openShift", "closeShift"])
};

export class HttpError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

export function isKnownAction(action: string) {
  return PUBLIC_ACTIONS.has(action) || ADMIN_ACTIONS.has(action);
}

function safeEqual(a: string, b: string) {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

function readSessionCookie(req: Request): string {
  const header = req.headers.get("cookie") || "";
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === SESSION_COOKIE) return part.slice(idx + 1).trim();
  }
  return "";
}

export async function getAccessContext(req: Request): Promise<AccessContext> {
  const header = req.headers.get("x-admin-token") || "";
  const auth = req.headers.get("authorization") || "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  const sent = (header || bearer).trim();
  if (sent && ADMIN_TOKEN && safeEqual(sent, ADMIN_TOKEN)) {
    return {authenticated: true, isAdmin: true, role: "admin", actorId: "api-token", actorName: "API Admin", storeId: ""};
  }

  const session = await verifySession(readSessionCookie(req));
  if (!session) return {authenticated: false, isAdmin: false, role: "guest", actorId: "", actorName: "", storeId: ""};
  return {
    authenticated: true,
    isAdmin: session.role === "admin",
    role: session.role,
    actorId: session.sub,
    actorName: session.name || session.sub,
    storeId: session.storeId || ""
  };
}

export async function hasAdminAccess(req: Request): Promise<boolean> {
  return (await getAccessContext(req)).isAdmin;
}

/** Permission server-side: UI boleh menyembunyikan menu, tetapi server tetap menjadi sumber kebenaran. */
export async function assertActionAllowed(action: string, req: Request): Promise<AccessContext> {
  if (!action || !isKnownAction(action)) {
    throw new HttpError(`Action tidak diizinkan: ${String(action).slice(0, 40)}`, 400);
  }
  const access = await getAccessContext(req);
  if (PUBLIC_ACTIONS.has(action)) return access;
  if (!access.authenticated) throw new HttpError("Unauthorized", 401);
  if (access.role === "guest" || !ROLE_ACTIONS[access.role]?.has(action)) {
    throw new HttpError("Akses role tidak diizinkan", 403);
  }
  return access;
}

export function canUseDiscount(role: AccessContext["role"]): boolean {
  return role === "admin" || role === "manager" || role === "cashier";
}

export function assertStatusAllowedForRole(role: AccessContext["role"], status: string) {
  if (role === "admin" || role === "manager") return;
  const allowed: Record<string, string[]> = {
    cashier: ["CONFIRMED", "SERVED", "CANCELLED"],
    kitchen: ["CONFIRMED", "COOKING", "READY"],
    barista: ["CONFIRMED", "COOKING", "READY"],
    waiter: ["CONFIRMED", "SERVED"],
    staff: ["CONFIRMED"]
  };
  if (!(allowed[String(role)] || []).includes(status)) throw new HttpError("Role Anda tidak boleh mengubah ke status tersebut", 403);
}

export function attachActor(payload: Record<string, unknown>, access: AccessContext): Record<string, unknown> {
  const out = {...payload};
  delete out._actorId; delete out._actorName; delete out._actorRole; delete out._actorStoreId;
  if (access.authenticated) {
    out._actorId = access.actorId;
    out._actorName = access.actorName;
    out._actorRole = access.role;
    out._actorStoreId = access.storeId;
  }
  return out;
}

export async function callGas<T = unknown>(action: string, payload: Record<string, unknown> = {}) {
  if (!GAS_URL) throw new HttpError("GAS_WEB_APP_URL belum dikonfigurasi di server", 503);

  let res: Response;
  try {
    res = await fetch(GAS_URL, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({key: GAS_KEY, action, payload}),
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
  } catch (e) {
    const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    throw new HttpError(timeout ? "Backend tidak merespons (timeout)" : "Tidak dapat menghubungi backend", 504);
  }

  const text = await res.text();
  let data: GasResponse<T>;
  try {
    data = JSON.parse(text) as GasResponse<T>;
  } catch {
    // Apps Script mengirim halaman HTML saat deployment salah / butuh otorisasi.
    throw new HttpError("Respons backend tidak valid. Periksa deployment Apps Script.", 502);
  }

  if (!res.ok) throw new HttpError(String(data.error || "Backend menolak permintaan"), 502);
  if (!data.ok) throw new HttpError(String(data.error || "Backend mengembalikan error"), 400);
  return data;
}

function str(value: unknown, max: number) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Membersihkan payload createOrder dari client.
 * Harga sengaja TIDAK diambil dari client; Apps Script menghitung ulang dari sheet Menu.
 * Diskon hanya diteruskan untuk request admin ({admin: true}) — pelanggan publik selalu 0.
 */
export function sanitizeCreateOrder(input: unknown, opts: {admin?: boolean} = {}): CreateOrderInput {
  if (!input || typeof input !== "object") throw new HttpError("Payload pesanan tidak valid", 400);
  const raw = input as Record<string, unknown>;
  const rawItems = Array.isArray(raw.items) ? raw.items : [];
  if (rawItems.length === 0) throw new HttpError("Pesanan tidak boleh kosong", 400);
  if (rawItems.length > 60) throw new HttpError("Terlalu banyak item dalam satu pesanan", 400);

  const items: OrderItemInput[] = rawItems.map((entry, index) => {
    if (!entry || typeof entry !== "object") throw new HttpError(`Item #${index + 1} tidak valid`, 400);
    const item = entry as Record<string, unknown>;
    const menuItemId = str(item.menuItemId ?? item.id, 64);
    if (!menuItemId) throw new HttpError(`Item #${index + 1} tidak memiliki menuItemId`, 400);
    const qty = Number(item.qty);
    if (!Number.isFinite(qty) || !Number.isInteger(qty) || qty < 1 || qty > 99) {
      throw new HttpError(`Qty item #${index + 1} harus bilangan bulat 1-99`, 400);
    }
    return {menuItemId, name: str(item.name, 120), qty, note: str(item.note, 200)};
  });

  const channel = str(raw.channel, 8).toUpperCase();
  const phone = str(raw.phone, 20).replace(/[^\d+]/g, "");
  const discountRaw = num(raw.discount);
  const discount = opts.admin && Number.isFinite(discountRaw) ? clamp(Math.round(discountRaw), 0, 100_000_000) : 0;
  const manualDiscountType = str(raw.manualDiscountType, 12).toUpperCase() === "PERCENT" ? "PERCENT" : "FIXED";
  const manualRaw = num(raw.manualDiscountValue);
  const manualDiscountValue = opts.admin && Number.isFinite(manualRaw)
    ? (manualDiscountType === "PERCENT" ? clamp(manualRaw, 0, 100) : clamp(Math.round(manualRaw), 0, 100_000_000))
    : discount;
  const pointsRaw = num(raw.pointsToRedeem);
  const pointsToRedeem = opts.admin && Number.isFinite(pointsRaw) ? clamp(Math.floor(pointsRaw), 0, 100_000_000) : 0;

  return {
    storeId: str(raw.storeId, 64),
    tableCode: str(raw.tableCode, 32),
    tableId: str(raw.tableId, 64),
    customerName: str(raw.customerName, 80),
    phone,
    note: str(raw.note, 300),
    channel: (ORDER_CHANNELS as readonly string[]).includes(channel) ? channel : "QR",
    discount,
    manualDiscountType,
    manualDiscountValue,
    promoId: opts.admin ? str(raw.promoId, 64) : "",
    voucherCode: str(raw.voucherCode, 40).toUpperCase().replace(/[^A-Z0-9_-]/g, ""),
    pointsToRedeem,
    clientOrderId: str(raw.clientOrderId, 96),
    items
  };
}

export function sanitizeStatusUpdate(input: unknown) {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const id = str(raw.id, 64);
  const status = str(raw.status, 16).toUpperCase();
  if (!id) throw new HttpError("id pesanan wajib diisi", 400);
  if (!(ORDER_STATUSES as readonly string[]).includes(status)) throw new HttpError("Status pesanan tidak valid", 400);
  return {id, status, reason: str(raw.reason, 300), userId: str(raw.userId, 64) || "staff"};
}

export function sanitizePayOrder(input: unknown) {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const id = str(raw.id, 64);
  if (!id) throw new HttpError("id pesanan wajib diisi", 400);
  if (Array.isArray(raw.payments) && raw.payments.length) {
    if (raw.payments.length > 5) throw new HttpError("Maksimal 5 metode pembayaran", 400);
    const seen = new Set<string>();
    const payments = raw.payments.map((entry, index) => {
      const item = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
      const method = str(item.method, 16).toUpperCase();
      if (!(PAYMENT_METHODS as readonly string[]).includes(method)) throw new HttpError(`Metode pembayaran #${index + 1} tidak valid`, 400);
      if (seen.has(method)) throw new HttpError("Metode pembayaran split tidak boleh duplikat", 400);
      seen.add(method);
      const amountRaw = num(item.amount);
      if (!Number.isFinite(amountRaw) || amountRaw <= 0) throw new HttpError(`Nominal pembayaran #${index + 1} tidak valid`, 400);
      const receivedRaw = num(item.receivedAmount ?? item.paidAmount);
      const amount = clamp(Math.round(amountRaw), 1, 1_000_000_000);
      const receivedAmount = method === "CASH" && Number.isFinite(receivedRaw) ? clamp(Math.round(receivedRaw), 0, 1_000_000_000) : amount;
      return {method, amount, receivedAmount, reference: str(item.reference, 80)};
    });
    return {id, payments, userId: str(raw.userId, 64) || "staff"};
  }
  const method = str(raw.method, 16).toUpperCase();
  if (!(PAYMENT_METHODS as readonly string[]).includes(method)) throw new HttpError("Metode pembayaran tidak valid", 400);
  const paidRaw = num(raw.paidAmount);
  const paidAmount = Number.isFinite(paidRaw) ? clamp(Math.round(paidRaw), 0, 1_000_000_000) : 0;
  return {id, method, paidAmount, reference: str(raw.reference, 80), userId: str(raw.userId, 64) || "staff"};
}

export function sanitizeRefundOrder(input: unknown) {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const id = str(raw.id, 64);
  const reason = str(raw.reason, 300);
  if (!id) throw new HttpError("id pesanan wajib diisi", 400);
  if (!reason) throw new HttpError("Alasan refund wajib diisi", 400);
  return {
    id,
    reason,
    restock: raw.restock === true,
    userId: str(raw.userId, 64) || "staff"
  };
}

export function sanitizeSaveSupplier(input: unknown) {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const name = str(raw.name, 120);
  if (!name) throw new HttpError("Nama supplier wajib diisi", 400);
  return {
    id: str(raw.id, 64),
    storeId: str(raw.storeId, 64),
    name,
    phone: str(raw.phone, 24).replace(/[^\d+]/g, ""),
    email: str(raw.email, 160).toLowerCase(),
    address: str(raw.address, 300),
    note: str(raw.note, 300),
    active: raw.active !== false
  };
}

export function sanitizeSaveRecipe(input: unknown) {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const menuItemId = str(raw.menuItemId, 64);
  if (!menuItemId) throw new HttpError("Menu resep wajib dipilih", 400);
  const source = Array.isArray(raw.items) ? raw.items : [];
  if (source.length > 40) throw new HttpError("Terlalu banyak bahan dalam resep", 400);
  const items = source.map((entry, index) => {
    const item = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
    const inventoryId = str(item.inventoryId, 64);
    const qty = num(item.qty);
    if (!inventoryId) throw new HttpError(`Bahan resep #${index + 1} wajib dipilih`, 400);
    if (!Number.isFinite(qty) || qty <= 0 || qty > 1_000_000) throw new HttpError(`Qty resep #${index + 1} tidak valid`, 400);
    return {inventoryId, qty};
  });
  return {menuItemId, items};
}

export function sanitizeCreatePurchase(input: unknown) {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const supplierId = str(raw.supplierId, 64);
  if (!supplierId) throw new HttpError("Supplier wajib dipilih", 400);
  const source = Array.isArray(raw.items) ? raw.items : [];
  if (!source.length) throw new HttpError("Pembelian harus memiliki item", 400);
  if (source.length > 100) throw new HttpError("Terlalu banyak item pembelian", 400);
  const items = source.map((entry, index) => {
    const item = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
    const inventoryId = str(item.inventoryId, 64);
    const qty = num(item.qty);
    const unitCost = num(item.unitCost);
    if (!inventoryId) throw new HttpError(`Bahan pembelian #${index + 1} wajib dipilih`, 400);
    if (!Number.isFinite(qty) || qty <= 0 || qty > 100_000_000) throw new HttpError(`Qty pembelian #${index + 1} tidak valid`, 400);
    if (!Number.isFinite(unitCost) || unitCost < 0 || unitCost > 1_000_000_000) throw new HttpError(`Harga beli #${index + 1} tidak valid`, 400);
    return {inventoryId, qty, unitCost};
  });
  return {storeId: str(raw.storeId, 64), supplierId, invoiceNo: str(raw.invoiceNo, 80), note: str(raw.note, 300), items};
}

export function sanitizePurchaseAction(input: unknown, requireReason = false) {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const id = str(raw.id, 64);
  if (!id) throw new HttpError("ID pembelian wajib diisi", 400);
  const reason = str(raw.reason, 300);
  if (requireReason && !reason) throw new HttpError("Alasan pembatalan wajib diisi", 400);
  return {id, reason};
}

export function sanitizeInventoryAdjustment(input: unknown) {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const id = str(raw.id, 64);
  const type = str(raw.type, 16).toUpperCase();
  const reason = str(raw.reason, 300);
  if (!id) throw new HttpError("Bahan wajib dipilih", 400);
  if (!["OPNAME", "WASTE", "ADJUSTMENT"].includes(type)) throw new HttpError("Tipe penyesuaian tidak valid", 400);
  if (!reason) throw new HttpError("Alasan penyesuaian stok wajib diisi", 400);
  const out: Record<string, unknown> = {id, type, reason};
  if (type === "OPNAME") {
    const countedStock = num(raw.countedStock);
    if (!Number.isFinite(countedStock) || countedStock < 0) throw new HttpError("Stok fisik opname tidak valid", 400);
    out.countedStock = countedStock;
  } else if (type === "WASTE") {
    const qty = num(raw.qty);
    if (!Number.isFinite(qty) || qty <= 0) throw new HttpError("Qty waste harus lebih dari 0", 400);
    out.qty = qty;
  } else {
    const delta = num(raw.delta);
    if (!Number.isFinite(delta) || delta === 0) throw new HttpError("Delta adjustment tidak valid", 400);
    out.delta = delta;
  }
  return out;
}

export function sanitizeSaveStore(input: unknown) {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const name = str(raw.name, 120);
  if (!name) throw new HttpError("Nama outlet wajib diisi", 400);
  const taxRate = Math.min(100, Math.max(0, Number.isFinite(num(raw.taxRate)) ? num(raw.taxRate) : 0));
  const serviceRate = Math.min(100, Math.max(0, Number.isFinite(num(raw.serviceRate)) ? num(raw.serviceRate) : 0));
  return {
    id: str(raw.id, 64),
    name,
    slug: str(raw.slug, 64).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, ""),
    phone: str(raw.phone, 24).replace(/[^0-9+]/g, ""),
    address: str(raw.address, 300),
    taxRate,
    serviceRate,
    active: raw.active === false || String(raw.active).toLowerCase() === "false" ? false : true
  };
}

export function sanitizeSaveSettings(input: unknown) {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {storeId: str(raw.storeId, 64)};
  if (raw.name !== undefined) out.name = str(raw.name, 120);
  if (raw.phone !== undefined) out.phone = str(raw.phone, 20).replace(/[^\d+]/g, "");
  if (raw.address !== undefined) out.address = str(raw.address, 300);
  if (raw.taxRate !== undefined) {
    const n = num(raw.taxRate);
    out.taxRate = Number.isFinite(n) ? clamp(n, 0, 100) : 0;
  }
  if (raw.serviceRate !== undefined) {
    const n = num(raw.serviceRate);
    out.serviceRate = Number.isFinite(n) ? clamp(n, 0, 100) : 0;
  }
  if (raw.loyaltyEnabled !== undefined) out.loyaltyEnabled = raw.loyaltyEnabled !== false;
  if (raw.loyaltySpendPerPoint !== undefined) { const n = num(raw.loyaltySpendPerPoint); out.loyaltySpendPerPoint = Number.isFinite(n) ? clamp(Math.round(n), 1, 100_000_000) : 10000; }
  if (raw.loyaltyPointValue !== undefined) { const n = num(raw.loyaltyPointValue); out.loyaltyPointValue = Number.isFinite(n) ? clamp(Math.round(n), 1, 10_000_000) : 100; }
  if (raw.maxRedeemPercent !== undefined) { const n = num(raw.maxRedeemPercent); out.maxRedeemPercent = Number.isFinite(n) ? clamp(n, 0, 100) : 30; }
  return out;
}

export function sanitizeSavePromotion(input: unknown) {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const name = str(raw.name, 100); if (!name) throw new HttpError("Nama promo wajib diisi", 400);
  const type = str(raw.type, 12).toUpperCase() === "FIXED" ? "FIXED" : "PERCENT";
  const v = num(raw.value); if (!Number.isFinite(v) || v < 0) throw new HttpError("Nilai promo tidak valid", 400);
  return {id:str(raw.id,64), storeId:str(raw.storeId,64), name, type, value:type === "PERCENT" ? clamp(v,0,100) : clamp(Math.round(v),0,100_000_000), minSpend:clamp(Math.round(num(raw.minSpend)||0),0,1_000_000_000), maxDiscount:clamp(Math.round(num(raw.maxDiscount)||0),0,1_000_000_000), startAt:str(raw.startAt,32), endAt:str(raw.endAt,32), active:raw.active !== false};
}

export function sanitizeSaveVoucher(input: unknown) {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const code = str(raw.code,40).toUpperCase().replace(/[^A-Z0-9_-]/g,""); if(!code) throw new HttpError("Kode voucher wajib diisi",400);
  const type = str(raw.type,12).toUpperCase() === "PERCENT" ? "PERCENT" : "FIXED";
  const v=num(raw.value); if(!Number.isFinite(v)||v<0) throw new HttpError("Nilai voucher tidak valid",400);
  return {id:str(raw.id,64),storeId:str(raw.storeId,64),code,name:str(raw.name,100)||code,type,value:type === "PERCENT"?clamp(v,0,100):clamp(Math.round(v),0,100_000_000),minSpend:clamp(Math.round(num(raw.minSpend)||0),0,1_000_000_000),maxDiscount:clamp(Math.round(num(raw.maxDiscount)||0),0,1_000_000_000),usageLimit:clamp(Math.floor(num(raw.usageLimit)||0),0,10_000_000),usedCount:clamp(Math.floor(num(raw.usedCount)||0),0,10_000_000),startAt:str(raw.startAt,32),endAt:str(raw.endAt,32),active:raw.active!==false};
}

export function sanitizeSplitOrder(input: unknown) {
  const raw=(input&&typeof input === "object"?input:{}) as Record<string,unknown>; const id=str(raw.id,64); if(!id) throw new HttpError("ID order wajib diisi",400);
  const src=Array.isArray(raw.items)?raw.items:[]; if(!src.length) throw new HttpError("Pilih item untuk split bill",400); if(src.length>60) throw new HttpError("Terlalu banyak item split",400);
  const items=src.map((entry,index)=>{const item=(entry&&typeof entry === "object"?entry:{}) as Record<string,unknown>; const orderItemId=str(item.orderItemId??item.id,64); const qty=num(item.qty); if(!orderItemId) throw new HttpError(`Item split #${index+1} tidak valid`,400); if(!Number.isFinite(qty)||!Number.isInteger(qty)||qty<1||qty>99) throw new HttpError(`Qty split #${index+1} tidak valid`,400); return {orderItemId,qty};});
  return {id,items};
}

export function sanitizeDeleteData(input: unknown) {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const sheet = str(raw.sheet, 32);
  if (!(DELETABLE_SHEETS as readonly string[]).includes(sheet)) {
    throw new HttpError("Sheet tidak boleh dihapus lewat API", 400);
  }
  const id = str(raw.id, 64);
  if (!id) throw new HttpError("Parameter id wajib diisi", 400);
  return {sheet, id};
}

/**
 * Rate limit sederhana berbasis memori proses.
 * Best effort: pada serverless setiap instance punya counter sendiri,
 * cukup untuk menahan spam sepele, bukan pengganti WAF.
 */
const hits = new Map<string, {count: number; reset: number}>();

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const current = hits.get(key);
  if (!current || current.reset <= now) {
    hits.set(key, {count: 1, reset: now + windowMs});
    if (hits.size > 5000) for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
    return true;
  }
  current.count += 1;
  return current.count <= limit;
}

export function clientKey(req: Request, suffix = "") {
  const fwd = req.headers.get("x-forwarded-for") || "";
  const ip = fwd.split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
  return `${ip}:${suffix}`;
}

export function errorResponse(e: unknown) {
  if (e instanceof HttpError) return {body: {ok: false, error: e.message}, status: e.status};
  console.error("[api] unexpected error", e);
  return {body: {ok: false, error: "Terjadi kesalahan pada server"}, status: 500};
}

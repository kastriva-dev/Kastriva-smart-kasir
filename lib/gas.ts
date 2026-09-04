import {createHash, timingSafeEqual} from "node:crypto";

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
  items: OrderItemInput[];
};

const GAS_URL = (process.env.GAS_WEB_APP_URL || "").trim();
const GAS_KEY = (process.env.GAS_API_KEY || "").trim();
const ADMIN_TOKEN = (process.env.ADMIN_API_TOKEN || "").trim();
const TIMEOUT_MS = clamp(Number(process.env.GAS_TIMEOUT_MS) || 15000, 1000, 60000);

/** Action yang boleh dipanggil browser tanpa kredensial. */
export const PUBLIC_ACTIONS = new Set(["health", "getMenu", "getTables", "createOrder"]);

/** Action yang mengubah data / membaca data sensitif: wajib ADMIN_API_TOKEN. */
export const ADMIN_ACTIONS = new Set([
  "getOrders",
  "getOrder",
  "updateOrderStatus",
  "getCustomers",
  "getInventory",
  "getReservations",
  "saveMenu",
  "saveTable",
  "saveInventory",
  "saveReservation",
  "deleteMenu",
  "audit"
]);

export const ORDER_STATUSES = ["NEW", "CONFIRMED", "COOKING", "READY", "SERVED", "PAID", "CANCELLED"] as const;
export const ORDER_CHANNELS = ["POS", "QR", "WA"] as const;

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
  // Hash dulu supaya panjang string tidak bocor lewat timing/length check.
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function hasAdminAccess(req: Request) {
  if (!ADMIN_TOKEN) return false;
  const header = req.headers.get("x-admin-token") || "";
  const auth = req.headers.get("authorization") || "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  const sent = (header || bearer).trim();
  if (!sent) return false;
  return safeEqual(sent, ADMIN_TOKEN);
}

/** Menolak action yang tidak dikenal, dan action admin tanpa token yang valid. */
export function assertActionAllowed(action: string, req: Request) {
  if (!action || !isKnownAction(action)) {
    throw new HttpError(`Action tidak diizinkan: ${String(action).slice(0, 40)}`, 400);
  }
  if (ADMIN_ACTIONS.has(action)) {
    if (!ADMIN_TOKEN) throw new HttpError("ADMIN_API_TOKEN belum dikonfigurasi di server", 503);
    if (!hasAdminAccess(req)) throw new HttpError("Unauthorized", 401);
  }
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

/**
 * Membersihkan payload createOrder dari client.
 * Harga sengaja TIDAK diambil dari client; Apps Script menghitung ulang dari sheet Menu.
 */
export function sanitizeCreateOrder(input: unknown): CreateOrderInput {
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

  return {
    storeId: str(raw.storeId, 64),
    tableCode: str(raw.tableCode, 32),
    tableId: str(raw.tableId, 64),
    customerName: str(raw.customerName, 80),
    phone,
    note: str(raw.note, 300),
    channel: (ORDER_CHANNELS as readonly string[]).includes(channel) ? channel : "QR",
    items
  };
}

export function sanitizeStatusUpdate(input: unknown) {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const id = str(raw.id, 64);
  const status = str(raw.status, 16).toUpperCase();
  if (!id) throw new HttpError("id pesanan wajib diisi", 400);
  if (!(ORDER_STATUSES as readonly string[]).includes(status)) throw new HttpError("Status pesanan tidak valid", 400);
  return {id, status, userId: str(raw.userId, 64) || "staff"};
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

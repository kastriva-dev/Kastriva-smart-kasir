import {NextResponse} from "next/server";
import {
  assertActionAllowed,
  assertStatusAllowedForRole,
  attachActor,
  canUseDiscount,
  callGas,
  clientKey,
  errorResponse,
  HttpError,
  rateLimit,
  sanitizeCreateOrder,
  sanitizeCreatePurchase,
  sanitizeInventoryAdjustment,
  sanitizePurchaseAction,
  sanitizeSaveRecipe,
  sanitizeSaveSupplier,
  sanitizeSavePromotion,
  sanitizeSaveVoucher,
  sanitizeSplitOrder,
  sanitizeDeleteData,
  sanitizePayOrder,
  sanitizeRefundOrder,
  sanitizeSaveSettings,
  sanitizeSaveStore,
  sanitizeStatusUpdate
} from "@/lib/gas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = {"Cache-Control": "no-store, max-age=0"};

/**
 * Proxy generik ke Google Apps Script.
 * Hanya action yang ada di allowlist yang diteruskan, dan action admin
 * membutuhkan token mesin atau session login (lihat lib/gas.ts).
 *
 * Payload diberi flag `_admin` yang dihitung di server: browser tidak bisa
 * mengirimnya, dan hanya request admin yang boleh membawa diskon ke GAS.
 */
export async function POST(req: Request) {
  try {
    if (!rateLimit(clientKey(req, "gas"), 120, 60_000)) throw new HttpError("Terlalu banyak permintaan", 429);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      throw new HttpError("Body harus berupa JSON yang valid", 400);
    }

    const raw = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const action = String(raw.action || "");
    const access = await assertActionAllowed(action, req);

    const rawPayload = (raw.payload && typeof raw.payload === "object" ? raw.payload : {}) as Record<string, unknown>;
    let payload: Record<string, unknown>;
    if (action === "createOrder") {
      payload = sanitizeCreateOrder(rawPayload, {admin: canUseDiscount(access.role)}) as unknown as Record<string, unknown>;
      const posRoles = ["admin", "manager", "cashier", "waiter"];
      if (!access.authenticated || !posRoles.includes(String(access.role))) payload.channel = "QR";
      payload._admin = canUseDiscount(access.role);
    } else if (action === "updateOrderStatus") {
      payload = sanitizeStatusUpdate(rawPayload) as unknown as Record<string, unknown>;
      assertStatusAllowedForRole(access.role, String(payload.status || ""));
    } else if (action === "payOrder") {
      payload = sanitizePayOrder(rawPayload) as unknown as Record<string, unknown>;
    } else if (action === "refundOrder") {
      payload = sanitizeRefundOrder(rawPayload) as unknown as Record<string, unknown>;
    } else if (action === "splitOrder") {
      payload = sanitizeSplitOrder(rawPayload) as unknown as Record<string, unknown>;
    } else if (action === "saveSettings") {
      payload = sanitizeSaveSettings(rawPayload) as unknown as Record<string, unknown>;
    } else if (action === "saveStore") {
      payload = sanitizeSaveStore(rawPayload) as unknown as Record<string, unknown>;
    } else if (action === "saveSupplier") {
      payload = sanitizeSaveSupplier(rawPayload) as unknown as Record<string, unknown>;
    } else if (action === "savePromotion") {
      payload = sanitizeSavePromotion(rawPayload) as unknown as Record<string, unknown>;
    } else if (action === "saveVoucher") {
      payload = sanitizeSaveVoucher(rawPayload) as unknown as Record<string, unknown>;
    } else if (action === "saveRecipe") {
      payload = sanitizeSaveRecipe(rawPayload) as unknown as Record<string, unknown>;
    } else if (action === "createPurchase") {
      payload = sanitizeCreatePurchase(rawPayload) as unknown as Record<string, unknown>;
    } else if (action === "receivePurchase") {
      payload = sanitizePurchaseAction(rawPayload) as unknown as Record<string, unknown>;
    } else if (action === "cancelPurchase") {
      payload = sanitizePurchaseAction(rawPayload, true) as unknown as Record<string, unknown>;
    } else if (action === "adjustInventory") {
      payload = sanitizeInventoryAdjustment(rawPayload) as unknown as Record<string, unknown>;
    } else if (action === "deleteData") {
      payload = sanitizeDeleteData(rawPayload) as unknown as Record<string, unknown>;
    } else {
      payload = rawPayload;
    }

    payload = attachActor(payload, access);
    const data = await callGas(action, payload);
    return NextResponse.json(data, {status: action === "createOrder" ? 201 : 200, headers: noStore});
  } catch (e) {
    const {body, status} = errorResponse(e);
    return NextResponse.json(body, {status, headers: noStore});
  }
}

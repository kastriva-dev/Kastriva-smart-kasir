import {NextResponse} from "next/server";
import {
  assertActionAllowed,
  callGas,
  clientKey,
  errorResponse,
  HttpError,
  rateLimit,
  sanitizeCreateOrder,
  sanitizeDeleteData,
  sanitizePayOrder,
  sanitizeSaveSettings,
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
    const admin = await assertActionAllowed(action, req);

    const rawPayload = (raw.payload && typeof raw.payload === "object" ? raw.payload : {}) as Record<string, unknown>;
    let payload: Record<string, unknown>;
    if (action === "createOrder") {
      payload = sanitizeCreateOrder(rawPayload, {admin}) as unknown as Record<string, unknown>;
      payload._admin = admin;
    } else if (action === "updateOrderStatus") {
      payload = sanitizeStatusUpdate(rawPayload) as unknown as Record<string, unknown>;
    } else if (action === "payOrder") {
      payload = sanitizePayOrder(rawPayload) as unknown as Record<string, unknown>;
    } else if (action === "saveSettings") {
      payload = sanitizeSaveSettings(rawPayload) as unknown as Record<string, unknown>;
    } else if (action === "deleteData") {
      payload = sanitizeDeleteData(rawPayload) as unknown as Record<string, unknown>;
    } else {
      payload = rawPayload;
    }

    const data = await callGas(action, payload);
    return NextResponse.json(data, {status: action === "createOrder" ? 201 : 200, headers: noStore});
  } catch (e) {
    const {body, status} = errorResponse(e);
    return NextResponse.json(body, {status, headers: noStore});
  }
}

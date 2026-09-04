import {NextResponse} from "next/server";
import {
  assertActionAllowed,
  callGas,
  clientKey,
  errorResponse,
  HttpError,
  rateLimit,
  sanitizeCreateOrder,
  sanitizeStatusUpdate
} from "@/lib/gas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = {"Cache-Control": "no-store, max-age=0"};

/**
 * Proxy generik ke Google Apps Script.
 * Hanya action yang ada di allowlist yang diteruskan, dan action admin
 * membutuhkan header x-admin-token (lihat lib/gas.ts).
 */
export async function POST(req: Request) {
  try {
    if (!rateLimit(clientKey(req, "gas"), 60, 60_000)) throw new HttpError("Terlalu banyak permintaan", 429);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      throw new HttpError("Body harus berupa JSON yang valid", 400);
    }

    const raw = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const action = String(raw.action || "");
    assertActionAllowed(action, req);

    const rawPayload = (raw.payload && typeof raw.payload === "object" ? raw.payload : {}) as Record<string, unknown>;
    const payload =
      action === "createOrder"
        ? (sanitizeCreateOrder(rawPayload) as unknown as Record<string, unknown>)
        : action === "updateOrderStatus"
          ? (sanitizeStatusUpdate(rawPayload) as unknown as Record<string, unknown>)
          : rawPayload;

    const data = await callGas(action, payload);
    return NextResponse.json(data, {status: action === "createOrder" ? 201 : 200, headers: noStore});
  } catch (e) {
    const {body, status} = errorResponse(e);
    return NextResponse.json(body, {status, headers: noStore});
  }
}

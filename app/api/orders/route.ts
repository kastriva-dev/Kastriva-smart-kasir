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
  sanitizeStatusUpdate
} from "@/lib/gas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = {"Cache-Control": "no-store, max-age=0"};

export async function GET(req: Request) {
  try {
    if (!rateLimit(clientKey(req, "orders:get"), 120, 60_000)) throw new HttpError("Terlalu banyak permintaan", 429);
    const params = new URL(req.url).searchParams;
    const action = params.get("action") || "getOrders";
    const access = await assertActionAllowed(action, req);

    const payload: Record<string, unknown> = {};
    const requestedStore = (params.get("storeId") || "").trim().slice(0, 64);
    if (requestedStore) payload.storeId = requestedStore;
    if (action === "getOrder") {
      const id = (params.get("id") || "").trim();
      if (!id) throw new HttpError("Parameter id wajib diisi", 400);
      payload.id = id;
    } else if (action === "getOrders") {
      const status = (params.get("status") || "").trim();
      const limit = Number(params.get("limit"));
      if (status) payload.status = status;
      if (Number.isFinite(limit) && limit > 0) payload.limit = Math.min(Math.floor(limit), 1000);
    }

    const data = await callGas(action, attachActor(payload, access));
    return NextResponse.json(data, {headers: noStore});
  } catch (e) {
    const {body, status} = errorResponse(e);
    return NextResponse.json(body, {status, headers: noStore});
  }
}

export async function POST(req: Request) {
  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      throw new HttpError("Body harus berupa JSON yang valid", 400);
    }
    const raw = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const action = String(raw.action || "createOrder");
    const access = await assertActionAllowed(action, req);

    if (action === "createOrder") {
      // Batas kasar dulu untuk menahan flood request, dihitung sebelum validasi.
      if (!rateLimit(clientKey(req, "orders:req"), 120, 60_000)) {
        throw new HttpError("Terlalu banyak permintaan", 429);
      }
      const payload = sanitizeCreateOrder(raw.payload ?? raw, {admin: canUseDiscount(access.role)});
      const posRoles = ["admin", "manager", "cashier", "waiter"];
      if (!access.authenticated || !posRoles.includes(String(access.role))) payload.channel = "QR";
      // Batas kedua hanya untuk pesanan yang benar-benar diteruskan ke Apps Script,
      // supaya salah input tidak menghabiskan kuota pelanggan (WiFi restoran = satu IP).
      if (!rateLimit(clientKey(req, "orders:create"), 30, 60_000)) {
        throw new HttpError("Terlalu banyak pesanan dari jaringan ini, coba lagi sebentar", 429);
      }
      const gasPayload = payload as unknown as Record<string, unknown>;
      gasPayload._admin = canUseDiscount(access.role);
      const data = await callGas("createOrder", attachActor(gasPayload, access));
      return NextResponse.json(data, {status: 201, headers: noStore});
    }

    if (action === "updateOrderStatus") {
      const payload = sanitizeStatusUpdate(raw.payload ?? raw);
      assertStatusAllowedForRole(access.role, payload.status);
      const data = await callGas("updateOrderStatus", attachActor(payload, access));
      return NextResponse.json(data, {headers: noStore});
    }

    throw new HttpError("Gunakan /api/gas untuk action ini", 400);
  } catch (e) {
    const {body, status} = errorResponse(e);
    return NextResponse.json(body, {status, headers: noStore});
  }
}

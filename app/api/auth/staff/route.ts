import {NextResponse} from "next/server";
import {callGas, clientKey, errorResponse, HttpError, rateLimit} from "@/lib/gas";
import {
  getAuthSecret,
  isAuthConfigured,
  isSameOrigin,
  safeNextPath,
  sessionCookieOptions,
  signSession,
  type SessionRole
} from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = {"Cache-Control": "no-store, max-age=0"};

type LoginStaff = {id: string; name: string; role: string; storeId?: string; storeName?: string};
type VerifiedStaff = {id: string; storeId?: string; name: string; role: SessionRole};

/** Daftar staff aktif yang memiliki PIN. Tidak pernah mengirim hash PIN. */
export async function GET(req: Request) {
  try {
    if (!isSameOrigin(req)) throw new HttpError("Permintaan lintas situs ditolak", 403);
    if (!rateLimit(clientKey(req, "staff-list"), 30, 60_000)) throw new HttpError("Terlalu banyak permintaan", 429);
    const response = await callGas<LoginStaff[]>("listStaffForLogin", {});
    return NextResponse.json({ok: true, data: response.data || []}, {headers: noStore});
  } catch (e) {
    const {body, status} = errorResponse(e);
    return NextResponse.json(body, {status, headers: noStore});
  }
}

/** Login operasional memakai staff + PIN. Cookie admin lama diganti session staff. */
export async function POST(req: Request) {
  try {
    if (!isSameOrigin(req)) throw new HttpError("Permintaan lintas situs ditolak", 403);
    if (!isAuthConfigured()) throw new HttpError("Login belum dikonfigurasi", 503);
    if (!rateLimit(clientKey(req, "staff-login"), 12, 15 * 60_000)) {
      throw new HttpError("Terlalu banyak percobaan PIN, coba lagi beberapa menit", 429);
    }

    let body: unknown;
    try { body = await req.json(); } catch { throw new HttpError("Body harus berupa JSON yang valid", 400); }
    const raw = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const staffId = String(raw.staffId || "").trim().slice(0, 64);
    const pin = String(raw.pin || "").replace(/\D/g, "").slice(0, 8);
    if (!staffId || pin.length < 4) throw new HttpError("Pilih staff dan masukkan PIN 4-8 digit", 400);

    let verified: VerifiedStaff;
    try {
      const result = await callGas<VerifiedStaff>("verifyStaffPin", {staffId, pin});
      if (!result.data) throw new Error("Invalid");
      verified = result.data;
    } catch (e) {
      if (e instanceof HttpError && e.status >= 500) throw e;
      throw new HttpError("Staff atau PIN salah", 401);
    }

    const role = normalizeRole(verified.role);
    const token = await signSession(
      {sub: verified.id, role, name: verified.name, storeId: verified.storeId || ""},
      getAuthSecret()
    );
    const redirectTo = safeNextPath(typeof raw.next === "string" ? raw.next : null, "/");
    const res = NextResponse.json({ok: true, data: {name: verified.name, role, redirectTo}}, {headers: noStore});
    res.cookies.set({...sessionCookieOptions(req), value: token});
    return res;
  } catch (e) {
    const {body, status} = errorResponse(e);
    return NextResponse.json(body, {status, headers: noStore});
  }
}

function normalizeRole(value: unknown): SessionRole {
  const role = String(value || "").toLowerCase();
  if (["manager", "cashier", "kitchen", "waiter", "barista", "staff"].includes(role)) return role as SessionRole;
  return "staff";
}

import {NextResponse} from "next/server";
import {
  clientKey,
  errorResponse,
  HttpError,
  rateLimit
} from "@/lib/gas";
import {verifyPassword, safeCompare} from "@/lib/password";
import {
  getAuthSecret,
  isAuthConfigured,
  isSameOrigin,
  safeNextPath,
  sessionCookieOptions,
  signSession
} from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = {"Cache-Control": "no-store, max-age=0"};

/** Jeda tetap agar respons gagal tidak lebih cepat daripada respons sukses. */
const MIN_RESPONSE_MS = 400;

export async function POST(req: Request) {
  const started = Date.now();
  try {
    if (!isSameOrigin(req)) throw new HttpError("Permintaan lintas situs ditolak", 403);

    if (!isAuthConfigured()) {
      throw new HttpError(
        "Login belum dikonfigurasi. Set AUTH_SECRET dan ADMIN_PASSWORD_HASH di environment server.",
        503
      );
    }

    // Batas percobaan per IP: menahan brute force tanpa mengunci akun.
    if (!rateLimit(clientKey(req, "login"), 10, 15 * 60_000)) {
      throw new HttpError("Terlalu banyak percobaan login, coba lagi dalam beberapa menit", 429);
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      throw new HttpError("Body harus berupa JSON yang valid", 400);
    }

    const raw = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const username = String(raw.username ?? "").trim().slice(0, 64);
    const password = String(raw.password ?? "").slice(0, 256);
    if (!username || !password) throw new HttpError("Username dan password wajib diisi", 400);

    const expectedUser = (process.env.ADMIN_USERNAME || "admin").trim();
    const storedHash = (process.env.ADMIN_PASSWORD_HASH || "").trim();

    // Password selalu diverifikasi walaupun username salah, supaya durasi respons seragam.
    const userOk = safeCompare(username.toLowerCase(), expectedUser.toLowerCase());
    const passOk = await verifyPassword(password, storedHash);

    if (!userOk || !passOk) {
      await settle(started);
      return NextResponse.json({ok: false, error: "Username atau password salah"}, {status: 401, headers: noStore});
    }

    const token = await signSession({sub: expectedUser, role: "admin"}, getAuthSecret());
    const redirectTo = safeNextPath(typeof raw.next === "string" ? raw.next : null, "/");

    const res = NextResponse.json({ok: true, data: {username: expectedUser, redirectTo}}, {headers: noStore});
    res.cookies.set({...sessionCookieOptions(req), value: token});
    await settle(started);
    return res;
  } catch (e) {
    const {body, status} = errorResponse(e);
    await settle(started);
    return NextResponse.json(body, {status, headers: noStore});
  }
}

async function settle(started: number) {
  const elapsed = Date.now() - started;
  if (elapsed < MIN_RESPONSE_MS) {
    await new Promise(resolve => setTimeout(resolve, MIN_RESPONSE_MS - elapsed));
  }
}

import {NextResponse, type NextRequest} from "next/server";
import {isAuthConfigured, SESSION_COOKIE, verifySession} from "@/lib/session";

/**
 * Penjaga akses untuk halaman internal (dashboard admin dan /kasir).
 *
 * Middleware berjalan di Edge runtime, jadi verifikasi session memakai Web Crypto
 * (lib/session.ts) dan tidak menyentuh node:crypto.
 *
 * Sikapnya fail-closed: bila AUTH_SECRET atau ADMIN_PASSWORD_HASH belum diisi,
 * halaman internal tidak dibuka begitu saja melainkan diarahkan ke /login yang
 * menjelaskan cara konfigurasinya.
 */
export async function middleware(req: NextRequest) {
  const {pathname, search} = req.nextUrl;

  if (!isAuthConfigured()) {
    return redirectToLogin(req, "setup");
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);

  if (!session) {
    const res = redirectToLogin(req, "auth", `${pathname}${search}`);
    // Buang cookie kedaluwarsa/rusak supaya tidak terus dikirim ulang.
    if (token) res.cookies.delete(SESSION_COOKIE);
    return res;
  }

  const res = NextResponse.next();
  // Halaman internal tidak boleh tersimpan di cache bersama maupun riwayat browser.
  res.headers.set("Cache-Control", "no-store, max-age=0, must-revalidate");
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
}

function redirectToLogin(req: NextRequest, reason: "auth" | "setup", next?: string) {
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  if (reason === "setup") url.searchParams.set("setup", "1");
  if (next && next !== "/") url.searchParams.set("next", next);
  return NextResponse.redirect(url);
}

export const config = {
  // Hanya halaman internal. Rute publik (/customer/**, /offline, /api/**, aset) tidak lewat sini.
  matcher: ["/", "/kasir", "/kasir/:path*"]
};

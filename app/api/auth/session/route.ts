import {NextResponse} from "next/server";
import {isAuthConfigured, SESSION_COOKIE, verifySession} from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Status session untuk kebutuhan UI (siapa yang login, kapan berakhir). */
export async function GET(req: Request) {
  const cookie = req.headers.get("cookie") || "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]*)`));
  const session = await verifySession(match ? decodeURIComponent(match[1]) : null);

  return NextResponse.json(
    {
      ok: true,
      data: {
        configured: isAuthConfigured(),
        authenticated: Boolean(session),
        username: session?.sub ?? null,
        role: session?.role ?? null,
        expiresAt: session ? new Date(session.exp * 1000).toISOString() : null
      }
    },
    {headers: {"Cache-Control": "no-store, max-age=0"}}
  );
}

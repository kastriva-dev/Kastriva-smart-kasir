import {NextResponse} from "next/server";
import {errorResponse, HttpError} from "@/lib/gas";
import {isSameOrigin, SESSION_COOKIE, sessionCookieOptions} from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = {"Cache-Control": "no-store, max-age=0"};

/** Logout: hapus cookie session. POST agar tidak bisa dipicu lewat <img> atau prefetch. */
export async function POST(req: Request) {
  try {
    if (!isSameOrigin(req)) throw new HttpError("Permintaan lintas situs ditolak", 403);
    const res = NextResponse.json({ok: true}, {headers: noStore});
    res.cookies.set({...sessionCookieOptions(req, 0), name: SESSION_COOKIE, value: "", maxAge: 0});
    return res;
  } catch (e) {
    const {body, status} = errorResponse(e);
    return NextResponse.json(body, {status, headers: noStore});
  }
}

import {NextResponse} from "next/server";
import {attachActor, callGas, errorResponse, getAccessContext, HttpError} from "@/lib/gas";
import {getAuthSecret, sessionCookieOptions, signSession} from "@/lib/session";

type Store = {id: string; name: string; active?: boolean};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const access = await getAccessContext(req);
    if (!access.authenticated || access.role !== "admin") throw new HttpError("Hanya Owner/Admin yang dapat memilih outlet", 403);
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const storeId = String(body.storeId || "").trim().slice(0, 64);
    if (!storeId) throw new HttpError("Outlet wajib dipilih", 400);
    const result = await callGas<Store[]>("getStores", attachActor({}, access));
    const store = (result.data || []).find(item => String(item.id) === storeId && item.active !== false);
    if (!store) throw new HttpError("Outlet tidak ditemukan atau nonaktif", 404);
    const token = await signSession({sub: access.actorId, role: "admin", name: access.actorName, storeId}, getAuthSecret());
    const res = NextResponse.json({ok: true, data: {storeId, name: store.name}});
    res.cookies.set({...sessionCookieOptions(req), value: token});
    return res;
  } catch (e) {
    const {body, status} = errorResponse(e);
    return NextResponse.json(body, {status});
  }
}

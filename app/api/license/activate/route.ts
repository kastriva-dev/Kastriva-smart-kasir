import {NextResponse} from "next/server";
import {attachActor, callGas, errorResponse, getAccessContext, HttpError} from "@/lib/gas";
import {verifyLicenseCode} from "@/lib/license";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const access = await getAccessContext(req);
    if (!access.authenticated || access.role !== "admin") throw new HttpError("Hanya Owner/Admin yang dapat mengaktifkan lisensi", 403);
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const code = String(body.code || "").trim().slice(0, 4096);
    if (!code) throw new HttpError("Kode lisensi wajib diisi", 400);
    let license;
    try { license = verifyLicenseCode(code); } catch (e) { throw new HttpError(e instanceof Error ? e.message : "Lisensi tidak valid", 400); }
    const result = await callGas("applySubscription", attachActor({...license, _licenseVerified: true}, access));
    return NextResponse.json(result);
  } catch (e) {
    const {body, status} = errorResponse(e);
    return NextResponse.json(body, {status});
  }
}

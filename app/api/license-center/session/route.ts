import {NextResponse} from "next/server";
import {hasLicenseCenterAccess, isLicenseCenterConfigured} from "@/lib/license-center";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return NextResponse.json({ok:true,data:{configured:isLicenseCenterConfigured(),authenticated:hasLicenseCenterAccess(req)}},{headers:{"Cache-Control":"no-store, max-age=0"}});
}

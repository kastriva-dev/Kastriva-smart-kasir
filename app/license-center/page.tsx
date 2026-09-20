import type {Metadata} from "next";
import LicenseCenter from "@/components/LicenseCenter";

export const metadata: Metadata = {
  title: "Kastriva License Center",
  robots: {index:false,follow:false}
};
export const dynamic = "force-dynamic";

export default function LicenseCenterPage(){
  return <LicenseCenter/>;
}

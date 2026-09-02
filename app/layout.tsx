import "./globals.css";
import type {Metadata, Viewport} from "next";
import PwaRegister from "@/components/PwaRegister";
export const metadata:Metadata={title:"Kastriva Smart Kasir",description:"Enterprise restaurant POS, QR ordering and PWA",icons:{icon:"/icons/favicon-32x32.png",apple:"/icons/apple-touch-icon.png"}};
export const viewport:Viewport={themeColor:"#06111f",width:"device-width",initialScale:1};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="id"><body><PwaRegister/>{children}</body></html>}
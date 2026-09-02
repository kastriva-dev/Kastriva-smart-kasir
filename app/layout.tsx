import "./globals.css";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "POS Kasir QR", description: "POS kasir dengan pemesanan QR dan WhatsApp" };
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="id"><body>{children}</body></html>}
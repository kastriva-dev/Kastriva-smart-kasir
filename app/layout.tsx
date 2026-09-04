import "./globals.css";
import type {Metadata, Viewport} from "next";
import PwaRegister from "@/components/PwaRegister";
import {STORE_NAME} from "@/lib/data";

export const metadata: Metadata = {
  title: {default: STORE_NAME, template: `%s • ${STORE_NAME}`},
  description: "Enterprise restaurant POS, QR ordering dan PWA",
  applicationName: STORE_NAME,
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      {url: "/icons/favicon-16x16.png", sizes: "16x16", type: "image/png"},
      {url: "/icons/favicon-32x32.png", sizes: "32x32", type: "image/png"}
    ],
    apple: "/icons/apple-touch-icon.png"
  }
};

export const viewport: Viewport = {
  themeColor: "#06111f",
  width: "device-width",
  initialScale: 1
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="id">
      <body>
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}

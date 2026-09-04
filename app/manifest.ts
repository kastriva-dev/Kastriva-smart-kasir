import type {MetadataRoute} from "next";
import {STORE_NAME} from "@/lib/data";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: STORE_NAME,
    short_name: "Kastriva",
    description: "Enterprise Restaurant POS & QR Ordering",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#06111f",
    theme_color: "#06111f",
    icons: [
      {src: "/icons/android-chrome-192x192.png", sizes: "192x192", type: "image/png", purpose: "any"},
      {src: "/icons/android-chrome-512x512.png", sizes: "512x512", type: "image/png", purpose: "any"},
      {src: "/icons/android-chrome-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable"}
    ]
  };
}

import type {MetadataRoute} from "next";
import {STORE_NAME} from "@/lib/data";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/?source=pwa",
    name: STORE_NAME,
    short_name: "Kastriva",
    description: "Enterprise Restaurant POS & QR Ordering",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "any",
    lang: "id",
    dir: "ltr",
    categories: ["food", "business", "productivity"],
    background_color: "#06111f",
    theme_color: "#06111f",
    icons: [
      {src: "/icons/android-chrome-192x192.png", sizes: "192x192", type: "image/png", purpose: "any"},
      {src: "/icons/android-chrome-512x512.png", sizes: "512x512", type: "image/png", purpose: "any"},
      {src: "/icons/android-chrome-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable"}
    ],
    shortcuts: [
      {name: "Kasir POS", url: "/?page=POS", icons: [{src: "/icons/android-chrome-192x192.png", sizes: "192x192"}]},
      {name: "Pesanan", url: "/?page=Pesanan", icons: [{src: "/icons/android-chrome-192x192.png", sizes: "192x192"}]}
    ]
  };
}

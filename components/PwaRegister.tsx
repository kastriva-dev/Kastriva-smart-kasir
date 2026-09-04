"use client";
import {useEffect} from "react";

export default function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    // Registrasi ditunda sampai load agar tidak berebut bandwidth dengan render awal.
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* PWA opsional: kegagalan registrasi tidak boleh mengganggu aplikasi */
      });
    };
    if (document.readyState === "complete") {
      register();
      return;
    }
    window.addEventListener("load", register, {once: true});
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}

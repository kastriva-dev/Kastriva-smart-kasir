"use client";
import {useEffect, useState} from "react";
import {Download, X} from "lucide-react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{outcome: "accepted" | "dismissed"}>;
};

const DISMISS_KEY = "kastriva:installDismissed";

/** Kartu "Install app" saat browser menawarkan instalasi PWA. */
export default function PwaInstall() {
  const [evt, setEvt] = useState<InstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as {standalone?: boolean}).standalone === true;
    if (standalone) return;
    if (window.localStorage.getItem(DISMISS_KEY)) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvt(e as InstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (!visible || !evt) return null;

  const dismiss = () => {
    setVisible(false);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* abaikan */
    }
  };

  const install = async () => {
    try {
      await evt.prompt();
      await evt.userChoice;
    } catch {
      /* pilihan user tidak mengubah aplikasi */
    }
    dismiss();
  };

  return (
    <div className="installCard glass" role="dialog" aria-label="Pasang aplikasi">
      <div>
        <b>Pasang Kastriva POS</b>
        <p className="muted">Buka layar penuh &amp; tetap jalan saat offline.</p>
      </div>
      <div className="btnRow">
        <button type="button" className="btn primary" onClick={install}>
          <Download size={15} aria-hidden="true" /> Pasang
        </button>
        <button type="button" className="iconBtn" aria-label="Tutup" onClick={dismiss}>
          <X size={15} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

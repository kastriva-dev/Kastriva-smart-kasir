import type {Metadata} from "next";
import {Suspense} from "react";
import LoginForm from "@/components/LoginForm";
import {isAuthConfigured} from "@/lib/session";
import {STORE_NAME} from "@/lib/data";

export const metadata: Metadata = {
  title: "Masuk",
  robots: {index: false, follow: false}
};

export const dynamic = "force-dynamic";

export default function LoginPage() {
  // Status konfigurasi dibaca di server; nilai env tidak pernah dikirim ke client.
  const configured = isAuthConfigured();

  return (
    <main className="hero">
      <div className="loginWrap">
        <div className="card glass">
          <h1 style={{marginBottom: 6}}>{STORE_NAME}</h1>
          <p className="muted" style={{marginTop: 0}}>
            Masuk untuk mengakses dashboard kasir.
          </p>

          {configured ? (
            <Suspense fallback={<p className="muted">Menyiapkan formulir...</p>}>
              <LoginForm />
            </Suspense>
          ) : (
            <div className="alert error" role="alert">
              <b>Login belum dikonfigurasi.</b>
              <p style={{margin: "8px 0 0"}}>
                Set <code>AUTH_SECRET</code> dan <code>ADMIN_PASSWORD_HASH</code> pada environment server,
                lalu restart aplikasi. Hash dibuat dengan:
              </p>
              <pre className="codeBlock">npm run auth:hash -- &apos;password-anda&apos;</pre>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

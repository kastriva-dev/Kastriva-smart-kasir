"use client";
import {useState} from "react";
import {useRouter, useSearchParams} from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const nextPath = params.get("next") || "/";
  const sessionExpired = params.get("next") !== null;

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({username, password, next: nextPath})
      });
      const data: {ok?: boolean; error?: string; data?: {redirectTo?: string}} = await res
        .json()
        .catch(() => ({}));

      if (!res.ok || !data.ok) {
        setError(data.error || "Login gagal");
        setPassword("");
        return;
      }

      // refresh() memaksa server component dirender ulang dengan cookie yang baru.
      router.replace(data.data?.redirectTo || "/");
      router.refresh();
    } catch {
      setError("Tidak dapat menghubungi server");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="loginForm">
      {sessionExpired ? (
        <p className="alert ok" role="status">
          Silakan masuk untuk melanjutkan.
        </p>
      ) : null}

      <label className="label">
        Username
        <input
          className="input"
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          maxLength={64}
          value={username}
          onChange={e => setUsername(e.target.value)}
        />
      </label>

      <label className="label" style={{marginTop: 12}}>
        Password
        <input
          className="input"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={256}
          value={password}
          onChange={e => setPassword(e.target.value)}
        />
      </label>

      {error ? (
        <p className="alert error" role="alert">
          {error}
        </p>
      ) : null}

      <button type="submit" className="btn primary fullWidth" style={{marginTop: 16}} disabled={busy}>
        {busy ? "Memeriksa..." : "Masuk"}
      </button>
    </form>
  );
}

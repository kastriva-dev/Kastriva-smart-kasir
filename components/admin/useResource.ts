"use client";
import {useCallback, useEffect, useRef, useState} from "react";
import {ApiError} from "@/lib/api";

export type ResourceState<T> = {
  data: T | null;
  loading: boolean;
  error: string;
  /** true saat backend belum dikonfigurasi (HTTP 503) — tampilkan panduan setup */
  setup: boolean;
  reload: () => void;
};

/**
 * Fetch data + polling periodik + reload saat tab kembali aktif.
 * intervalMs = 0 berarti sekali ambil saja.
 */
export function useResource<T>(fetcher: () => Promise<T>, intervalMs = 0): ResourceState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [setup, setSetup] = useState(false);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const aliveRef = useRef(true);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const result = await fetcherRef.current();
      if (!aliveRef.current) return;
      setData(result);
      setError("");
      setSetup(false);
    } catch (e) {
      if (!aliveRef.current) return;
      const status = e instanceof ApiError ? e.status : 0;
      const message = e instanceof Error ? e.message : "Gagal memuat data";
      setError(message);
      setSetup(status === 503);
      if (status === 503) setData(null);
    } finally {
      inFlight.current = false;
      if (aliveRef.current) setLoading(false);
    }
  }, []);

  const reload = useCallback(() => {
    void load();
  }, [load]);

  useEffect(() => {
    aliveRef.current = true;
    void load();

    let timer: ReturnType<typeof setInterval> | null = null;
    if (intervalMs > 0) {
      timer = setInterval(() => {
        if (document.visibilityState === "visible") void load();
      }, intervalMs);
    }

    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      aliveRef.current = false;
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs]);

  return {data, loading, error, setup, reload};
}

/** Indikator koneksi online/offline untuk banner kasir. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}

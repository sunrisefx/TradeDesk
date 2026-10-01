"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/client/api";

function UnlockForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api.unlock(code);
      const next = params.get("next");
      router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="w-full max-w-xs space-y-4">
      <input
        autoFocus
        type="password"
        inputMode="numeric"
        autoComplete="current-password"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="Passcode"
        className="h-14 w-full rounded-2xl bg-raised px-4 text-center text-2xl tracking-[0.4em] outline-none placeholder:text-base placeholder:tracking-normal placeholder:text-mute"
      />
      {err && <p className="text-center text-sm text-bad">{err}</p>}
      <button disabled={busy || !code} className="press h-14 w-full rounded-2xl bg-gold text-lg font-extrabold text-ink disabled:opacity-40">
        {busy ? "Checking…" : "Unlock"}
      </button>
    </form>
  );
}

export function UnlockView() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 px-6 pt-safe pb-safe">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/icon-192.png" alt="" width={84} height={84} className="rounded-[22px]" />
      <div className="text-center">
        <h1 className="text-2xl font-extrabold">TradeDesk</h1>
        <p className="text-sm text-mute">Enter your passcode</p>
      </div>
      <Suspense>
        <UnlockForm />
      </Suspense>
    </div>
  );
}

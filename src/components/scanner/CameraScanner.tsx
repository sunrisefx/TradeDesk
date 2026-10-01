"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { api, type ScanResponse } from "@/lib/client/api";
import { captureBestFrame, fileToJpeg, haptic, setTorch, stripDataUrl, supportsTorch } from "@/lib/client/image";
import { useMoney } from "@/hooks/useMoney";
import { CONDITIONS, LANGUAGES, VARIANTS, priceKey, type AggregatedPrice, type CardLanguage, type CardRef, type CatalogMatch, type Condition, type GradeInfo } from "@/lib/types";
import { CardThumb, Chip, LangBadge } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { CardSearchSheet, type PickedCard } from "@/components/search/CardSearchSheet";

// ════════════════════════════════════════════════════════════════════════════
// Full-screen rear-camera scanner.
//   live → (tap shutter) burst capture → /api/scan → result sheet → confirm
// Built for: binder pockets, penny sleeves, top-loaders, slabs, dim halls.
// ════════════════════════════════════════════════════════════════════════════

export interface ScanConfirm {
  card: CardRef;
  price: AggregatedPrice | null;
  grade: GradeInfo | null;
  condition: Condition;
  source: "scan" | "search";
}

export interface ScanAction {
  label: string;
  tone?: "give" | "get" | "gold" | "plain";
  onClick: (r: ScanConfirm) => void | Promise<void>;
}

type Phase = "starting" | "live" | "capturing" | "identifying" | "result" | "error" | "denied";

const ACCENT = { give: "text-give", get: "text-get", gold: "text-gold", plain: "text-white" } as const;
const BTN = {
  give: "bg-give text-ink",
  get: "bg-get text-ink",
  gold: "bg-gold text-ink",
  plain: "bg-raised text-white border border-line",
} as const;

export function CameraScanner({
  open,
  onClose,
  title = "Scan card",
  accent = "gold",
  actions,
  continuous = false,
  footerNote,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  accent?: keyof typeof ACCENT;
  actions: ScanAction[];
  /** Return to the live camera after an action (rapid-fire scanning a stack). */
  continuous?: boolean;
  footerNote?: ReactNode;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const guideRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [phase, setPhase] = useState<Phase>("starting");
  const [error, setError] = useState<string | null>(null);
  const [torchOk, setTorchOk] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [hint, setHint] = useState<CardLanguage | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [scan, setScan] = useState<ScanResponse | null>(null);
  const [selected, setSelected] = useState<CatalogMatch | null>(null);
  const [card, setCard] = useState<CardRef | null>(null);
  const [price, setPrice] = useState<AggregatedPrice | null>(null);
  const [pricing, setPricing] = useState(false);
  const [condition, setCondition] = useState<Condition>("NM");
  const [count, setCount] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const money = useMoney();

  // ── camera lifecycle ─────────────────────────────────────────────────────
  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setTorchOn(false);
  }, []);

  const start = useCallback(async () => {
    stop();
    setPhase("starting");
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera not available in this browser. Use the photo button or search instead.");
      setPhase("error");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          // High resolution matters for tiny set codes / collector numbers.
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });
      streamRef.current = stream;
      const v = videoRef.current;
      if (v) {
        v.srcObject = stream;
        await v.play().catch(() => {});
      }
      setTorchOk(supportsTorch(stream.getVideoTracks()[0]));
      setPhase("live");
    } catch (e) {
      const name = (e as DOMException).name;
      setError(
        name === "NotAllowedError"
          ? "Camera access is blocked. On iPhone: Settings → Safari → Camera → Allow (or long-press the app icon → Website Settings)."
          : "Couldn't start the camera. Use the photo button or search instead.",
      );
      setPhase(name === "NotAllowedError" ? "denied" : "error");
    }
  }, [stop]);

  useEffect(() => {
    if (!open) return;
    void start();
    // iOS suspends the camera when the PWA is backgrounded — restart on return.
    const onVis = () => {
      if (document.visibilityState === "visible" && !streamRef.current?.active) void start();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      abortRef.current?.abort();
      stop();
    };
  }, [open, start, stop]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setScan(null);
    setSelected(null);
    setCard(null);
    setPrice(null);
    setPreview(null);
    setCondition("NM");
    setError(null);
    if (streamRef.current?.active) setPhase("live");
    else void start();
  }, [start]);

  // ── scanning ─────────────────────────────────────────────────────────────
  const identify = useCallback(
    async (dataUrl: string) => {
      setPreview(dataUrl);
      setPhase("identifying");
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      try {
        const res = await api.scan(stripDataUrl(dataUrl), hint, ac.signal);
        if (ac.signal.aborted) return;
        setScan(res);
        const top = res.matches[0] ?? null;
        setSelected(top);
        setCard(top?.card ?? null);
        setPrice(res.price);
        setPhase("result");
        haptic(20);
        if (!top) setError("Couldn't read this card. Try again with less glare, or search by name.");
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setError((e as Error).message || "Scan failed");
        setPhase("result");
      }
    },
    [hint],
  );

  const shoot = useCallback(async () => {
    const v = videoRef.current;
    const g = guideRef.current;
    if (!v || !g || phase !== "live" || !v.videoWidth) return;
    haptic();
    setPhase("capturing");
    const { dataUrl } = await captureBestFrame(v, g);
    await identify(dataUrl);
  }, [phase, identify]);

  const onFile = useCallback(
    async (f: File | undefined) => {
      if (!f) return;
      const dataUrl = await fileToJpeg(f);
      await identify(dataUrl);
    },
    [identify],
  );

  // Re-price when the user corrects the variant or picks an alternative match.
  const reprice = useCallback(async (c: CardRef, grade: GradeInfo | null) => {
    setPricing(true);
    try {
      const { prices } = await api.prices([{ card: c, grade }]);
      setPrice(prices[priceKey(c, grade)] ?? null);
    } catch {
      setPrice(null);
    } finally {
      setPricing(false);
    }
  }, []);

  const grade = scan?.grade ?? null;

  const chooseMatch = (m: CatalogMatch) => {
    const c = { ...m.card, variant: card?.variant ?? m.card.variant };
    setSelected(m);
    setCard(c);
    void reprice(c, grade);
  };

  const chooseVariant = (variant: CardRef["variant"]) => {
    if (!card) return;
    const c = { ...card, variant };
    setCard(c);
    void reprice(c, grade);
  };

  const runAction = async (a: ScanAction) => {
    if (!card) return;
    await a.onClick({ card, price, grade, condition, source: "scan" });
    setCount((n) => n + 1);
    if (continuous) reset();
    else onClose();
  };

  const toggleTorch = async () => {
    const t = streamRef.current?.getVideoTracks()[0];
    if (!t) return;
    if (await setTorch(t, !torchOn)) setTorchOn(!torchOn);
  };

  if (!open) return null;

  const busy = phase === "capturing" || phase === "identifying";
  const id = scan?.identity;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black text-white">
      {/* ── camera ── */}
      <video ref={videoRef} playsInline muted autoPlay className="absolute inset-0 h-full w-full object-cover" />
      {preview && phase !== "live" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="" className="absolute inset-0 h-full w-full bg-black object-contain opacity-60" />
      )}

      {/* ── guide overlay: darkened surround with a card-shaped window ── */}
      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        <div
          ref={guideRef}
          className="relative aspect-[63/88] w-[min(72vw,330px)] rounded-[18px] shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]"
          style={{ ["--scan-h" as string]: "min(100vw, 460px)" }}
        >
          {[
            "top-0 left-0 border-t-4 border-l-4 rounded-tl-[18px]",
            "top-0 right-0 border-t-4 border-r-4 rounded-tr-[18px]",
            "bottom-0 left-0 border-b-4 border-l-4 rounded-bl-[18px]",
            "bottom-0 right-0 border-b-4 border-r-4 rounded-br-[18px]",
          ].map((c) => (
            <span key={c} className={`absolute h-8 w-8 border-gold ${c}`} />
          ))}
          {busy && <div className="animate-scanline absolute inset-x-3 top-0 h-0.5 rounded bg-gold shadow-[0_0_12px_2px_rgba(255,203,46,0.8)]" />}
        </div>
      </div>

      {/* ── top bar ── */}
      <div className="relative z-10 pt-safe">
        <div className="flex items-center justify-between px-4 pt-2">
          <button onClick={onClose} className="press grid h-11 w-11 place-items-center rounded-full bg-black/50 backdrop-blur" aria-label="Close scanner">
            <Icon name="x" />
          </button>
          <div className="text-center">
            <div className={`text-base font-bold ${ACCENT[accent]}`}>{title}</div>
            {count > 0 && <div className="text-xs text-soft">{count} added</div>}
          </div>
          <button
            onClick={toggleTorch}
            disabled={!torchOk}
            className={`press grid h-11 w-11 place-items-center rounded-full backdrop-blur ${torchOn ? "bg-gold text-ink" : "bg-black/50"} ${torchOk ? "" : "opacity-30"}`}
            aria-label="Toggle torch"
          >
            <Icon name="flash" />
          </button>
        </div>
        <div className="scrollbar-none mt-3 flex gap-2 overflow-x-auto px-4">
          <Chip active={hint === null} onClick={() => setHint(null)} className="bg-black/50 backdrop-blur">
            Auto
          </Chip>
          {LANGUAGES.map((l) => (
            <Chip key={l.code} active={hint === l.code} onClick={() => setHint(l.code)} className="bg-black/50 backdrop-blur">
              {l.short}
            </Chip>
          ))}
        </div>
      </div>

      <div className="flex-1" />

      {/* ── live controls ── */}
      {phase !== "result" && (
        <div className="relative z-10 pb-safe">
          <p className="mx-auto mb-4 max-w-xs text-center text-sm text-soft">
            {phase === "starting" && "Starting camera…"}
            {phase === "live" && "Fill the frame with the card. Tilt the sleeve slightly to kill glare."}
            {phase === "capturing" && "Hold steady…"}
            {phase === "identifying" && "Identifying card…"}
            {(phase === "error" || phase === "denied") && error}
          </p>
          <div className="flex items-center justify-around px-8 pb-6">
            <button onClick={() => fileRef.current?.click()} className="press grid h-14 w-14 place-items-center rounded-full bg-white/10" aria-label="Choose photo">
              <Icon name="image" />
            </button>
            <button
              onClick={shoot}
              disabled={phase !== "live"}
              aria-label="Capture"
              className="press grid h-20 w-20 place-items-center rounded-full border-4 border-white/90 disabled:opacity-40"
            >
              <span className={`block h-[60px] w-[60px] rounded-full ${busy ? "animate-pulse bg-gold" : "bg-white"}`} />
            </button>
            <button onClick={() => setSearchOpen(true)} className="press grid h-14 w-14 place-items-center rounded-full bg-white/10" aria-label="Search by name">
              <Icon name="search" />
            </button>
          </div>
          {footerNote && <div className="px-6 pb-4 text-center text-xs text-mute">{footerNote}</div>}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              void onFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>
      )}

      {/* ── result sheet ── */}
      {phase === "result" && (
        <div className="animate-sheet relative z-10 max-h-[78dvh] overflow-y-auto rounded-t-3xl border-t border-line bg-panel px-4 pt-4 pb-safe">
          {!card ? (
            <div className="space-y-4 pb-4">
              <p className="text-soft">{error ?? "No card found."}</p>
              <div className="flex gap-2">
                <button onClick={reset} className="press flex-1 rounded-2xl bg-white py-3.5 font-semibold text-ink">
                  Rescan
                </button>
                <button onClick={() => setSearchOpen(true)} className="press flex-1 rounded-2xl border border-line bg-raised py-3.5 font-semibold">
                  Search
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 pb-4">
              <div className="flex gap-3">
                <CardThumb card={card.imageUrl ? card : { ...card, imageUrl: preview }} className="w-24 shrink-0" rounded="rounded-lg" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <LangBadge lang={card.language} />
                    {grade && <span className="rounded bg-gold/20 px-1 text-[10px] font-bold text-gold">{grade.company} {grade.grade}</span>}
                    {selected && <span className="text-[11px] text-mute">{selected.score}% match</span>}
                  </div>
                  <div className="mt-1 text-lg leading-tight font-bold">{card.name}</div>
                  {card.nameEn && card.nameEn !== card.name && <div className="text-sm text-soft">{card.nameEn}</div>}
                  <div className="mt-1 text-sm text-mute">
                    {[card.setName, card.setCode].filter(Boolean).join(" · ")}
                    {card.number && <span className="tabular ml-1 text-soft">#{card.number}</span>}
                  </div>
                  {card.rarity && <div className="text-xs text-mute">{card.rarity}</div>}
                </div>
                <div className="text-right">
                  <div className="tabular text-xl font-bold">{pricing ? "…" : money(price?.usd)}</div>
                  {price && <div className="text-[11px] text-mute">{price.confidence} conf.</div>}
                  {grade && price?.gradedUsd && Object.keys(price.gradedUsd).length > 0 && (
                    <div className="text-[11px] text-gold">graded</div>
                  )}
                </div>
              </div>

              {(id?.notes || (id && id.confidence < 0.6)) && (
                <div className="rounded-xl bg-fair/10 px-3 py-2 text-sm text-fair">{id?.notes ?? "Low confidence — double-check the number."}</div>
              )}
              {selected?.reason && <div className="-mt-2 text-xs text-mute">{selected.reason}</div>}

              <div>
                <div className="mb-1.5 text-xs font-semibold tracking-wide text-mute uppercase">Printing</div>
                <div className="scrollbar-none flex gap-2 overflow-x-auto">
                  {VARIANTS.filter((v) => v.id !== "other").map((v) => (
                    <Chip key={v.id} active={card.variant === v.id} onClick={() => chooseVariant(v.id)}>
                      {v.label}
                    </Chip>
                  ))}
                </div>
              </div>

              {!grade && (
                <div>
                  <div className="mb-1.5 text-xs font-semibold tracking-wide text-mute uppercase">Condition</div>
                  <div className="flex gap-2">
                    {CONDITIONS.map((c) => (
                      <Chip key={c} active={condition === c} onClick={() => setCondition(c)} className="flex-1 px-0">
                        {c}
                      </Chip>
                    ))}
                  </div>
                </div>
              )}

              {scan && scan.matches.length > 1 && (
                <div>
                  <div className="mb-1.5 text-xs font-semibold tracking-wide text-mute uppercase">Not right? Other matches</div>
                  <div className="scrollbar-none flex gap-2 overflow-x-auto pb-1">
                    {scan.matches.map((m) => (
                      <button
                        key={m.card.catalogId ?? m.card.name}
                        onClick={() => chooseMatch(m)}
                        className={`press w-20 shrink-0 rounded-lg p-1 text-left ${selected === m ? "bg-white/15 ring-2 ring-gold" : "bg-raised"}`}
                      >
                        <CardThumb card={m.card} className="w-full" />
                        <div className="mt-1 truncate text-[10px] text-soft">{m.card.setName}</div>
                        <div className="tabular truncate text-[10px] text-mute">{m.card.number}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                {actions.map((a) => (
                  <button
                    key={a.label}
                    onClick={() => void runAction(a)}
                    className={`press rounded-2xl py-3.5 font-bold ${BTN[a.tone ?? "plain"]} ${actions.length === 1 ? "col-span-2" : ""}`}
                  >
                    {a.label}
                  </button>
                ))}
                <button onClick={reset} className="press col-span-2 rounded-2xl py-3 text-sm font-semibold text-soft">
                  Rescan
                </button>
              </div>
              {scan?.timings && <div className="text-center text-[10px] text-mute">{(scan.timings.totalMs / 1000).toFixed(1)}s · {scan.model}</div>}
            </div>
          )}
        </div>
      )}

      <CardSearchSheet
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        title="Find card"
        confirmLabel={actions[0]?.label ?? "Add"}
        onPick={async (p: PickedCard) => {
          setSearchOpen(false);
          // Manual picks go straight to the first action (e.g. "Add to theirs").
          await actions[0]?.onClick({ ...p, grade: null, source: "search" });
          setCount((n) => n + 1);
          if (!continuous) onClose();
        }}
      />
    </div>
  );
}

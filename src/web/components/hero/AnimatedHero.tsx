import { useEffect, useMemo, useRef, useState } from "react";
import { HeroAnimationStyle, HeroConfig } from "@/lib/api";
import { DEFAULT_HERO_CONFIG, getHeroActiveMessages } from "../../../shared/presentation";
import { cn } from "@/lib/utils";

const SCRAMBLE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%@";

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);

  return reduced;
}

function DecryptingTextLine({
  targetText,
  durationMs,
  activeKey,
  reducedMotion,
}: {
  targetText: string;
  durationMs: number;
  activeKey: string;
  reducedMotion: boolean;
}) {
  const [displayed, setDisplayed] = useState<string>(targetText);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (reducedMotion || !targetText) {
      setDisplayed(targetText);
      return;
    }

    const totalMs = Math.max(250, Math.min(2000, durationMs || 650));
    const startedAt = Date.now();
    const len = targetText.length;

    const tick = () => {
      const elapsed = Date.now() - startedAt;
      const progress = Math.min(1, elapsed / totalMs);
      if (progress >= 1) {
        setDisplayed(targetText);
        if (timerRef.current !== null) {
          window.clearInterval(timerRef.current);
          timerRef.current = null;
        }
        return;
      }

      const settledCount = Math.floor(progress * len);
      let next = "";
      for (let i = 0; i < len; i++) {
        const ch = targetText[i];
        if (i < settledCount || ch === " " || ch === "\n") {
          next += ch;
        } else {
          next += SCRAMBLE_ALPHABET[Math.floor(Math.random() * SCRAMBLE_ALPHABET.length)];
        }
      }
      setDisplayed(next);
    };

    tick();
    timerRef.current = window.setInterval(tick, 32);

    return () => {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [targetText, durationMs, activeKey, reducedMotion]);

  return <span>{displayed}</span>;
}

function renderTokenizedText(
  text: string,
  style: HeroAnimationStyle,
  durationMs: number,
  delayMs: number,
  activeKey: string,
  reducedMotion: boolean
) {
  if (reducedMotion) return <span>{text}</span>;

  if (style === "decrypting_text") {
    return (
      <DecryptingTextLine
        targetText={text}
        durationMs={durationMs}
        activeKey={activeKey}
        reducedMotion={reducedMotion}
      />
    );
  }

  if (style === "character_reveal") {
    const chars = Array.from(text);
    const stepDelay = Math.max(8, Math.min(45, Math.round((delayMs || 60) / 3)));
    return (
      <>
        {chars.map((char, idx) => (
          <span
            key={`${activeKey}-c-${idx}`}
            className="animate-hero-token inline-block whitespace-pre"
            style={
              {
                "--hero-duration": `${Math.max(220, durationMs)}ms`,
                animationDelay: `${idx * stepDelay}ms`,
              } as React.CSSProperties
            }
          >
            {char}
          </span>
        ))}
      </>
    );
  }

  if (style === "word_stagger") {
    const words = text.split(" ");
    const stepDelay = Math.max(25, Math.min(200, delayMs || 60));
    return (
      <>
        {words.map((word, idx) => (
          <span
            key={`${activeKey}-w-${idx}`}
            className="animate-hero-token inline-block"
            style={
              {
                "--hero-duration": `${Math.max(260, durationMs)}ms`,
                animationDelay: `${idx * stepDelay}ms`,
              } as React.CSSProperties
            }
          >
            {word}
            {idx < words.length - 1 ? "\u00A0" : ""}
          </span>
        ))}
      </>
    );
  }

  return <span>{text}</span>;
}

export function AnimatedHero({
  config,
  previewIndex,
  replayNonce = 0,
  compact = false,
}: {
  config?: HeroConfig | null;
  previewIndex?: number;
  replayNonce?: number;
  compact?: boolean;
}) {
  const effective = config || DEFAULT_HERO_CONFIG;
  const activeMessages = useMemo(() => getHeroActiveMessages(effective), [effective]);
  const reducedMotion = usePrefersReducedMotion();
  const [autoIdx, setAutoIdx] = useState(0);
  const [tabVisible, setTabVisible] = useState<boolean>(() =>
    typeof document === "undefined" ? true : document.visibilityState === "visible"
  );

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisibility = () => setTabVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    if (
      typeof previewIndex === "number" ||
      !effective.autoRotate ||
      activeMessages.length <= 1 ||
      !tabVisible
    ) {
      return;
    }
    const interval = Math.max(2500, Math.min(20000, effective.intervalMs || 5500));
    const timer = window.setInterval(() => {
      setAutoIdx((curr) => (curr + 1) % activeMessages.length);
    }, interval);
    return () => window.clearInterval(timer);
  }, [previewIndex, effective.autoRotate, effective.intervalMs, activeMessages.length, tabVisible]);

  const safeIdx =
    typeof previewIndex === "number"
      ? Math.max(0, Math.min(previewIndex, activeMessages.length - 1))
      : autoIdx % activeMessages.length;
  const currentMessage = activeMessages[safeIdx] || DEFAULT_HERO_CONFIG.messages[0];
  const animationKey = `${currentMessage.id}-${safeIdx}-${effective.animationStyle}-${replayNonce}`;

  const headingSizeClass = compact
    ? "text-2xl sm:text-3xl"
    : effective.fontSizePreset === "compact"
      ? "text-3xl sm:text-4xl lg:text-5xl"
      : effective.fontSizePreset === "display"
        ? "text-4xl sm:text-6xl lg:text-7xl"
        : "text-4xl sm:text-5xl lg:text-6xl";

  const wrapperAnimationClass = reducedMotion
    ? ""
    : effective.animationStyle === "soft_reveal"
      ? "animate-hero-soft-reveal"
      : effective.animationStyle === "float_down"
        ? "animate-hero-float-down"
        : effective.animationStyle === "fade_slide"
          ? "animate-hero-fade-slide"
          : "";

  const durationMs = effective.durationMs || 650;
  const delayMs = effective.delayMs || 60;
  const subtitle = currentMessage.subtext?.trim() || effective.secondaryDescription;

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "min-h-[120px]" : "min-h-[150px] sm:min-h-[188px]"
      )}
    >
      <div
        key={animationKey}
        className={cn("w-full", wrapperAnimationClass)}
        style={{ "--hero-duration": `${durationMs}ms` } as React.CSSProperties}
      >
        <h1 className={cn("font-extrabold tracking-tight text-white", headingSizeClass)}>
          {renderTokenizedText(
            currentMessage.text,
            effective.animationStyle,
            durationMs,
            delayMs,
            animationKey,
            reducedMotion
          )}
          {currentMessage.highlightText && (
            <>
              {" "}
              <br className="hidden sm:inline" />
              <span className="bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
                {renderTokenizedText(
                  currentMessage.highlightText,
                  effective.animationStyle,
                  durationMs,
                  delayMs,
                  `${animationKey}-hl`,
                  reducedMotion
                )}
              </span>
            </>
          )}
        </h1>

        <p
          className={cn(
            "mx-auto max-w-2xl leading-relaxed text-muted-foreground",
            compact ? "mt-3 text-sm" : "mt-5 text-base sm:text-lg"
          )}
        >
          {subtitle}
        </p>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { HeroAnimationStyle, HeroConfig } from "@/lib/api";
import { DEFAULT_HERO_CONFIG, getHeroActiveMessages } from "../../../shared/presentation";
import { cn } from "@/lib/utils";

const SCRAMBLE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%@";
const HIGHLIGHT_GRADIENT_CLASS =
  "bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent";

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
  isHighlight = false,
}: {
  targetText: string;
  durationMs: number;
  activeKey: string;
  reducedMotion: boolean;
  isHighlight?: boolean;
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

  if (reducedMotion) {
    return (
      <span className={cn("whitespace-pre-line", isHighlight && HIGHLIGHT_GRADIENT_CLASS)}>
        {targetText}
      </span>
    );
  }

  return (
    <span className="relative inline-block max-w-full align-top">
      {/* Invisible settled text reserves final box width and height so scrambling never shifts layout */}
      <span
        aria-hidden="true"
        className="invisible block whitespace-pre-line select-none pointer-events-none"
      >
        {targetText}
      </span>
      <span
        className={cn(
          "absolute inset-0 block whitespace-pre-line text-center",
          isHighlight && HIGHLIGHT_GRADIENT_CLASS
        )}
      >
        {displayed}
      </span>
    </span>
  );
}

function renderTokenizedText(
  text: string,
  style: HeroAnimationStyle,
  durationMs: number,
  delayMs: number,
  activeKey: string,
  reducedMotion: boolean,
  isHighlight = false
) {
  const leafClass = isHighlight ? HIGHLIGHT_GRADIENT_CLASS : undefined;

  if (reducedMotion) {
    return <span className={cn("whitespace-pre-line", leafClass)}>{text}</span>;
  }

  if (style === "decrypting_text") {
    return (
      <DecryptingTextLine
        targetText={text}
        durationMs={durationMs}
        activeKey={activeKey}
        reducedMotion={reducedMotion}
        isHighlight={isHighlight}
      />
    );
  }

  if (style === "character_reveal") {
    const lines = text.split("\n");
    const stepDelay = Math.max(8, Math.min(45, Math.round((delayMs || 60) / 3)));
    let charCounter = 0;

    return (
      <>
        {lines.map((line, lineIdx) => {
          const segments = line.split(/(\s+)/);
          return (
            <span key={`${activeKey}-line-${lineIdx}`}>
              {segments.map((segment, segIdx) => {
                if (!segment) return null;
                if (/^\s+$/.test(segment)) {
                  const spaceIdx = charCounter++;
                  return (
                    <span
                      key={`${activeKey}-sp-${lineIdx}-${segIdx}-${spaceIdx}`}
                      className="whitespace-pre"
                    >
                      {segment}
                    </span>
                  );
                }
                const chars = Array.from(segment);
                return (
                  <span
                    key={`${activeKey}-wd-${lineIdx}-${segIdx}`}
                    className="inline-block whitespace-nowrap"
                  >
                    {chars.map((char, chIdx) => {
                      const globalIdx = charCounter++;
                      return (
                        <span
                          key={`${activeKey}-c-${lineIdx}-${segIdx}-${chIdx}`}
                          className={cn("animate-hero-token inline-block", leafClass)}
                          style={
                            {
                              "--hero-duration": `${Math.max(220, durationMs)}ms`,
                              animationDelay: `${globalIdx * stepDelay}ms`,
                            } as React.CSSProperties
                          }
                        >
                          {char}
                        </span>
                      );
                    })}
                  </span>
                );
              })}
              {lineIdx < lines.length - 1 ? <br /> : null}
            </span>
          );
        })}
      </>
    );
  }

  if (style === "word_stagger") {
    const lines = text.split("\n");
    const stepDelay = Math.max(25, Math.min(200, delayMs || 60));
    let wordCounter = 0;

    return (
      <>
        {lines.map((line, lineIdx) => {
          const words = line.trim().length > 0 ? line.split(" ") : [];
          return (
            <span key={`${activeKey}-wl-${lineIdx}`}>
              {words.map((word, idx) => {
                const globalIdx = wordCounter++;
                return (
                  <span
                    key={`${activeKey}-w-${lineIdx}-${idx}`}
                    className={cn("animate-hero-token inline-block whitespace-nowrap", leafClass)}
                    style={
                      {
                        "--hero-duration": `${Math.max(260, durationMs)}ms`,
                        animationDelay: `${globalIdx * stepDelay}ms`,
                      } as React.CSSProperties
                    }
                  >
                    {word}
                    {idx < words.length - 1 ? "\u00A0" : ""}
                  </span>
                );
              })}
              {lineIdx < lines.length - 1 ? <br /> : null}
            </span>
          );
        })}
      </>
    );
  }

  return <span className={cn("whitespace-pre-line", leafClass)}>{text}</span>;
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
  const primaryText = (currentMessage.text || "").trim();
  const highlightText = (currentMessage.highlightText || "").trim();

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
          {primaryText
            ? renderTokenizedText(
                primaryText,
                effective.animationStyle,
                durationMs,
                delayMs,
                animationKey,
                reducedMotion,
                false
              )
            : null}
          {highlightText ? (
            <>
              {primaryText ? (
                <>
                  {" "}
                  <br className="hidden sm:inline" />
                </>
              ) : null}
              <span className="inline">
                {renderTokenizedText(
                  highlightText,
                  effective.animationStyle,
                  durationMs,
                  delayMs,
                  `${animationKey}-hl`,
                  reducedMotion,
                  true
                )}
              </span>
            </>
          ) : null}
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

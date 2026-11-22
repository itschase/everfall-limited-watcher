import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ChevronDown, Search, Check } from "lucide-react";
import {
  SITE_ICON_DEFINITIONS,
  sanitizeSiteIconKey,
  searchSiteIcons,
  type SiteIconKey,
} from "../../../shared/icons";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SiteIcon } from "./SiteIcon";

export function IconPicker({
  value,
  fallback = "sparkles",
  onChange,
  disabled = false,
  className,
}: {
  value?: SiteIconKey | string | null;
  fallback?: SiteIconKey;
  onChange: (next: SiteIconKey) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState("All");
  const input = useRef<HTMLInputElement>(null);
  const activeKey = sanitizeSiteIconKey(value, fallback);
  const selected = SITE_ICON_DEFINITIONS.find(
    (item) => item.key === activeKey,
  )!;
  const categories = [
    "All",
    ...new Set(SITE_ICON_DEFINITIONS.map((item) => item.category)),
  ];
  const filtered = useMemo(
    () => searchSiteIcons(query, category),
    [query, category],
  );
  const choose = (key: SiteIconKey) => {
    onChange(key);
    setOpen(false);
  };
  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (!target.matches("[data-icon-option]")) return;
    const buttons = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>(
        "[data-icon-option]",
      ),
    );
    const index = buttons.indexOf(target as HTMLButtonElement);
    const columns = getComputedStyle(
      event.currentTarget,
    ).gridTemplateColumns.split(" ").length;
    const offset =
      event.key === "ArrowRight"
        ? 1
        : event.key === "ArrowLeft"
          ? -1
          : event.key === "ArrowDown"
            ? columns
            : event.key === "ArrowUp"
              ? -columns
              : 0;
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? buttons.length - 1
          : index + offset;
    if (offset || event.key === "Home" || event.key === "End") {
      event.preventDefault();
      buttons[Math.max(0, Math.min(buttons.length - 1, next))]?.focus();
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setQuery("");
          setCategory("All");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          aria-label={`Choose icon: ${selected.label}`}
          className={cn("min-w-0 justify-between gap-2 font-normal", className)}
        >
          <span className="inline-flex min-w-0 items-center gap-2">
            <SiteIcon name={activeKey} className="h-4 w-4 shrink-0" />
            <span className="truncate">{selected.label}</span>
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        </Button>
      </DialogTrigger>
      <DialogContent
        className="max-w-2xl"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          input.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Choose an icon</DialogTitle>
          <DialogDescription>
            Browse {SITE_ICON_DEFINITIONS.length - 1} Lucide icons. Search by
            name or purpose, such as vehicle, notification, privacy, or
            settings.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search
              aria-hidden="true"
              className="absolute left-3 top-3 h-4 w-4 text-muted-foreground"
            />
            <Input
              ref={input}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search icons or keywords…"
              aria-label="Search icons"
              className="pl-9"
            />
          </div>
          <select
            aria-label="Icon category"
            className="h-10 min-w-0 rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            {categories.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <p role="status" aria-live="polite" className="text-muted-foreground">
            {filtered.length} choices · Selected: {selected.label}
          </p>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => choose("none")}>
              No icon
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => choose(fallback)}
            >
              Restore default
            </Button>
          </div>
        </div>
        <div
          onKeyDown={move}
          aria-label="Icon choices"
          className="thin-scrollbar grid max-h-[min(45dvh,360px)] grid-cols-3 gap-2 overflow-y-auto p-1 sm:grid-cols-5 md:grid-cols-6"
        >
          {filtered.length ? (
            filtered.map((item) => (
              <button
                key={item.key}
                data-icon-option
                type="button"
                aria-label={item.label}
                aria-pressed={item.key === activeKey}
                onClick={() => choose(item.key)}
                title={`${item.label} · ${item.category}`}
                className={cn(
                  "relative flex min-h-16 min-w-0 flex-col items-center justify-center gap-2 rounded-lg border px-2 py-3 text-center outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                  item.key === activeKey
                    ? "border-zinc-500 bg-accent text-white"
                    : "border-border text-muted-foreground hover:bg-accent hover:text-white",
                )}
              >
                <SiteIcon name={item.key} className="h-5 w-5" />
                {item.key === activeKey && (
                  <Check
                    aria-hidden="true"
                    className="absolute right-1 top-1 h-3 w-3"
                  />
                )}
                <span className="w-full truncate text-[10px] leading-tight">
                  {item.label}
                </span>
              </button>
            ))
          ) : (
            <div className="col-span-full py-10 text-center">
              <p className="text-sm font-medium">No matching icons</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Try another keyword or category.
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="mt-3"
                onClick={() => {
                  setQuery("");
                  setCategory("All");
                }}
              >
                Clear filters
              </Button>
            </div>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Use arrow keys to browse, Enter to choose, and Escape to close.
        </p>
      </DialogContent>
    </Dialog>
  );
}

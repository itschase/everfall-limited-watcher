import { useMemo, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import {
  SITE_ICON_DEFINITIONS,
  sanitizeSiteIconKey,
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
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("All");

  const activeKey = sanitizeSiteIconKey(value, fallback);
  const activeDef = useMemo(
    () => SITE_ICON_DEFINITIONS.find((d) => d.key === activeKey),
    [activeKey]
  );

  const categories = useMemo(() => {
    const unique = Array.from(new Set(SITE_ICON_DEFINITIONS.map((d) => d.category)));
    return ["All", ...unique];
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SITE_ICON_DEFINITIONS.filter((item) => {
      if (category !== "All" && item.category !== category) return false;
      if (!q) return true;
      return (
        item.label.toLowerCase().includes(q) ||
        item.key.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q)
      );
    });
  }, [category, query]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          className={cn("h-8 justify-between gap-2 px-2.5 text-xs font-normal", className)}
        >
          <span className="inline-flex items-center gap-2 truncate">
            <SiteIcon name={activeKey} fallback={fallback} className="h-3.5 w-3.5 shrink-0 text-zinc-200" />
            <span className="truncate text-zinc-200">{activeDef?.label || activeKey}</span>
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-md p-4 sm:p-5">
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-base">Choose Section Icon</DialogTitle>
          <DialogDescription className="text-xs">
            Select a Lucide vector icon from the curated Everfall Limited Watcher icon set.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => { onChange("none"); setOpen(false); }}>No icon</Button>
            <Button size="sm" variant="ghost" onClick={() => { onChange(fallback); setOpen(false); }}>Restore default</Button>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search icons..."
              className="h-8 pl-8 text-xs"
            />
          </div>

          <div className="thin-scrollbar flex items-center gap-1 overflow-x-auto pb-1">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className={cn(
                  "shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-medium transition cursor-pointer",
                  category === cat
                    ? "border-zinc-500 bg-zinc-800 text-white"
                    : "border-transparent bg-zinc-900/70 text-muted-foreground hover:text-white"
                )}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="thin-scrollbar grid max-h-64 grid-cols-3 gap-1.5 overflow-y-auto pr-0.5 sm:grid-cols-4">
            {filtered.length === 0 ? (
              <p className="col-span-full py-6 text-center text-xs text-muted-foreground">
                No matching icons.
              </p>
            ) : (
              filtered.map((item) => {
                const selected = item.key === activeKey;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => {
                      onChange(item.key);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex flex-col items-center justify-center gap-1 rounded-lg border p-2 text-center transition cursor-pointer",
                      selected
                        ? "border-zinc-400 bg-zinc-800 text-white"
                        : "border-border bg-zinc-950/70 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-900 hover:text-white"
                    )}
                    title={`${item.label} (${item.category})`}
                  >
                    <SiteIcon name={item.key} className="h-4 w-4 shrink-0" />
                    <span className="w-full truncate text-[10px] font-medium leading-tight">
                      {item.label}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { useMemo, useState } from "react";
import { Braces, Check, Copy, Plus, Search } from "lucide-react";
import {
  TEMPLATE_VARIABLES,
  TemplateVariableCategory,
  TemplateVariableScope,
  TemplateVariableValues,
} from "../../../shared/variables";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const CATEGORY_OPTIONS: Array<{ id: "all" | TemplateVariableCategory; label: string }> = [
  { id: "all", label: "All" },
  { id: "vehicle", label: "Vehicle" },
  { id: "availability", label: "Availability" },
  { id: "store", label: "Store" },
  { id: "monitoring", label: "Monitoring" },
  { id: "widget", label: "Widgets" },
];

export function VariablePicker({
  scope,
  activeFieldLabel,
  hasActiveField,
  sampleValues,
  onInsertVariable,
}: {
  scope: TemplateVariableScope;
  activeFieldLabel?: string | null;
  hasActiveField: boolean;
  sampleValues?: TemplateVariableValues;
  onInsertVariable: (token: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<"all" | TemplateVariableCategory>("all");
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return TEMPLATE_VARIABLES.filter((v) => {
      if (!v.supportedScopes.includes(scope)) return false;
      if (category !== "all" && v.category !== category) return false;
      if (!q) return true;
      return (
        v.token.toLowerCase().includes(q) ||
        v.label.toLowerCase().includes(q) ||
        v.description.toLowerCase().includes(q) ||
        v.category.toLowerCase().includes(q)
      );
    });
  }, [scope, category, search]);

  const handleAction = (token: string) => {
    if (hasActiveField) {
      onInsertVariable(token);
      return;
    }
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(token).catch(() => {});
    }
    setCopiedToken(token);
    setTimeout(() => setCopiedToken((curr) => (curr === token ? null : curr)), 1600);
  };

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-zinc-900">
            <Braces className="h-3.5 w-3.5 text-zinc-200" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Dynamic Variables</p>
            <p className="text-[11px] text-muted-foreground">
              {hasActiveField && activeFieldLabel
                ? `Click any variable to insert into: ${activeFieldLabel}`
                : "Focus any template field, or click a variable to copy its token."}
            </p>
          </div>
        </div>
        <Badge variant="outline" className="text-[11px]">
          {filtered.length} variable{filtered.length === 1 ? "" : "s"}
        </Badge>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search variables (e.g. features, sold_out, widget)..."
            className="h-8 pl-8 text-xs"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {CATEGORY_OPTIONS.filter(
            (c) => c.id === "all" || TEMPLATE_VARIABLES.some((v) => v.category === c.id && v.supportedScopes.includes(scope))
          ).map((c) => (
            <Button
              key={c.id}
              type="button"
              size="sm"
              variant={category === c.id ? "default" : "outline"}
              onClick={() => setCategory(c.id)}
              className="h-7 px-2.5 text-[11px]"
            >
              {c.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid max-h-64 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 thin-scrollbar">
        {filtered.length === 0 ? (
          <div className="col-span-2 rounded-lg border border-border bg-zinc-950/60 p-4 text-center text-xs text-muted-foreground">
            No variables match your search filter for this template scope.
          </div>
        ) : (
          filtered.map((item) => {
            const sampleRaw =
              sampleValues && item.key in sampleValues
                ? String((sampleValues as Record<string, string | undefined>)[item.key] || "").trim()
                : "";
            const previewVal = sampleRaw || item.example;
            const isCopied = copiedToken === item.token;

            return (
              <button
                key={item.key}
                type="button"
                onMouseDown={(e) => {
                  // Prevent stealing focus away from active input/textarea when clicking insert
                  if (hasActiveField) e.preventDefault();
                }}
                onClick={() => handleAction(item.token)}
                className={cn(
                  "group flex flex-col justify-between gap-1.5 rounded-lg border border-border bg-zinc-950/70 p-2.5 text-left transition-colors hover:border-zinc-600 hover:bg-zinc-900/90"
                )}
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <code className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-zinc-100">
                    {item.token}
                  </code>
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-zinc-400 group-hover:text-white">
                    {hasActiveField ? (
                      <>
                        <Plus className="h-3 w-3" />
                        Insert
                      </>
                    ) : isCopied ? (
                      <>
                        <Check className="h-3 w-3 text-emerald-400" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" />
                        Copy
                      </>
                    )}
                  </span>
                </div>
                <p className="text-xs font-medium text-zinc-200">{item.label}</p>
                <p className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                  {item.description}
                </p>
                <p className="truncate font-mono text-[10px] text-zinc-400">
                  Preview: <span className="text-zinc-300">{previewVal || "(empty when absent)"}</span>
                </p>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Home,
  Search,
  SlidersHorizontal,
  BookOpen,
  Info,
  type LucideIcon,
} from "lucide-react";
import { useSession } from "@/features/auth/useAuthActions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { GENERAL, GROUPS, OVERVIEW } from "./AppSidebarNavigation";

type ViewPreferences = {
  density: "compact" | "comfortable";
  width: "focused" | "wide";
};
const defaults: ViewPreferences = { density: "compact", width: "focused" };
let view = defaults;
const listeners = new Set<() => void>();
const snapshot = () => view;
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
function updateView(patch: Partial<ViewPreferences>) {
  view = {
    density:
      patch.density === "compact" || patch.density === "comfortable"
        ? patch.density
        : view.density,
    width:
      patch.width === "wide" || patch.width === "focused"
        ? patch.width
        : view.width,
  };
  listeners.forEach((listener) => listener());
}
export const useViewPreferences = () =>
  useSyncExternalStore(subscribe, snapshot, snapshot);

export function ViewOptions() {
  const prefs = useViewPreferences(),
    [open, setOpen] = useState(false);
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Customize view"
            onClick={() => setOpen(true)}
          >
            <SlidersHorizontal className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Customize view</TooltipContent>
      </Tooltip>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Customize your workspace</DialogTitle>
            <DialogDescription>
              Adjust this browser view without changing published pages or
              server settings. Choices stay while you navigate and reset on
              reload.
            </DialogDescription>
          </DialogHeader>
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">
              Interface spacing
            </legend>
            <div className="grid grid-cols-2 gap-2">
              {(["compact", "comfortable"] as const).map((density) => (
                <Button
                  key={density}
                  variant={prefs.density === density ? "secondary" : "outline"}
                  aria-pressed={prefs.density === density}
                  onClick={() => updateView({ density })}
                  className="capitalize"
                >
                  {density}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Compact keeps related information closer together; comfortable
              adds breathing room.
            </p>
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">Content width</legend>
            <div className="grid grid-cols-2 gap-2">
              {(["focused", "wide"] as const).map((width) => (
                <Button
                  key={width}
                  variant={prefs.width === width ? "secondary" : "outline"}
                  aria-pressed={prefs.width === width}
                  onClick={() => updateView({ width })}
                  className="capitalize"
                >
                  {width}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Wide uses more space on large screens. Phone layouts remain
              responsive.
            </p>
          </fieldset>
          <div className="flex justify-between gap-2 border-t border-border pt-3">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => updateView(defaults)}
            >
              Restore defaults
            </Button>
            <Button size="sm" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

type Destination = {
  label: string;
  to: string;
  icon: LucideIcon;
  group: string;
};
const publicPages: Destination[] = [
  { label: "Homepage", to: "/", icon: Home, group: "Website" },
  { label: "Features", to: "/features", icon: BookOpen, group: "Website" },
  { label: "About", to: "/about", icon: Info, group: "Website" },
];
export function CommandSearch() {
  const { data: session } = useSession();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [cursor, setCursor] = useState(0);
  const input = useRef<HTMLInputElement>(null),
    list = useRef<HTMLDivElement>(null),
    id = useId();
  const destinations: Destination[] = [
    ...publicPages,
    ...(session?.user
      ? GENERAL.map((item) => ({ ...item, group: "Your workspace" }))
      : [
          {
            label: "Limited Drop History",
            to: "/history",
            icon: BookOpen,
            group: "Website",
          },
        ]),
    ...(session?.user?.isAdmin
      ? [
          { ...OVERVIEW, group: "Administrator" },
          ...GROUPS.flatMap((group) =>
            group.items.map((item) => ({ ...item, group: group.label })),
          ),
        ]
      : []),
  ];
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const aliases: Record<string, string> = {
    "/admin/pages": "icons appearance content hero customization",
    "/admin/bot": "commands connection presence status",
    "/admin/widgets": "deploy live widget",
    "/admin/embeds": "templates messages design",
    "/dashboard": "notifications alerts settings servers roles",
    "/admin/monitor": "store checks health",
  };
  const filtered = destinations.filter((item) =>
    words.every((word) =>
      `${item.label} ${item.group} ${item.to} ${aliases[item.to] || ""}`
        .toLowerCase()
        .includes(word),
    ),
  );
  useEffect(() => {
    const hotkey = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "k" &&
        !event.repeat
      ) {
        event.preventDefault();
        setOpen((previous) => !previous);
      }
    };
    window.addEventListener("keydown", hotkey);
    return () => window.removeEventListener("keydown", hotkey);
  }, []);
  useEffect(() => {
    if (open) {
      setQuery("");
      setCursor(0);
    }
  }, [open]);
  useEffect(() => {
    list.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [cursor]);
  const go = (item?: Destination) => {
    if (!item) return;
    setOpen(false);
    void navigate({ to: item.to as any });
  };
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Find a page"
            onClick={() => setOpen(true)}
          >
            <Search className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Find a page · Ctrl / ⌘ K</TooltipContent>
      </Tooltip>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="gap-3 p-4 sm:p-4"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            input.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>Find a page</DialogTitle>
            <DialogDescription>
              Search pages and tools you can access.
            </DialogDescription>
          </DialogHeader>
          <Input
            ref={input}
            role="combobox"
            aria-label="Search pages and tools"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={id}
            aria-activedescendant={
              filtered[cursor] ? `${id}-${cursor}` : undefined
            }
            value={query}
            placeholder="Search pages, servers, widgets…"
            onChange={(event) => {
              setQuery(event.target.value);
              setCursor(0);
            }}
            onKeyDown={(event) => {
              if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
                event.preventDefault();
                setCursor((previous) =>
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? Math.max(0, filtered.length - 1)
                      : Math.max(
                          0,
                          Math.min(
                            filtered.length - 1,
                            previous + (event.key === "ArrowDown" ? 1 : -1),
                          ),
                        ),
                );
              } else if (event.key === "Enter") {
                event.preventDefault();
                go(filtered[cursor]);
              }
            }}
          />
          <div
            id={id}
            ref={list}
            role="listbox"
            aria-label="Available pages"
            className="thin-scrollbar max-h-[50dvh] space-y-1 overflow-y-auto"
          >
            {filtered.length ? (
              filtered.map((item, index) => (
                <button
                  key={item.to}
                  id={`${id}-${index}`}
                  role="option"
                  type="button"
                  tabIndex={-1}
                  aria-selected={cursor === index}
                  onMouseMove={() => setCursor(index)}
                  onClick={() => go(item)}
                  className={cn(
                    "flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-left",
                    cursor === index
                      ? "bg-accent text-white"
                      : "text-muted-foreground",
                  )}
                >
                  <item.icon aria-hidden="true" className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1 text-sm">{item.label}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {item.group}
                  </span>
                </button>
              ))
            ) : (
              <p
                role="status"
                className="px-3 py-8 text-center text-sm text-muted-foreground"
              >
                No matching pages. Try a shorter search.
              </p>
            )}
          </div>
          <p className="border-t border-border pt-3 text-[11px] text-muted-foreground">
            ↑ ↓ browse · Enter open · Escape close
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}

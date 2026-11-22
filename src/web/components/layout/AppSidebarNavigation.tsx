import { useEffect, useId, useRef, useSyncExternalStore } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import {
  Activity,
  Bot,
  ChevronDown,
  FileText,
  FlaskConical,
  History,
  Images,
  LayoutDashboard,
  LayoutPanelTop,
  Palette,
  PanelsTopLeft,
  Send,
  Server,
  Shield,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type NavItem = { label: string; to: string; icon: LucideIcon; exact?: boolean };
type NavGroup = {
  id: string;
  label: string;
  icon: LucideIcon;
  items: NavItem[];
};
export const GENERAL: NavItem[] = [
  { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard, exact: true },
  { label: "Limited Drop History", to: "/history", icon: History },
  { label: "Changelog", to: "/changelog", icon: FileText },
];
export const OVERVIEW: NavItem = {
  label: "Overview",
  to: "/admin",
  icon: Shield,
  exact: true,
};
export const GROUPS: NavGroup[] = [
  {
    id: "discord",
    label: "Discord & Servers",
    icon: Bot,
    items: [
      { label: "Bot Control", to: "/admin/bot", icon: Bot },
      { label: "Connected Servers", to: "/admin/servers", icon: Server },
      { label: "Status Widgets", to: "/admin/widgets", icon: LayoutPanelTop },
      { label: "Embed Manager", to: "/admin/embeds", icon: Palette },
    ],
  },
  {
    id: "listings",
    label: "Listings & Media",
    icon: Images,
    items: [
      {
        label: "Vehicle Metadata",
        to: "/admin/metadata",
        icon: SlidersHorizontal,
      },
      { label: "Image Manager", to: "/admin/images", icon: Images },
    ],
  },
  {
    id: "website",
    label: "Website & Content",
    icon: PanelsTopLeft,
    items: [
      { label: "Pages", to: "/admin/pages", icon: FileText },
      { label: "Release Notes", to: "/admin/changelog", icon: FileText },
    ],
  },
  {
    id: "monitoring",
    label: "Monitoring & Testing",
    icon: Activity,
    items: [
      { label: "Store Monitoring", to: "/admin/monitor", icon: Activity },
      { label: "Dispatch & Deliveries", to: "/admin/dispatch", icon: Send },
      { label: "Testing", to: "/admin/testing", icon: FlaskConical },
    ],
  },
];

// Keep choices across route remounts without writing cookies or browser storage.
type Preferences = {
  collapsed: boolean | null;
  groups: Record<string, boolean>;
};
let preferences: Preferences = { collapsed: null, groups: {} };
const listeners = new Set<() => void>();
function updatePreferences(next: Partial<Preferences>) {
  preferences = { ...preferences, ...next };
  listeners.forEach((listener) => listener());
}
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const snapshot = () => preferences;
export function useSidebarPreferences() {
  return {
    preferences: useSyncExternalStore(subscribe, snapshot, snapshot),
    updatePreferences,
  };
}

function matches(path: string, item: NavItem) {
  if (item.to === "/admin/pages" && path === "/admin/hero") return true;
  return path === item.to || (!item.exact && path.startsWith(`${item.to}/`));
}

export function SidebarBrand({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          to="/"
          activeOptions={{ exact: true }}
          onClick={onNavigate}
          aria-label="Everfall Limited Watcher homepage"
          className={cn(
            "group flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-lg px-1 text-white outline-none transition-colors hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
            collapsed && "justify-center px-0",
          )}
        >
          <img
            src="/icon.webp"
            alt=""
            className="h-7 w-7 shrink-0 object-contain transition-transform duration-200 group-hover:scale-105 motion-reduce:transform-none motion-reduce:transition-none"
          />
          {!collapsed && (
            <span className="truncate text-[13px] font-bold tracking-tight">
              Everfall Limited Watcher
            </span>
          )}
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right">Open homepage</TooltipContent>
    </Tooltip>
  );
}

export function AppSidebarNavigation({
  isAdmin,
  collapsed = false,
  onNavigate,
}: {
  isAdmin: boolean;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const { pathname } = useLocation();
  const { preferences, updatePreferences } = useSidebarPreferences();
  const instanceId = useId();
  const navigation = useRef<HTMLElement>(null);
  const activeGroup = GROUPS.find((group) =>
    group.items.some((item) => matches(pathname, item)),
  );
  useEffect(() => {
    if (activeGroup)
      updatePreferences({
        groups: { ...snapshot().groups, [activeGroup.id]: true },
      });
  }, [pathname, activeGroup?.id]);
  useEffect(() => {
    const timer = window.setTimeout(
      () => {
        const pane = navigation.current;
        const current = pane?.querySelector<HTMLElement>(
          '[aria-current="page"]',
        );
        if (!pane || !current) return;
        const bounds = pane.getBoundingClientRect();
        const item = current.getBoundingClientRect();
        if (item.bottom > bounds.bottom)
          pane.scrollTop += item.bottom - bounds.bottom + 12;
        else if (item.top < bounds.top)
          pane.scrollTop -= bounds.top - item.top + 12;
      },
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 210,
    );
    return () => window.clearTimeout(timer);
  }, [pathname, collapsed]);

  const renderLink = (item: NavItem, nested = false) => {
    const active = matches(pathname, item),
      Icon = item.icon;
    const link = (
      <Link
        key={item.to}
        to={item.to as any}
        activeOptions={{ exact: Boolean(item.exact), includeSearch: false }}
        onClick={onNavigate}
        aria-label={item.label}
        aria-current={active ? "page" : undefined}
        className={cn(
          "relative flex min-h-10 min-w-0 items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transform-none motion-reduce:transition-none",
          active
            ? "bg-white/[0.07] text-white"
            : "text-sidebar-foreground/75 hover:bg-white/[0.04] hover:text-white",
          collapsed && "justify-center px-2",
          nested && "text-[13px]",
        )}
      >
        {active && (
          <span
            aria-hidden="true"
            className="absolute bottom-2 left-0 top-2 w-0.5 rounded-full bg-zinc-100"
          />
        )}
        <Icon
          aria-hidden="true"
          className={cn(
            "h-4 w-4 shrink-0",
            active ? "text-white" : "text-muted-foreground",
          )}
        />
        {!collapsed && <span className="truncate">{item.label}</span>}
      </Link>
    );
    return collapsed ? (
      <Tooltip key={item.to}>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right">{item.label}</TooltipContent>
      </Tooltip>
    ) : (
      link
    );
  };

  return (
    <nav
      ref={navigation}
      aria-label="Application navigation"
      className="thin-scrollbar min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-3 py-4"
    >
      <div>
        <p
          className={cn(
            "mb-2 px-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground",
            collapsed && "sr-only",
          )}
        >
          General
        </p>
        <div className="space-y-1">
          {GENERAL.map((item) => renderLink(item))}
        </div>
      </div>
      {isAdmin && (
        <div>
          <p
            className={cn(
              "mb-2 px-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground",
              collapsed && "sr-only",
            )}
          >
            Administrator
          </p>
          {collapsed && (
            <div
              aria-hidden="true"
              className="mb-3 h-1"
            />
          )}
          <div className="space-y-1">
            {renderLink(OVERVIEW)}
            {GROUPS.map((group) => {
              const active = activeGroup?.id === group.id,
                Icon = group.icon;
              const open = preferences.groups[group.id] ?? active;
              const panelId = `${instanceId}-${group.id}`;
              const triggerClass = cn(
                "relative flex min-h-11 w-full min-w-0 items-center gap-2.5 rounded-lg px-2.5 text-left text-xs font-semibold outline-none transition-colors duration-150 hover:bg-white/[0.04] hover:text-white focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
                active
                  ? "bg-white/[0.04] text-zinc-100"
                  : "text-muted-foreground",
                collapsed && "justify-center px-2",
              );
              if (collapsed)
                return (
                  <DropdownMenu key={group.id}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <DropdownMenuTrigger
                          className={triggerClass}
                          aria-label={group.label}
                          aria-current={active ? "true" : undefined}
                        >
                          <Icon
                            aria-hidden="true"
                            className="h-4 w-4 shrink-0"
                          />
                          {active && (
                            <span
                              aria-hidden="true"
                              className="absolute left-0 h-5 w-0.5 rounded-full bg-zinc-100"
                            />
                          )}
                        </DropdownMenuTrigger>
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        {group.label}
                      </TooltipContent>
                    </Tooltip>
                    <DropdownMenuContent
                      side="right"
                      align="start"
                      collisionPadding={12}
                      className="max-h-[calc(100dvh-2rem)] min-w-56 overflow-y-auto"
                    >
                      <DropdownMenuLabel>{group.label}</DropdownMenuLabel>
                      {group.items.map((item) => (
                        <DropdownMenuItem key={item.to} asChild>
                          <Link
                            to={item.to as any}
                            activeOptions={{
                              exact: true,
                              includeSearch: false,
                            }}
                            aria-current={
                              matches(pathname, item) ? "page" : undefined
                            }
                            className={cn(
                              "flex items-center gap-2.5",
                              matches(pathname, item) &&
                                "bg-white/[0.07] text-white",
                            )}
                          >
                            <item.icon aria-hidden="true" className="h-4 w-4" />
                            {item.label}
                          </Link>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                );
              return (
                <div key={group.id}>
                  <button
                    type="button"
                    className={triggerClass}
                    aria-expanded={open}
                    aria-controls={panelId}
                    onClick={() =>
                      updatePreferences({
                        groups: { ...preferences.groups, [group.id]: !open },
                      })
                    }
                  >
                    <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">
                      {group.label}
                    </span>
                    <ChevronDown
                      aria-hidden="true"
                      className={cn(
                        "h-3.5 w-3.5 shrink-0 transition-transform duration-200 motion-reduce:transition-none",
                        !open && "-rotate-90",
                      )}
                    />
                  </button>
                  <div
                    id={panelId}
                    inert={!open}
                    aria-hidden={!open}
                    className="grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none"
                    style={{
                      gridTemplateRows: open ? "1fr" : "0fr",
                      opacity: open ? 1 : 0,
                    }}
                  >
                    <div className="min-h-0 overflow-hidden">
                      <div className="ml-4 mt-1 space-y-1 pl-2 pb-1">
                        {group.items.map((item) => renderLink(item, true))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </nav>
  );
}

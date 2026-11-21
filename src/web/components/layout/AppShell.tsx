import { ReactNode, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import {
  Activity,
  Bot,
  FileText,
  FlaskConical,
  History,
  Home,
  Images,
  LayoutDashboard,
  LayoutPanelTop,
  Menu,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Send,
  Server,
  Shield,
  SlidersHorizontal,
} from "lucide-react";
import { useAuthActions, useSession, useSessionSync } from "@/features/auth/useAuthActions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { UserAccountMenu } from "./UserAccountMenu";

interface NavItem {
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
}

const GENERAL_NAV: NavItem[] = [
  { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard, exact: true },
  { label: "Limited Drop History", to: "/history", icon: History },
  { label: "Changelog", to: "/changelog", icon: FileText },
];

const ADMIN_NAV: NavItem[] = [
  { label: "Overview", to: "/admin", icon: Shield, exact: true },
  { label: "Bot Control", to: "/admin/bot", icon: Bot },
  { label: "Status Widgets", to: "/admin/widgets", icon: LayoutPanelTop },
  { label: "Connected Servers", to: "/admin/servers", icon: Server },
  { label: "Vehicle Metadata", to: "/admin/metadata", icon: SlidersHorizontal },
  { label: "Image Manager", to: "/admin/images", icon: Images },
  { label: "Embed Manager", to: "/admin/embeds", icon: Palette },
  { label: "Pages", to: "/admin/pages", icon: FileText },
  { label: "Release Notes", to: "/admin/changelog", icon: FileText },
  { label: "Store Monitoring", to: "/admin/monitor", icon: Activity },
  { label: "Dispatch & Deliveries", to: "/admin/dispatch", icon: Send },
  { label: "Testing", to: "/admin/testing", icon: FlaskConical },
];

export function AppShell({
  title,
  description,
  actions,
  requireAdmin = false,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  requireAdmin?: boolean;
  children: ReactNode;
}) {
  useSessionSync();
  const location = useLocation();
  const navigate = useNavigate();
  const { data: session, isLoading } = useSession();
  const { startLogin, logout, isLoggingIn } = useAuthActions((dest) => {
    if (dest) void navigate({ to: dest as any });
  });

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth >= 768 && window.innerWidth < 1280;
  });
  const manualCollapseOverride = useRef<boolean | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => {
      const compactDesktop = window.innerWidth >= 768 && window.innerWidth < 1280;
      if (manualCollapseOverride.current === null) {
        setCollapsed(compactDesktop);
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const toggleSidebarCollapsed = (next: boolean) => {
    manualCollapseOverride.current = next;
    setCollapsed(next);
  };

  const user = session?.user;

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
        <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center">
          <img
            src="/icon.webp"
            alt="Everfall Limited Watcher"
            className="mx-auto mb-4 h-12 w-12 object-contain"
          />
          <h1 className="text-xl font-bold text-white">Discord Login Required</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in with your Discord account to access Limited Drop History and Server Manager settings.
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <Button onClick={() => void startLogin({ targetAfter: location.pathname })} disabled={isLoggingIn}>
              {isLoggingIn ? "Connecting..." : "Sign in with Discord"}
            </Button>
            <Button variant="ghost" asChild>
              <Link to="/">Return Home</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (requireAdmin && !user.isAdmin) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
        <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center">
          <Shield className="mx-auto mb-3 h-10 w-10 text-amber-400" />
          <h1 className="text-xl font-bold text-white">Master Administrator Required</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This section is restricted to the Everfall Limited Watcher master administrator.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Button asChild>
              <Link to="/dashboard">Go to Server Dashboard</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/">Home</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const isActivePath = (item: NavItem) => {
    if (item.exact) return location.pathname === item.to;
    if (item.to === "/admin/pages" && location.pathname === "/admin/hero") return true;
    return location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
  };

  const renderNavLinks = (onNavigate?: () => void) => {
    const navCollapsed = !onNavigate && collapsed;
    return (
    <div className="flex flex-1 flex-col gap-6 px-3 py-4">
      <div>
        {!navCollapsed && (
          <p className="mb-2 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            General
          </p>
        )}
        <div className="space-y-1">
          {GENERAL_NAV.map((item) => {
            const Icon = item.icon;
            const active = isActivePath(item);
            return (
              <Link
                key={item.to}
                to={item.to as any}
                onClick={onNavigate}
                title={navCollapsed ? item.label : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition",
                  active
                    ? "bg-sidebar-accent text-white"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-white",
                  navCollapsed && "justify-center px-2"
                )}
              >
                <Icon className={cn("h-4 w-4 shrink-0", active ? "text-white" : "text-muted-foreground")} />
                {!navCollapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </div>
      </div>

      {user.isAdmin && (
        <div>
          {!navCollapsed && (
            <p className="mb-2 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-amber-400/90">
              Administrator
            </p>
          )}
          <div className="space-y-1">
            {ADMIN_NAV.map((item) => {
              const Icon = item.icon;
              const active = isActivePath(item);
              return (
                <Link
                  key={item.to}
                  to={item.to as any}
                  onClick={onNavigate}
                  title={navCollapsed ? item.label : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition",
                    active
                      ? "bg-sidebar-accent text-white"
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-white",
                    navCollapsed && "justify-center px-2"
                  )}
                >
                  <Icon
                    className={cn("h-4 w-4 shrink-0", active ? "text-amber-400" : "text-muted-foreground")}
                  />
                  {!navCollapsed && <span className="truncate">{item.label}</span>}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-auto space-y-1 border-t border-sidebar-border pt-4">
        <Link
          to="/"
          onClick={onNavigate}
          title={navCollapsed ? "Public Homepage" : undefined}
          className={cn(
            "flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium text-muted-foreground transition hover:bg-sidebar-accent/60 hover:text-white",
            navCollapsed && "justify-center px-2"
          )}
        >
          <Home className="h-4 w-4 shrink-0" />
          {!navCollapsed && <span>Public Homepage</span>}
        </Link>
      </div>
    </div>
  );
  };

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Desktop Collapsible Sidebar */}
      <aside
        className={cn(
          "hidden shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-all duration-150 md:flex",
          collapsed ? "w-16" : "w-64"
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-3">
          <Link
            to="/"
            className={cn(
              "flex items-center gap-2.5 text-white no-underline overflow-hidden",
              collapsed && "justify-center w-full"
            )}
          >
            <img src="/icon.webp" alt="" className="h-7 w-7 shrink-0 object-contain" />
            {!collapsed && <span className="truncate text-xs font-bold tracking-tight">Everfall Limited Watcher</span>}
          </Link>
          {!collapsed && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => toggleSidebarCollapsed(true)}
                  aria-label="Collapse sidebar"
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-sidebar-accent hover:text-white cursor-pointer"
                >
                  <PanelLeftClose className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Collapse sidebar</TooltipContent>
            </Tooltip>
          )}
        </div>
        {collapsed && (
          <div className="flex justify-center border-b border-sidebar-border py-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => toggleSidebarCollapsed(false)}
                  aria-label="Expand sidebar"
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-sidebar-accent hover:text-white cursor-pointer"
                >
                  <PanelLeftOpen className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Expand sidebar</TooltipContent>
            </Tooltip>
          </div>
        )}
        {renderNavLinks()}
      </aside>

      {/* Mobile Navigation Drawer */}
      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogContent className="left-0 top-0 h-dvh max-h-none w-[280px] max-w-[85vw] translate-x-0 translate-y-0 rounded-none border-r border-sidebar-border bg-sidebar p-0 sm:p-0">
          <DialogTitle className="sr-only">Navigation Menu</DialogTitle>
          <DialogDescription className="sr-only">
            Browse Everfall Limited Watcher dashboard and archive routes.
          </DialogDescription>
          <div className="flex h-16 items-center gap-2.5 border-b border-sidebar-border px-4 pr-10">
            <img src="/icon.webp" alt="" className="h-7 w-7 shrink-0 object-contain" />
            <span className="truncate text-xs font-bold tracking-tight text-white">
              Everfall Limited Watcher
            </span>
          </div>
          {renderNavLinks(() => setMobileOpen(false))}
        </DialogContent>
      </Dialog>

      {/* Main Content Frame */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 sm:h-16 items-center justify-between gap-2 sm:gap-4 border-b border-border bg-background/95 px-3 backdrop-blur-md sm:px-5">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
              className="shrink-0 rounded-lg border border-border bg-card p-2 text-muted-foreground hover:text-white md:hidden cursor-pointer"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Link to="/" className="hidden whitespace-nowrap hover:text-white sm:inline">
                  Everfall Limited Watcher
                </Link>
                <span className="hidden sm:inline">/</span>
                <span className="truncate font-medium text-zinc-200">{title}</span>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <span
              className={cn(
                "hidden items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold sm:inline-flex",
                user.isAdmin
                  ? "border-amber-500/35 bg-amber-500/15 text-amber-300"
                  : "border-sky-500/35 bg-sky-500/15 text-sky-300"
              )}
            >
              <Shield className="h-3.5 w-3.5 shrink-0" />
              <span className="whitespace-nowrap">
                {user.isAdmin ? "Master Administrator" : "Server Manager"}
              </span>
            </span>

            <UserAccountMenu user={user} onLogout={logout} />
          </div>
        </header>

        <main className="@container/main mx-auto w-full max-w-6xl flex-1 px-3 py-4 sm:px-5 sm:py-5 lg:px-6">
          <div className="mb-5 flex flex-col gap-3 border-b border-border pb-4 @3xl/main:flex-row @3xl/main:items-center @3xl/main:justify-between">
            <div className="min-w-0">
              <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">{title}</h1>
              {description && (
                <p className="mt-1 text-xs sm:text-sm text-muted-foreground">{description}</p>
              )}
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
          </div>

          {children}
        </main>
      </div>
    </div>
  );
}

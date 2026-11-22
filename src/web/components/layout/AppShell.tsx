import {
  CommandSearch,
  ViewOptions,
  useViewPreferences,
} from "./InterfaceTools";
import { ReactNode, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { Menu, PanelLeftClose, PanelLeftOpen, Shield } from "lucide-react";
import {
  useAuthActions,
  useSession,
  useSessionSync,
} from "@/features/auth/useAuthActions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { UserAccountMenu } from "./UserAccountMenu";
import {
  AppSidebarNavigation,
  SidebarBrand,
  useSidebarPreferences,
} from "./AppSidebarNavigation";

export function AppShell({
  title,
  titleAvatar,
  description,
  actions,
  requireAdmin = false,
  children,
}: {
  title: string;
  titleAvatar?: ReactNode;
  description?: string;
  actions?: ReactNode;
  requireAdmin?: boolean;
  children: ReactNode;
}) {
  useSessionSync();
  const viewPreferences = useViewPreferences();
  const location = useLocation();
  const navigate = useNavigate();
  const { data: session, isLoading } = useSession();
  const { startLogin, logout, isLoggingIn } = useAuthActions((dest) => {
    if (dest) void navigate({ to: dest as any });
  });

  const { preferences, updatePreferences } = useSidebarPreferences();
  const [automaticCollapse, setAutomaticCollapse] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth >= 768 && window.innerWidth < 1280;
  });
  const collapsed = preferences.collapsed ?? automaticCollapse;
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => {
      if (window.innerWidth >= 768) setMobileOpen(false);
      const compactDesktop =
        window.innerWidth >= 768 && window.innerWidth < 1280;
      setAutomaticCollapse(compactDesktop);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const toggleSidebarCollapsed = (next: boolean) => {
    updatePreferences({ collapsed: next });
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
          <h1 className="text-xl font-bold text-white">
            Sign In to Continue
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in with Discord to browse the full vehicle history and manage your servers.
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <Button
              onClick={() =>
                void startLogin({ targetAfter: location.pathname })
              }
              disabled={isLoggingIn}
            >
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
          <h1 className="text-xl font-bold text-white">
            Master Administrator Required
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This section is restricted to the Everfall Limited Watcher master
            administrator.
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

  return (
    <div
      data-density={viewPreferences.density}
      className="workspace-shell flex min-h-screen bg-background text-foreground"
    >
      <a href="#workspace-content" className="skip-link">
        Skip to content
      </a>
      {/* Desktop Collapsible Sidebar */}
      <aside
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 flex-col overflow-hidden bg-sidebar/75 backdrop-blur-xl transition-[width] duration-200 ease-out motion-reduce:transition-none md:flex",
          collapsed ? "w-16" : "w-72",
        )}
      >
        <div className="flex h-18 shrink-0 items-center justify-between gap-2 px-3">
          <SidebarBrand collapsed={collapsed} />
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
          <div className="flex justify-center py-2">
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
        <AppSidebarNavigation
          isAdmin={Boolean(user.isAdmin)}
          collapsed={collapsed}
        />
      </aside>

      {/* Mobile Navigation Drawer */}
      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogContent overlayClassName="bg-black/30 backdrop-blur-none" className="left-0 top-0 flex h-dvh max-h-none w-80 max-w-[92vw] translate-x-0 translate-y-0 flex-col gap-0 overflow-y-hidden rounded-none border-0 bg-sidebar/80 p-0 shadow-none backdrop-blur-xl sm:p-0 motion-reduce:animate-none">
          <DialogTitle className="sr-only">Navigation Menu</DialogTitle>
          <DialogDescription className="sr-only">
            Browse Everfall Limited Watcher dashboard and archive routes.
          </DialogDescription>
          <div className="flex h-18 shrink-0 items-center px-3 pr-11">
            <SidebarBrand onNavigate={() => setMobileOpen(false)} />
          </div>
          <AppSidebarNavigation
            isAdmin={Boolean(user.isAdmin)}
            onNavigate={() => setMobileOpen(false)}
          />
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
                <Link
                  to="/"
                  className="hidden whitespace-nowrap hover:text-white sm:inline"
                >
                  Everfall Limited Watcher
                </Link>
                <span className="hidden sm:inline">/</span>
                <span
                  className="truncate font-medium text-zinc-300"
                  title={title}
                >
                  {title === "Administrator Overview"
                    ? "Overview"
                    : title === "Connected Discord Servers"
                      ? "Servers"
                      : title}
                </span>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-0.5 sm:gap-2">
            <CommandSearch />
            <ViewOptions />
            <span
              className={cn(
                "hidden items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold sm:inline-flex",
                user.isAdmin
                  ? "border-amber-500/35 bg-amber-500/15 text-amber-300"
                  : "border-sky-500/35 bg-sky-500/15 text-sky-300",
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

        <main
          id="workspace-content"
          tabIndex={-1}
          className={cn(
            "workspace-content @container/main mx-auto w-full min-w-0 flex-1 px-3 py-4 outline-none sm:px-5 sm:py-5 lg:px-6",
            viewPreferences.width === "wide" ? "max-w-[1600px]" : "max-w-6xl",
          )}
        >
          <div className="page-heading mb-4 flex flex-col gap-3 border-b border-border/60 pb-4 @3xl/main:flex-row @3xl/main:items-start @3xl/main:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              {titleAvatar}
              <div className="min-w-0">
                <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
                  {title}
                </h1>
                {description && (
                  <p className="mt-1 max-w-[72ch] text-xs leading-relaxed text-muted-foreground sm:text-sm">
                    {description}
                  </p>
                )}
              </div>
            </div>
            {actions && (
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {actions}
              </div>
            )}
          </div>

          {children}
        </main>
      </div>
    </div>
  );
}

import { CommandSearch } from "./InterfaceTools";
import { ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, Shield } from "lucide-react";
import {
  useAuthActions,
  useSession,
  useSessionSync,
} from "@/features/auth/useAuthActions";
import { Button } from "@/components/ui/button";
import { UserAccountMenu } from "./UserAccountMenu";
import { CreatorProfileCard } from "./CreatorProfileCard";

export function PublicLayout({ children }: { children: ReactNode }) {
  useSessionSync();
  const navigate = useNavigate();
  const { data: session, isLoading } = useSession();
  const { startLogin, logout, isLoggingIn } = useAuthActions((dest) => {
    if (dest) void navigate({ to: dest as any });
  });

  const user = session?.user;
  const creatorProfile = session?.creatorProfile;
  const creator =
    creatorProfile && user?.id === creatorProfile.id
      ? {
          ...creatorProfile,
          username: user.username || creatorProfile.username,
          avatarUrl: user.avatarUrl || creatorProfile.avatarUrl,
          profile: user.profile ?? creatorProfile.profile,
        }
      : creatorProfile;

  return (
    <div className="public-shell flex min-h-screen w-full max-w-full flex-col overflow-x-clip bg-background text-foreground">
      <a href="#public-content" className="skip-link">
        Skip to content
      </a>
      {/* 3-Zone Header */}
      <header className="sticky top-0 z-40 w-full border-b border-border bg-background/95 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-2 px-3 sm:gap-4 sm:px-6 lg:px-8">
          <Link
            to="/"
            aria-label="Everfall Limited Watcher homepage"
            activeOptions={{ exact: true }}
            className="flex min-w-0 items-center gap-2.5 text-white no-underline sm:gap-3 group"
          >
            <img
              src="/icon.webp"
              alt="Everfall Limited Watcher"
              className="h-8 w-8 shrink-0 object-contain transition-transform duration-200 group-hover:scale-105"
            />
            <span className="truncate text-xs font-bold leading-tight tracking-tight sm:text-sm">
              Everfall Limited Watcher
            </span>
          </Link>

          <nav
            aria-label="Primary"
            className="hidden items-center gap-6 text-sm font-medium text-muted-foreground lg:flex"
          >
            <Link
              to="/"
              activeOptions={{ exact: true }}
              className="whitespace-nowrap transition hover:text-white [&.active]:font-semibold [&.active]:text-white"
            >
              Home
            </Link>
            <Link
              to="/features"
              className="whitespace-nowrap transition hover:text-white [&.active]:font-semibold [&.active]:text-white"
            >
              Features
            </Link>
            <Link
              to="/history"
              className="whitespace-nowrap transition hover:text-white [&.active]:font-semibold [&.active]:text-white"
            >
              Drop History
            </Link>
            <Link
              to="/about"
              className="whitespace-nowrap transition hover:text-white [&.active]:font-semibold [&.active]:text-white"
            >
              About
            </Link>
          </nav>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <CommandSearch />
            {isLoading ? (
              <div className="h-9 w-28 animate-pulse rounded-lg bg-secondary sm:w-32" />
            ) : user ? (
              <div className="flex items-center gap-2">
                <Link
                  to="/dashboard"
                  className="hidden items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-zinc-800 sm:inline-flex"
                >
                  <LayoutDashboard className="h-3.5 w-3.5" />
                  Dashboard
                </Link>
                {user.isAdmin && (
                  <Link
                    to="/admin"
                    className="hidden items-center gap-1.5 rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-300 transition hover:bg-amber-500/20 sm:inline-flex"
                  >
                    <Shield className="h-3.5 w-3.5" />
                    Admin
                  </Link>
                )}
                <UserAccountMenu user={user} onLogout={logout} />
              </div>
            ) : (
              <Button
                size="sm"
                onClick={() => void startLogin()}
                disabled={isLoggingIn}
                className="px-2.5 sm:px-3"
              >
                {isLoggingIn ? "Connecting..." : "Sign in with Discord"}
              </Button>
            )}
          </div>
        </div>

        {/* Mobile Public Navigation */}
        <nav
          aria-label="Mobile Navigation"
          className="flex w-full items-center justify-around gap-1 border-t border-border/60 bg-zinc-950/90 px-2 py-2 text-xs font-medium text-muted-foreground lg:hidden"
        >
          <Link
            to="/"
            activeOptions={{ exact: true }}
            className="whitespace-nowrap rounded-md px-2.5 py-1 transition hover:text-white [&.active]:bg-zinc-900 [&.active]:font-semibold [&.active]:text-white"
          >
            Home
          </Link>
          <Link
            to="/features"
            className="whitespace-nowrap rounded-md px-2.5 py-1 transition hover:text-white [&.active]:bg-zinc-900 [&.active]:font-semibold [&.active]:text-white"
          >
            Features
          </Link>
          <Link
            to="/history"
            className="whitespace-nowrap rounded-md px-2.5 py-1 transition hover:text-white [&.active]:bg-zinc-900 [&.active]:font-semibold [&.active]:text-white"
          >
            Drop History
          </Link>
          <Link
            to="/about"
            className="whitespace-nowrap rounded-md px-2.5 py-1 transition hover:text-white [&.active]:bg-zinc-900 [&.active]:font-semibold [&.active]:text-white"
          >
            About
          </Link>
        </nav>
      </header>

      <main
        id="public-content"
        tabIndex={-1}
        className="w-full min-w-0 flex-1 outline-none"
      >
        {children}
      </main>

      {/* Public Footer */}
      <footer className="w-full min-w-0 border-t border-border bg-zinc-950">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5 text-sm font-semibold text-white">
              <img
                src="/icon.webp"
                alt=""
                className="h-5 w-5 shrink-0 object-contain"
              />
              Everfall Limited Watcher
            </div>
            <p className="text-xs text-muted-foreground">
              Everfall Limited Watcher is an independent, community-created
              utility. It is not affiliated with, endorsed by, sponsored by, or
              powered by Everfall or Tebex.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-xs text-muted-foreground">
            <Link to="/features" className="transition hover:text-white">
              Features
            </Link>
            <Link to="/history" className="transition hover:text-white">
              Drop History
            </Link>
            <Link to="/about" className="transition hover:text-white">
              About
            </Link>
            <Link
              to="/terms-of-service"
              className="transition hover:text-white"
            >
              Terms of Service
            </Link>
            <Link to="/privacy-policy" className="transition hover:text-white">
              Privacy Policy
            </Link>
            {creator && <CreatorProfileCard creator={creator} />}
          </div>
        </div>
      </footer>
    </div>
  );
}

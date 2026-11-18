import { ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { History, LayoutDashboard, Shield } from "lucide-react";
import { useAuthActions, useSession, useSessionSync } from "@/features/auth/useAuthActions";
import { Button } from "@/components/ui/button";
import { UserAccountMenu } from "./UserAccountMenu";

export function PublicLayout({ children }: { children: ReactNode }) {
  useSessionSync();
  const navigate = useNavigate();
  const { data: session, isLoading } = useSession();
  const { startLogin, logout, isLoggingIn } = useAuthActions((dest) => {
    if (dest) void navigate({ to: dest as any });
  });

  const user = session?.user;
  const creator = session?.creatorProfile;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* 3-Zone Header */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-2 px-3 sm:gap-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex min-w-0 items-center gap-2.5 text-white no-underline sm:gap-3">
            <img
              src="/icon.webp"
              alt="Everfall Limited Watcher"
              className="h-8 w-8 shrink-0 rounded-lg border border-white/10 object-cover"
            />
            <span className="truncate text-sm font-bold tracking-tight sm:text-base">
              Everfall Limited Watcher
            </span>
          </Link>

          <nav className="hidden items-center gap-6 text-sm font-medium text-muted-foreground md:flex">
            <Link
              to="/"
              className="whitespace-nowrap transition hover:text-white [&.active]:text-white"
            >
              Home
            </Link>
            <Link
              to="/history"
              className="whitespace-nowrap transition hover:text-white [&.active]:text-white"
            >
              Drop History
            </Link>
          </nav>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            {isLoading ? (
              <div className="h-9 w-28 animate-pulse rounded-lg bg-secondary sm:w-32" />
            ) : user ? (
              <div className="flex items-center gap-2">
                <Link
                  to="/history"
                  aria-label="Limited Drop History"
                  className="inline-flex items-center justify-center rounded-lg border border-border bg-secondary p-2 text-zinc-200 transition hover:bg-zinc-800 md:hidden"
                >
                  <History className="h-4 w-4" />
                </Link>
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
      </header>

      <main className="flex-1">{children}</main>

      {/* Public Footer */}
      <footer className="border-t border-border bg-zinc-950">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5 text-sm font-semibold text-white">
              <img src="/icon.webp" alt="" className="h-5 w-5 rounded" />
              Everfall Limited Watcher
            </div>
            <p className="text-xs text-muted-foreground">
              Everfall Limited Watcher is an independent, community-created utility. It is not affiliated with, endorsed by, sponsored by, or powered by Everfall or Tebex.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-6 text-xs text-muted-foreground">
            <Link to="/terms-of-service" className="transition hover:text-white">
              Terms of Service
            </Link>
            <Link to="/privacy-policy" className="transition hover:text-white">
              Privacy Policy
            </Link>
            {creator && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Managed by</span>
                {creator.profileUrl ? (
                  <a
                    href={creator.profileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`View ${creator.username}'s Discord profile`}
                    className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-semibold text-white transition hover:border-zinc-600 hover:bg-zinc-900"
                  >
                    <img
                      src={creator.avatarUrl}
                      alt={creator.username}
                      className="h-4 w-4 rounded-full object-cover"
                    />
                    <span>{creator.username}</span>
                  </a>
                ) : (
                  <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-semibold text-white">
                    <img
                      src={creator.avatarUrl}
                      alt={creator.username}
                      className="h-4 w-4 rounded-full object-cover"
                    />
                    <span>{creator.username}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}

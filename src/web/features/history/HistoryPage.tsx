import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Link,
  Outlet,
  useNavigate,
  useParams,
  useSearch,
} from "@tanstack/react-router";
import { AlertCircle, ArrowLeft, Search } from "lucide-react";
import {
  apiFetch,
  ApiError,
  HistoryResponse,
  ListingItem,
  PublicHistoryDetailResponse,
} from "@/lib/api";
import { useSession } from "@/features/auth/useAuthActions";
import { AppShell } from "@/components/layout/AppShell";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { VehicleCard } from "@/components/listings/VehicleCard";
import { VehicleDetailCard } from "@/components/listings/VehicleDetailCard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function HistoryPage() {
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as { packageId?: string };
  const activePackageId = params.packageId ? params.packageId.trim() : "";

  const { data: session, isLoading: isSessionLoading } = useSession();
  const filters = useSearch({ from: "/history" });
  const { q: search, status, page } = filters;
  const [searchInput, setSearchInput] = useState(search);
  useEffect(() => setSearchInput(search), [search]);
  useEffect(() => {
    if (searchInput === search) return;
    const timer = window.setTimeout(
      () =>
        void navigate({
          to: activePackageId ? "/history/$packageId" : "/history",
          params: { packageId: activePackageId },
          search: { ...filters, q: searchInput, page: 1 },
          replace: true,
        }),
      350,
    );
    return () => window.clearTimeout(timer);
  }, [searchInput, search, status, page, activePackageId, navigate]);

  const isAuthenticated = Boolean(session?.user);

  const queryParams = new URLSearchParams({
    q: search,
    status,
    page: String(page),
    pageSize: "12",
  });

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["history", search, status, page],
    queryFn: () =>
      apiFetch<HistoryResponse>(`/api/history?${queryParams.toString()}`),
    enabled: isAuthenticated,
  });

  const items = data?.items || [];
  const counts = data?.counts || { all: 0, inStock: 0, soldOut: 0 };

  const cachedListing = activePackageId
    ? items.find((item) => item.id === activePackageId) || null
    : null;

  const detailQuery = useQuery({
    queryKey: ["public-history-detail", activePackageId],
    queryFn: () =>
      apiFetch<PublicHistoryDetailResponse>(
        `/api/public/history/${encodeURIComponent(activePackageId)}`,
      ),
    enabled: Boolean(activePackageId),
    retry: false,
  });

  const openInspect = (listing: ListingItem) => {
    void navigate({
      to: "/history/$packageId",
      params: { packageId: listing.id },
      search: filters,
    });
  };

  const closeInspect = () => {
    void navigate({ to: "/history", search: filters });
  };

  // Expanded individual historical listing view (/history/{packageId})
  if (activePackageId) {
    const inspectedListing = detailQuery.data?.listing || cachedListing;
    const detailError = detailQuery.error as ApiError | Error | null;
    const isInvalidOrMissing =
      detailError instanceof ApiError &&
      (detailError.status === 400 || detailError.status === 404);

    const detailContent =
      detailQuery.isLoading && !inspectedListing ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-56 rounded-lg" />
          </div>
          <Skeleton className="h-[560px] w-full rounded-xl" />
        </div>
      ) : inspectedListing ? (
        <VehicleDetailCard
          listing={inspectedListing}
          onClose={closeInspect}
          isAdmin={Boolean(session?.user?.isAdmin)}
        />
      ) : (
        <div className="space-y-4">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={closeInspect}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Limited Drop History
          </Button>
          <Card className="mx-auto max-w-2xl p-8 text-center">
            <AlertCircle className="mx-auto mb-3 h-10 w-10 text-red-400" />
            <h2 className="text-lg font-bold text-white">
              {detailError instanceof ApiError && detailError.status === 400
                ? "Invalid Package ID"
                : "Historical Listing Not Found"}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {detailError?.message ||
                `No archived vehicle listing matching package ID #${activePackageId} could be found.`}
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Button asChild>
                <Link to="/history" search={filters}>
                  Return to Drop History
                </Link>
              </Button>
              {!isInvalidOrMissing && (
                <Button
                  variant="outline"
                  onClick={() => void detailQuery.refetch()}
                >
                  Retry
                </Button>
              )}
              {!isAuthenticated && (
                <Button variant="ghost" asChild>
                  <Link to="/">Return Home</Link>
                </Button>
              )}
            </div>
          </Card>
        </div>
      );

    if (isSessionLoading) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <Outlet />
        </div>
      );
    }

    if (isAuthenticated) {
      return (
        <AppShell
          title="Limited Drop History"
          description="Complete preserved archive of Everfall Limited Edition vehicle discoveries, archived galleries, and verified stock transitions."
        >
          {detailContent}
          <Outlet />
        </AppShell>
      );
    }

    return (
      <PublicLayout>
        <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="mb-6 border-b border-border pb-4">
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Limited Drop History
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Preserved archive record for an Everfall Limited Edition vehicle
              drop.
            </p>
          </div>
          {detailContent}
        </div>
        <Outlet />
      </PublicLayout>
    );
  }

  return (
    <AppShell
      title="Limited Drop History"
      description="Complete preserved archive of Everfall Limited Edition vehicle discoveries, archived galleries, and verified stock transitions."
    >
      {/* Filters & Search */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          value={status}
          onValueChange={(val) => {
            void navigate({
              to: "/history",
              search: {
                ...filters,
                q: searchInput,
                status: val as typeof status,
                page: 1,
              },
            });
          }}
        >
          <TabsList className="h-auto flex-wrap">
            <TabsTrigger value="all">All ({counts.all})</TabsTrigger>
            <TabsTrigger value="in_stock">
              In Stock ({counts.inStock})
            </TabsTrigger>
            <TabsTrigger value="sold_out">
              Sold Out ({counts.soldOut})
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
            }}
            placeholder="Search by vehicle name or ID..."
            className="pl-9"
          />
        </div>
      </div>

      {/* Results Grid */}
      {isLoading ? (
        <div className="grid gap-6 @2xl/main:grid-cols-2 @5xl/main:grid-cols-3">
          {[0, 1, 2].map((s) => (
            <Skeleton key={s} className="h-[400px] w-full rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-red-400">
            {(error as Error)?.message || "Failed to load historical archive."}
          </p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-4"
            onClick={() => void refetch()}
          >
            Retry
          </Button>
        </Card>
      ) : items.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-sm text-muted-foreground">
            No archived vehicles match your search criteria.
          </p>
        </Card>
      ) : (
        <>
          <div className="grid gap-6 @2xl/main:grid-cols-2 @5xl/main:grid-cols-3">
            {items.map((item) => (
              <VehicleCard
                key={item.id}
                listing={item}
                onInspect={openInspect}
                editImagesHref={
                  session?.user?.isAdmin
                    ? `/admin/images?listingId=${encodeURIComponent(item.id)}`
                    : undefined
                }
                editMetadataHref={
                  session?.user?.isAdmin
                    ? `/admin/metadata?listingId=${encodeURIComponent(item.id)}`
                    : undefined
                }
              />
            ))}
          </div>

          {data && data.totalPages > 1 && (
            <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 text-xs text-muted-foreground">
              <span>
                Page {data.page} of {data.totalPages} ({data.total} listings)
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={data.page <= 1}
                  onClick={() =>
                    void navigate({
                      to: "/history",
                      search: { ...filters, page: Math.max(1, page - 1) },
                    })
                  }
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={data.page >= data.totalPages}
                  onClick={() =>
                    void navigate({
                      to: "/history",
                      search: { ...filters, page: page + 1 },
                    })
                  }
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
      <Outlet />
    </AppShell>
  );
}

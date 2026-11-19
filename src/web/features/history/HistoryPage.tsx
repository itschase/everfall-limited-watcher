import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, ExternalLink, Images, Search } from "lucide-react";
import { apiFetch, HistoryResponse, ListingItem } from "@/lib/api";
import { formatLocalDateTime, safeExternalUrl } from "@/lib/utils";
import { useSession } from "@/features/auth/useAuthActions";
import { AppShell } from "@/components/layout/AppShell";
import { StockStatusPill, VehicleCard } from "@/components/listings/VehicleCard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function HistoryPage() {
  const { data: session } = useSession();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "in_stock" | "sold_out">("all");
  const [page, setPage] = useState(1);
  const [selectedListing, setSelectedListing] = useState<ListingItem | null>(null);
  const [modalImgIdx, setModalImgIdx] = useState(0);

  const openInspect = (listing: ListingItem) => {
    setModalImgIdx(0);
    setSelectedListing(listing);
  };

  const queryParams = new URLSearchParams({
    q: search,
    status,
    page: String(page),
    pageSize: "12",
  });

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["history", search, status, page],
    queryFn: () => apiFetch<HistoryResponse>(`/api/history?${queryParams.toString()}`),
  });

  const items = data?.items || [];
  const counts = data?.counts || { all: 0, inStock: 0, soldOut: 0 };

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
            setStatus(val as any);
            setPage(1);
          }}
        >
          <TabsList>
            <TabsTrigger value="all">All ({counts.all})</TabsTrigger>
            <TabsTrigger value="in_stock">In Stock ({counts.inStock})</TabsTrigger>
            <TabsTrigger value="sold_out">Sold Out ({counts.soldOut})</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by vehicle name or ID..."
            className="pl-9"
          />
        </div>
      </div>

      {/* Results Grid */}
      {isLoading ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((s) => (
            <Skeleton key={s} className="h-[400px] w-full rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-red-400">
            {(error as Error)?.message || "Failed to load historical archive."}
          </p>
          <Button variant="secondary" size="sm" className="mt-4" onClick={() => void refetch()}>
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
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
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
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={data.page >= data.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Detail Inspection Dialog */}
      <Dialog open={Boolean(selectedListing)} onOpenChange={(open) => !open && setSelectedListing(null)}>
        {selectedListing && (
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <div className="flex flex-wrap items-center justify-between gap-2 pr-8">
                <DialogTitle>{selectedListing.name}</DialogTitle>
                <StockStatusPill isAvailable={selectedListing.isAvailable} />
              </div>
              <DialogDescription className="font-mono text-xs">
                Package ID #<span className="select-text cursor-text text-zinc-300">{selectedListing.id}</span>
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {selectedListing.images.length > 0 && (
                <div className="relative overflow-hidden rounded-lg border border-border bg-zinc-950">
                  <img
                    src={
                      selectedListing.images[
                        Math.min(modalImgIdx, selectedListing.images.length - 1)
                      ]
                    }
                    alt={selectedListing.name}
                    referrerPolicy="no-referrer"
                    className="max-h-56 w-full object-cover sm:max-h-72"
                  />
                  {selectedListing.images.length > 1 && (
                    <>
                      <button
                        type="button"
                        aria-label="Previous vehicle image"
                        onClick={() =>
                          setModalImgIdx(
                            (prev) =>
                              (prev - 1 + selectedListing.images.length) %
                              selectedListing.images.length
                          )
                        }
                        className="absolute left-2 top-1/2 -translate-y-1/2 rounded-lg border border-white/10 bg-black/65 p-1.5 text-white/85 transition hover:bg-black/85 hover:text-white cursor-pointer"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        aria-label="Next vehicle image"
                        onClick={() =>
                          setModalImgIdx((prev) => (prev + 1) % selectedListing.images.length)
                        }
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg border border-white/10 bg-black/65 p-1.5 text-white/85 transition hover:bg-black/85 hover:text-white cursor-pointer"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                      <div className="absolute bottom-2 right-2 rounded-md border border-white/10 bg-black/70 px-2 py-0.5 text-[11px] font-medium text-zinc-200 tabular-nums">
                        {Math.min(modalImgIdx, selectedListing.images.length - 1) + 1} /{" "}
                        {selectedListing.images.length}
                      </div>
                    </>
                  )}
                </div>
              )}
              <div className="grid gap-3 rounded-lg border border-border bg-zinc-950 p-3.5 text-xs sm:grid-cols-2 sm:p-4 tabular-nums">
                <div>
                  <span className="text-muted-foreground">First Detected</span>
                  <p className="mt-0.5 font-medium text-white">
                    {formatLocalDateTime(selectedListing.detectedAt)}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Last Verified</span>
                  <p className="mt-0.5 font-medium text-white">
                    {formatLocalDateTime(selectedListing.lastVerifiedAt)}
                  </p>
                </div>
                {selectedListing.soldOutAt && (
                  <div>
                    <span className="text-muted-foreground">Confirmed Unavailable</span>
                    <p className="mt-0.5 font-medium text-red-300">
                      {formatLocalDateTime(selectedListing.soldOutAt)}
                    </p>
                  </div>
                )}
                {selectedListing.lastHttpStatus && (
                  <div>
                    <span className="text-muted-foreground">Last Store HTTP Status</span>
                    <p className="mt-0.5 font-mono font-medium text-zinc-200">
                      HTTP {selectedListing.lastHttpStatus}
                    </p>
                  </div>
                )}
              </div>

              <p className="whitespace-pre-line text-sm leading-relaxed text-zinc-300">
                {selectedListing.description}
              </p>

              <div className="flex flex-wrap justify-end gap-2 pt-2">
                {session?.user?.isAdmin && (
                  <a
                    href={`/admin/images?listingId=${encodeURIComponent(selectedListing.id)}`}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-secondary px-4 py-2.5 text-xs font-semibold text-zinc-200 transition hover:bg-zinc-800 hover:text-white sm:w-auto sm:py-2"
                  >
                    <Images className="h-3.5 w-3.5" />
                    Edit Image Set
                  </a>
                )}
                <a
                  href={
                    selectedListing.isAvailable
                      ? safeExternalUrl(selectedListing.url) || "https://store.everfallcommunity.com/"
                      : "https://store.everfallcommunity.com/"
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground transition hover:bg-zinc-200 sm:w-auto sm:py-2"
                >
                  {selectedListing.isAvailable ? "View Package on Everfall" : "Open Everfall Store"}
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </AppShell>
  );
}

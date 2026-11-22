import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/features/auth/useAuthActions";
import { apiFetch } from "@/lib/api";
import type { ListingPrice as Price } from "../../../shared/listingPrice";

export function ListingPrice({ id, inStock, detail = false }: { id: string; inStock: boolean; detail?: boolean }) {
  const { data: session } = useSession();
  const user = session?.user;
  const { data } = useQuery({ queryKey: ["member-listing-prices", user?.id], queryFn: () => apiFetch<{ prices: Record<string, Price> }>("/api/listing-prices"), enabled: Boolean(user) && (inStock || detail), staleTime: 60_000, gcTime: 0, retry: false });
  const price = user && (inStock || detail) ? data?.prices[id] : undefined;
  if (!price) return null;
  return <p className="mt-2 text-sm font-semibold tabular-nums text-foreground"><span className="text-xs font-normal text-muted-foreground">{inStock ? "Recorded store price: " : "Last listed price: "}</span>{new Intl.NumberFormat(undefined, { style: "currency", currency: price.currency }).format(price.amount)} <span className="text-xs font-normal text-muted-foreground">{price.currency}</span></p>;
}

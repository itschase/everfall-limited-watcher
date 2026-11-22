import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { normalizeListingPrice, type ListingPrice } from "../../../shared/listingPrice";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export function VehiclePriceEditor({ id }: { id: string }) {
  const client = useQueryClient();
  const url = `/api/admin/listings/${encodeURIComponent(id)}/price`;
  const query = useQuery<{ price: ListingPrice | null }>({ queryKey: ["admin-price", id], queryFn: () => apiFetch(url) });
  const [amount, setAmount] = useState(""), [currency, setCurrency] = useState("USD");
  useEffect(() => { setAmount(query.data?.price ? String(query.data.price.amount) : ""); setCurrency(query.data?.price?.currency || "USD"); }, [id, query.data]);
  const mutation = useMutation({ mutationFn: (action: "save" | "hide" | "reset") => apiFetch(url, { method: action === "reset" ? "DELETE" : "PUT", ...(action === "reset" ? {} : { body: JSON.stringify({ price: action === "hide" ? null : { amount, currency } }) }) }), onSuccess: () => { void client.invalidateQueries({ queryKey: ["admin-price", id] }); void client.invalidateQueries({ queryKey: ["member-listing-prices"] }); toast.success("Vehicle price updated."); }, onError: (error: Error) => toast.error(error.message) });
  return <Card><CardHeader><CardTitle>Vehicle price</CardTitle><CardDescription>Add or correct a price, including past releases. Manual prices take precedence over store updates. Prices remain visible only to signed-in members, beside the stock label.</CardDescription></CardHeader><CardContent className="space-y-3">{query.isError ? <Button variant="outline" onClick={() => void query.refetch()}>Retry loading price</Button> : <fieldset disabled={query.isLoading || mutation.isPending} className="space-y-3"><div className="grid grid-cols-2 gap-3"><label className="space-y-1 text-xs">Amount<Input inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} placeholder="0.00" /></label><label className="space-y-1 text-xs">Currency<Input maxLength={3} value={currency} onChange={event => setCurrency(event.target.value.toUpperCase())} placeholder="USD" /></label></div><div className="flex flex-wrap gap-2"><Button size="sm" disabled={!normalizeListingPrice({ amount, currency })} onClick={() => mutation.mutate("save")}>{mutation.isPending ? "Saving…" : "Save price"}</Button><Button size="sm" variant="outline" onClick={() => mutation.mutate("hide")}>Hide price</Button><Button size="sm" variant="ghost" onClick={() => mutation.mutate("reset")}>Use recorded store price</Button></div></fieldset>}</CardContent></Card>;
}

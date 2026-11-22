export function normalizeHistorySearch(search: Record<string, unknown>) {
  const page = Number(search.page);
  return {
    q: typeof search.q === "string" ? search.q.slice(0, 200) : "",
    status:
      search.status === "in_stock" || search.status === "sold_out"
        ? search.status
        : ("all" as "all" | "in_stock" | "sold_out"),
    page: Number.isInteger(page) && page > 0 ? Math.min(page, 100_000) : 1,
  };
}

import { useQuery } from "@tanstack/react-query";
import { AdminOverviewResponse, apiFetch } from "@/lib/api";

export const ADMIN_OVERVIEW_KEY = ["admin-overview"] as const;

export function useAdminOverview() {
  return useQuery({
    queryKey: ADMIN_OVERVIEW_KEY,
    queryFn: () => apiFetch<AdminOverviewResponse>("/api/admin/overview"),
    staleTime: 120_000,
    refetchInterval: 300_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });
}

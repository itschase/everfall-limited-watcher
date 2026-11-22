import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch, SessionResponse } from "@/lib/api";

export const SESSION_QUERY_KEY = ["session"] as const;

export function useSession() {
  return useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: () => apiFetch<SessionResponse>("/api/session"),
    staleTime: 120_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

export function useSessionSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const syncSession = () => {
      void queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
    };

    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        syncSession();
      }
    };

    window.addEventListener("pageshow", handlePageShow);
    return () => {
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, [queryClient]);
}

export function useAuthActions(onSuccess?: (destination?: string) => void) {
  const queryClient = useQueryClient();
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const startLogin = async (options?: { refresh?: boolean; targetAfter?: string }) => {
    setIsLoggingIn(true);
    const inIframe = typeof window !== "undefined" && window.self !== window.top;

    if (!inIframe) {
      window.location.href = options?.refresh ? "/login?refresh=1" : "/login";
      return;
    }

    const popup = window.open("about:blank", "discord_oauth", "width=540,height=740");
    if (!popup) {
      window.location.href = options?.refresh ? "/login?refresh=1" : "/login";
      return;
    }

    const handleMessage = async (event: MessageEvent) => {
      if (event.data?.type !== "OAUTH_AUTH_SUCCESS") return;
      window.removeEventListener("message", handleMessage);
      try {
        if (event.data.handoff) {
          await apiFetch("/api/auth/handoff", {
            method: "POST",
            body: JSON.stringify({ handoff: event.data.handoff }),
          });
        }
        await queryClient.invalidateQueries();
        setIsLoggingIn(false);
        if (onSuccess) {
          onSuccess(options?.targetAfter || event.data.destination);
        }
      } catch (err: any) {
        setIsLoggingIn(false);
        toast.error(err?.message || "Failed to finish Discord authentication.");
      }
    };

    window.addEventListener("message", handleMessage);
    const timer = window.setInterval(() => {
      if (popup.closed) {
        window.clearInterval(timer);
        window.removeEventListener("message", handleMessage);
        setIsLoggingIn(false);
        void queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
      }
    }, 600);

    try {
      const data = await apiFetch<{ url: string }>("/api/auth/url");
      if (popup.closed) {
        window.clearInterval(timer);
        window.removeEventListener("message", handleMessage);
        setIsLoggingIn(false);
        return;
      }
      popup.location.href = data.url;
    } catch (err: any) {
      window.clearInterval(timer);
      window.removeEventListener("message", handleMessage);
      popup.close();
      setIsLoggingIn(false);
      toast.error(err?.message || "Discord OAuth is not available right now.");
    }
  };

  const logout = async () => {
    try {
      await fetch("/logout", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
      });
    } finally {
      queryClient.setQueryData(SESSION_QUERY_KEY, (old: any) =>
        old ? { ...old, authenticated: false, user: null } : old
      );
      queryClient.clear();
      window.location.replace("/");
    }
  };

  return { startLogin, logout, isLoggingIn };
}

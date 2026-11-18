export type BotStatus = "online" | "offline";

export interface SessionUser {
  id: string;
  username: string;
  avatarUrl: string;
  isAdmin: boolean;
}

export type MonitorLogSource = "manual" | "cron-fetch" | "scheduled" | "other";

export interface MonitorStatus {
  checkedAt: number;
  lastSuccessAt?: number;
  lastFetchCronSuccessAt?: number;
  lastSource?: MonitorLogSource;
  listingCount: number;
  authoritative: boolean;
  isChecking?: boolean;
  mode?: "fast" | "reduced";
  notice?: string;
}

export interface MonitorLogEntry {
  id: string;
  timestamp: number;
  source: MonitorLogSource;
  status: "success" | "blocked" | "error";
  httpStatus: number | null;
  cloudflareChallenge: boolean;
  authoritative: boolean;
  responseLength: number | null;
  targetUrl: string;
  listingCount: number;
  newDiscoveries: number;
  durationMs: number;
  message: string;
}

export interface SessionResponse {
  authenticated: boolean;
  user: SessionUser | null;
  appId: string;
  inviteUrl: string;
  creatorProfile: {
    id: string;
    username: string;
    avatarUrl: string;
    profileUrl: string;
  };
  botStatus: BotStatus;
  monitorStatus: MonitorStatus | null;
  publicOrigin: string;
}

export interface ListingItem {
  id: string;
  name: string;
  description: string;
  url: string;
  images: string[];
  isAvailable: boolean;
  detectedAt: number;
  lastVerifiedAt: number;
  soldOutAt: number | null;
  lastHttpStatus: number | null;
  readiness: "ready" | "incomplete";
}

export interface PublicListingsResponse {
  listings: ListingItem[];
  totalCount: number;
  availableCount: number;
  soldOutCount: number;
  hasMoreArchive: boolean;
  botStatus: BotStatus;
  monitorStatus: MonitorStatus | null;
  lastCheckedAt: number | null;
  lastSuccessAt: number | null;
}

export interface HistoryResponse {
  items: ListingItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  counts: {
    all: number;
    inStock: number;
    soldOut: number;
  };
  botStatus: BotStatus;
  monitorStatus: MonitorStatus | null;
}

export interface GuildChannelOption {
  id: string;
  name: string;
  type: number;
}

export interface GuildRoleOption {
  id: string;
  name: string;
  managed?: boolean;
}

export type ServerStatus = "active" | "setup_required" | "not_installed" | "offline";

export interface ManagedServer {
  id: string;
  name: string;
  iconUrl: string | null;
  isOwner: boolean;
  isInstalled: boolean;
  status: ServerStatus;
  statusReason: string;
  config: {
    channelId: string;
    channelName: string | null;
    channelMissing: boolean;
    roleIds: string[];
    environment: "production" | "test";
  };
  channels: GuildChannelOption[];
  roles: GuildRoleOption[];
  controlsError: string | null;
  inviteUrl: string;
}

export interface DashboardServersResponse {
  servers: ManagedServer[];
  appId: string;
  refreshedAt: number;
}

export interface EmbedConfig {
  color: string;
  titlePrefix: string;
  footerText: string;
  galleryHeading: string;
  storeButtonLabel: string;
  soldOutButtonLabel: string;
  showDetectionTime: boolean;
  showLastVerified: boolean;
}

export interface DeliveryLogEntry {
  id: string;
  listingId: string;
  listingName: string;
  guildId: string;
  channelId: string;
  messageId?: string;
  method: "auto" | "manual" | "test" | "setup";
  environment: "production" | "test";
  status: "delivered" | "failed" | "updated";
  httpStatus?: number;
  error?: string;
  timestamp: number;
}

export interface AdminConnectedGuild {
  id: string;
  name: string;
  iconUrl: string | null;
  memberCount: number | null;
  inBotGuilds: boolean;
  channelId: string;
  roleIds: string[];
  environment: "production" | "test";
  configured: boolean;
  sentListingIds: Record<string, boolean>;
}

export interface AdminOverviewResponse {
  botStatus: BotStatus;
  monitorStatus: MonitorStatus | null;
  monitorLogs: MonitorLogEntry[];
  embedConfig: EmbedConfig;
  deliveryLogs: DeliveryLogEntry[];
  connectedGuilds: AdminConnectedGuild[];
  listings: ListingItem[];
  stats: {
    totalListings: number;
    availableListings: number;
    soldOutListings: number;
    connectedServers: number;
    configuredServers: number;
    testServers: number;
    recentFailures: number;
  };
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "same-origin",
    cache: "no-store",
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers || {}),
    },
  });

  const text = await res.text();
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }

  if (!res.ok) {
    const message = parsed?.error || parsed?.message || `Request failed (${res.status})`;
    throw new ApiError(message, res.status);
  }

  return parsed as T;
}

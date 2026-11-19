import type {
  EmojiReference,
  ExtractedVehicleMetadata,
  FeatureIconName,
  FeatureSurface,
  NormalizedListingPresentation,
  VehicleFeature,
  VehicleMetadataOverride,
} from "../../shared/features";
import type {
  AnnouncementTemplate,
  DiscordEmojiRef,
  HeroAnimationStyle,
  HeroConfig,
  HeroMessageItem,
  PresentationConfigBundle,
  WidgetTemplateConfig,
} from "../../shared/presentation";

export type {
  EmojiReference,
  ExtractedVehicleMetadata,
  FeatureIconName,
  FeatureSurface,
  NormalizedListingPresentation,
  VehicleFeature,
  VehicleMetadataOverride,
  AnnouncementTemplate,
  DiscordEmojiRef,
  HeroAnimationStyle,
  HeroConfig,
  HeroMessageItem,
  PresentationConfigBundle,
  WidgetTemplateConfig,
};

export type BotStatus = "online" | "offline";

export interface BotHealthSnapshot {
  verified: boolean;
  online: boolean;
  checkedAt: number;
  appId?: string;
  botUsername?: string;
  error?: string;
}

export interface MonitorHealth {
  state: "verification_successful" | "verification_blocked" | "data_stale" | "monitoring_pending";
  label: string;
}

export interface SessionUser {
  id: string;
  username: string;
  avatarUrl: string;
  isAdmin: boolean;
}

export type MonitorLogSource = "manual" | "cron-fetch" | "scrapling" | "scheduled" | "other";

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
  catalogVersion?: number;
  listingSummary?: {
    total: number;
    available: number;
    soldOut: number;
  };
}

export interface MonitorLogAttempt {
  url: string;
  httpStatus: number | null;
  cloudflareChallenge: boolean;
  responseLength: number | null;
  durationMs: number;
  note?: string;
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
  detectedListingIds?: string[];
  detectedListingNames?: string[];
  soldOutListingIds?: string[];
  dispatchedDrops?: number;
  preservedHistoryCount?: number;
  runner?: string;
  workflowRunUrl?: string;
  attempts?: MonitorLogAttempt[];
}

export interface CreatorProfile {
  id: string;
  username: string;
  avatarUrl: string;
  profileUrl: string;
}

export interface SessionResponse {
  authenticated: boolean;
  user: SessionUser | null;
  appId: string;
  inviteUrl: string;
  creatorProfile: CreatorProfile;
  botStatus: BotStatus;
  botHealth?: BotHealthSnapshot;
  monitorStatus: MonitorStatus | null;
  monitorHealth?: MonitorHealth;
  scheduledIntervalMs?: number;
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
  presentation?: NormalizedListingPresentation;
}

export interface PublicListingsResponse {
  listings: ListingItem[];
  catalogVersion?: number;
  totalCount: number;
  availableCount: number;
  soldOutCount: number;
  hasMoreArchive: boolean;
  botStatus: BotStatus;
  botHealth?: BotHealthSnapshot;
  monitorStatus: MonitorStatus | null;
  monitorHealth?: MonitorHealth;
  scheduledIntervalMs?: number;
  lastCheckedAt: number | null;
  lastSuccessAt: number | null;
  hero?: HeroConfig;
}

export interface PublicStatusResponse {
  ok: boolean;
  botStatus: BotStatus;
  botHealth?: BotHealthSnapshot;
  monitorStatus: MonitorStatus | null;
  monitorHealth?: MonitorHealth;
  scheduledIntervalMs?: number;
  lastCheckedAt: number | null;
  lastSuccessAt: number | null;
  authoritative: boolean | null;
  catalogVersion: number;
  totalCount: number;
  availableCount: number;
  soldOutCount: number;
  hero?: HeroConfig;
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
  botHealth?: BotHealthSnapshot;
  monitorStatus: MonitorStatus | null;
  monitorHealth?: MonitorHealth;
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
    widgetTemplateId?: string;
  };
  widgets: WidgetDeployment[];
  channels: GuildChannelOption[];
  roles: GuildRoleOption[];
  controlsError: string | null;
  inviteUrl: string;
}

export interface DashboardServersResponse {
  servers: ManagedServer[];
  appId: string;
  publicOrigin?: string;
  widgetDefault?: WidgetTemplateConfig;
  widgetTemplates?: WidgetTemplateConfig[];
  previewListings?: ListingItem[];
  monitorStatus?: MonitorStatus | null;
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

export interface SentListingMessageMeta {
  listingId: string;
  channelId: string;
  messageId?: string;
  sentAt: number;
  updatedAt?: number;
  updatedSoldOutAt?: number;
  isSoldOutRendered?: boolean;
}

export interface WidgetSyncHistoryEntry {
  timestamp: number;
  status: "ok" | "error" | "skipped";
  httpStatus?: number;
  error?: string;
  trigger: string;
  contentHash?: string;
}

export interface WidgetDeployment {
  id: string;
  guildId: string;
  channelId: string;
  messageId: string;
  deployedAt: number;
  deployedBy?: string;
  deployedByUsername?: string;
  lastSyncedAt?: number;
  lastAttemptedSyncAt?: number;
  lastSyncStatus?: "ok" | "error" | "skipped";
  lastSyncError?: string;
  templateId?: string;
  customTemplate?: WidgetTemplateConfig | null;
  configVersion?: number;
  lastCatalogVersion?: number;
  lastContentHash?: string;
  history?: WidgetSyncHistoryEntry[];
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
  widgetTemplateId?: string;
  sentListingIds: Record<string, boolean>;
  sentMessages?: Record<string, SentListingMessageMeta>;
  widget?: WidgetDeployment | null;
  widgets?: WidgetDeployment[];
}

export interface ListingImageSlot {
  index: number;
  exists: boolean;
  storage: "r2" | "kv" | "external" | "empty";
  size: number;
  contentType: string;
  etag: string | null;
  url: string | null;
  sourceUrl: string | null;
}

export interface ListingImagesResponse {
  ok: boolean;
  listingId: string;
  listingName: string;
  isAvailable: boolean;
  slots: ListingImageSlot[];
  payloadUrls: string[];
  r2Bound: boolean;
}

export interface AdminOverviewResponse {
  botStatus: BotStatus;
  botHealth?: BotHealthSnapshot;
  catalogVersion?: number;
  monitorStatus: MonitorStatus | null;
  monitorHealth?: MonitorHealth;
  scheduledIntervalMs?: number;
  monitorLogs: MonitorLogEntry[];
  embedConfig: EmbedConfig;
  presentationConfig?: PresentationConfigBundle;
  deliveryLogs: DeliveryLogEntry[];
  connectedGuilds: AdminConnectedGuild[];
  widgets?: WidgetDeployment[];
  listings: ListingItem[];
  stats: {
    totalListings: number;
    availableListings: number;
    soldOutListings: number;
    connectedServers: number;
    configuredServers: number;
    testServers: number;
    deployedWidgets?: number;
    recentFailures: number;
  };
}

export interface AdminMonitorUpdatesResponse {
  changed: boolean;
  botStatus: BotStatus;
  botHealth?: BotHealthSnapshot;
  checkedAt?: number | null;
  catalogVersion?: number;
  monitorStatus?: MonitorStatus | null;
  monitorHealth?: MonitorHealth;
  monitorLogs?: MonitorLogEntry[];
  listings?: ListingItem[];
}

export interface BotCommandOptionDef {
  name: string;
  description: string;
  type: number;
  required?: boolean;
}

export interface BotCommandComparison {
  name: string;
  type?: number;
  description: string;
  defaultMemberPermissions: string | null;
  integrationTypes?: number[];
  contexts?: number[];
  options: BotCommandOptionDef[];
  syncState: "synced" | "outdated" | "missing";
  liveId: string | null;
  liveVersion: string | null;
  liveDescription: string | null;
  diffReason: string | null;
}

export interface BotCommandSyncRecord {
  syncedAt: number;
  syncedBy: string;
  scope: "global" | "guild";
  guildId?: string;
  ok: boolean;
  httpStatus: number;
  commandCount: number;
  commandNames: string[];
  error?: string;
}

export type BotCommandSyncMeta = BotCommandSyncRecord & {
  lastSuccess?: BotCommandSyncRecord | null;
  lastFailure?: BotCommandSyncRecord | null;
};

export interface GuildCommandAvailabilityItem {
  guildId: string;
  guildName: string;
  hasCommandsScope: boolean;
  httpStatus: number;
  guildCommandCount: number;
  widgetStatus:
    | "available_global"
    | "available_guild"
    | "duplicate_conflict"
    | "missing_scope"
    | "missing_command"
    | "error";
  detail: string;
  guildCommandNames: string[];
  hasDuplicateWidget?: boolean;
  hasStaleGuildOverrides?: boolean;
  guildWidgetOutdated?: boolean;
}

export interface BotReadinessCheck {
  id: string;
  label: string;
  category: "registration" | "execution" | "availability";
  status: "pass" | "warn" | "fail";
  summary: string;
  remediation?: string;
}

export interface AdminBotStateResponse {
  ok: boolean;
  botStatus: BotStatus;
  botHealth?: BotHealthSnapshot;
  identity: {
    ok: boolean;
    appId: string;
    envAppId?: string;
    appIdMismatch?: boolean;
    botUser: {
      id: string;
      username: string;
      globalName: string | null;
      avatarUrl: string | null;
    } | null;
    application: {
      id: string;
      name: string;
      description: string;
      interactionsEndpointUrl: string | null;
      botPublic?: boolean | null;
      installScopes?: string[];
      guildInstallScopes?: string[];
      hasGuildCommandsInstallScope?: boolean | null;
    } | null;
    error?: string;
  };
  liveCommandsOk: boolean;
  liveCommandsError: string | null;
  totalLocalCommands: number;
  totalRemoteCommands: number;
  comparisons: BotCommandComparison[];
  extraRemoteCommands: Array<{ id: string; name: string; description: string }>;
  syncedCount: number;
  missingCount: number;
  outdatedCount: number;
  allInSync: boolean;
  syncMeta: BotCommandSyncMeta | null;
  availability?: GuildCommandAvailabilityItem[] | null;
  readinessChecks?: BotReadinessCheck[];
  guilds?: Array<{
    id: string;
    name: string;
    inviteUrl: string;
  }>;
  environment: {
    botTokenConfigured: boolean;
    publicKeyConfigured: boolean;
    clientSecretConfigured: boolean;
    kvBound: boolean;
    r2Bound: boolean;
    publicOrigin: string;
    interactionsUrl: string;
  };
  counts: {
    connectedServers: number;
    deployedWidgets: number;
  };
}

export interface BotRefreshResponse {
  ok: boolean;
  refreshedAt: number;
  error?: string | null;
  steps: {
    commands: { ran: boolean; ok: boolean; count: number; error?: string };
    guilds: { ran: boolean; count: number };
    widgets: { ran: boolean; refreshed: number; skipped?: number; failed: number };
    caches: { ran: boolean };
  };
  botState: AdminBotStateResponse;
}

export interface AdminEmojisResponse {
  ok: boolean;
  botOnline: boolean;
  appId: string;
  applicationEmojis: DiscordEmojiRef[];
  guildEmojis: DiscordEmojiRef[];
  recentEmojis: DiscordEmojiRef[];
  errors?: string[];
}

export interface PresentationBundleResponse {
  ok: boolean;
  bundle: PresentationConfigBundle;
  widgetRefresh?: { refreshed: number; skipped: number; failed: number } | null;
  savedAt?: number;
}

export interface AdminWidgetsResponse {
  ok: boolean;
  widgets: WidgetDeployment[];
  guilds: Array<{
    id: string;
    name: string;
    inBotGuilds: boolean;
    alertChannelId: string;
    widgetTemplateId: string;
    channels: GuildChannelOption[];
  }>;
  widgetDefault: WidgetTemplateConfig;
  widgetTemplates: WidgetTemplateConfig[];
  configVersion: number;
}

export interface BulkEditResultItem {
  guildId: string;
  listingId: string;
  listingName?: string;
  ok: boolean;
  skippedNotSent?: boolean;
  messageId?: string;
  channelId?: string;
  error?: string;
}

export interface DispatchEditResponse {
  ok: boolean;
  scope: "listing" | "bulk";
  results: BulkEditResultItem[];
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
  deliveryLogs: DeliveryLogEntry[];
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

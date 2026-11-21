import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Award,
  Bell,
  Bot,
  CarFront,
  CheckCircle2,
  Clock,
  Cpu,
  Database,
  Eye,
  FileText,
  Flame,
  Gauge,
  Globe,
  HardDrive,
  History,
  Images,
  Info,
  Layers,
  LayoutDashboard,
  LayoutPanelTop,
  Lock,
  Megaphone,
  Radio,
  RefreshCw,
  Scale,
  Send,
  Server,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Star,
  Terminal,
  Users,
  Wrench,
  Zap,
} from "lucide-react";
import { sanitizeSiteIconKey, type SiteIconKey } from "../../../shared/icons";

const SITE_ICON_MAP: Record<Exclude<SiteIconKey, "none">, LucideIcon> = {
  bell: Bell,
  megaphone: Megaphone,
  radio: Radio,
  send: Send,
  zap: Zap,
  "car-front": CarFront,
  gauge: Gauge,
  flame: Flame,
  star: Star,
  award: Award,
  images: Images,
  eye: Eye,
  sparkles: Sparkles,
  "layout-panel-top": LayoutPanelTop,
  "layout-dashboard": LayoutDashboard,
  "sliders-horizontal": SlidersHorizontal,
  layers: Layers,
  bot: Bot,
  users: Users,
  terminal: Terminal,
  server: Server,
  activity: Activity,
  clock: Clock,
  "refresh-cw": RefreshCw,
  history: History,
  wrench: Wrench,
  database: Database,
  "hard-drive": HardDrive,
  cpu: Cpu,
  globe: Globe,
  "shield-check": ShieldCheck,
  "check-circle-2": CheckCircle2,
  lock: Lock,
  "file-text": FileText,
  scale: Scale,
  info: Info,
};

export function SiteIcon({
  name,
  fallback = "sparkles",
  className,
  strokeWidth,
}: {
  name?: SiteIconKey | string | null;
  fallback?: SiteIconKey;
  className?: string;
  strokeWidth?: number;
}) {
  const key = sanitizeSiteIconKey(name, fallback);
  if (key === "none") return null;
  const IconComponent = SITE_ICON_MAP[key] || SITE_ICON_MAP[fallback === "none" ? "sparkles" : fallback] || Sparkles;
  return <IconComponent className={className} strokeWidth={strokeWidth} />;
}

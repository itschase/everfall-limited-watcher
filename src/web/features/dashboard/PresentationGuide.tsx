import { useId, useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowRight,
  Database,
  FileSearch,
  PanelsTopLeft,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { VehicleCard } from "@/components/listings/VehicleCard";
import {
  WidgetPreviewCard,
  buildWidgetPreviewPayload,
} from "@/components/discord/DiscordMessagePreview";
import type {
  ListingItem,
  MonitorStatus,
  WidgetTemplateConfig,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Annotation = { key: string; title: string; text: string };

function AnnotatedPreview({
  annotations,
  children,
}: {
  annotations: Annotation[];
  children: ReactNode;
}) {
  const [selected, setSelected] = useState(annotations[0]?.key || "");
  const id = useId();
  return (
    <div className="grid min-w-0 gap-5 @3xl/main:grid-cols-2">
      <div className="min-w-0" data-highlight={selected}>
        <div className="[&_[data-preview-region]]:transition-shadow">
          <style>
            {annotations
              .map(
                ({ key }) =>
                  `[data-highlight="${key}"] [data-preview-region="${key}"] { outline: 2px solid #FAFAFA; outline-offset: -2px; border-radius: 6px; }`,
              )
              .join("\n")}
          </style>
          {children}
        </div>
      </div>
      <div className="space-y-2" aria-label="Preview explanations">
        <p className="mb-3 text-xs text-muted-foreground">
          Select an explanation to highlight that area. Formatting is managed
          centrally.
        </p>
        {annotations.map((item, index) => (
          <Button
            key={item.key}
            variant="outline"
            className={`h-auto w-full items-start justify-start whitespace-normal p-3 text-left ${selected === item.key ? "border-foreground/50 bg-secondary" : ""}`}
            aria-pressed={selected === item.key}
            aria-label={item.title}
            aria-describedby={`${id}-${item.key}`}
            onFocus={() => setSelected(item.key)}
            onClick={() => setSelected(item.key)}
          >
            <span className="mr-2 text-xs text-muted-foreground">
              {index + 1}
            </span>
            <span>
              <span className="block text-sm font-medium">{item.title}</span>
              <span
                id={`${id}-${item.key}`}
                className="mt-1 block text-xs font-normal leading-relaxed text-muted-foreground"
              >
                {item.text}
              </span>
            </span>
          </Button>
        ))}
      </div>
    </div>
  );
}

export function WidgetPresentationGuide(props: {
  template: WidgetTemplateConfig;
  listings: ListingItem[];
  monitorStatus: MonitorStatus | null;
  portalOrigin?: string;
}) {
  const payload = buildWidgetPreviewPayload(props);
  const embed = payload.embeds?.[0];
  const annotations: Annotation[] = [
    {
      key: "widget-heading",
      title: "Widget heading",
      text: "The configured title identifies this shared stock overview.",
    },
    ...(embed?.description || embed?.fields?.length
      ? [
          {
            key: "widget-content",
            title: "Stock and recent vehicles",
            text: "The saved catalog supplies availability and vehicle details. Enabled summaries, monitoring information, and recent listings follow the centrally configured order. A failed check does not mean sold out.",
          },
        ]
      : []),
    ...(embed?.image?.url
      ? [
          {
            key: "widget-image",
            title: "Featured image",
            text: "The configured image slot supplies a vehicle image when one is available.",
          },
        ]
      : []),
    ...(embed?.footer?.text
      ? [
          {
            key: "widget-footer",
            title: "Footer and time",
            text: "The configured footer and optional timestamp provide context for the widget update. An update time is different from a verified store check.",
          },
        ]
      : []),
    ...(payload.components?.[0]?.components?.length
      ? [
          {
            key: "widget-links",
            title: "Destination links",
            text: "Configured buttons lead members to the website and store.",
          },
        ]
      : []),
  ];
  return (
    <Card className="space-y-4 p-4 sm:p-5">
      <div>
        <h4 className="font-semibold">What your members will see</h4>
        <p className="mt-1 text-xs text-muted-foreground">
          Preview from the current catalog. Stock, timestamps, and imagery may
          change before deployment.
        </p>
      </div>
      {!props.listings.length && (
        <p role="status" className="text-sm text-muted-foreground">
          No catalog vehicles are available. The preview shows the configured
          empty state.
        </p>
      )}
      <AnnotatedPreview annotations={annotations}>
        <WidgetPreviewCard {...props} />
      </AnnotatedPreview>
    </Card>
  );
}

const cardAnnotations: Annotation[] = [
  {
    key: "vehicle-title",
    title: "Vehicle name and listing ID",
    text: "The store name is normalized for display. Approved central corrections take precedence. The package ID keeps the listing tied to its source.",
  },
  {
    key: "vehicle-images",
    title: "Vehicle gallery",
    text: "Available listing images appear in the gallery. Missing or unavailable images use the standard fallback.",
  },
  {
    key: "vehicle-stock",
    title: "Stock status",
    text: "Availability comes from verified store results. Failed, blocked, or unrecognized checks preserve the last verified state rather than marking vehicles sold out.",
  },
  {
    key: "vehicle-price",
    title: "Recorded price, when available",
    text: "Signed-in members can see a recorded store price for available vehicles when one has been captured. A missing price is omitted; it is never treated as zero.",
  },
  {
    key: "vehicle-features",
    title: "Normalized features",
    text: "Listing text becomes consistent feature labels and ordering. Approved central corrections and visibility rules determine which features appear.",
  },
  {
    key: "vehicle-times",
    title: "Recorded and checked times",
    text: "First Recorded tracks discovery. Last Checked tracks verification. Neither promises continuous or instant monitoring.",
  },
  {
    key: "vehicle-links",
    title: "Store destination",
    text: "Available vehicles link to their source listing. Sold-out cards show their availability state instead of a purchase action.",
  },
];

const steps = [
  {
    icon: FileSearch,
    title: "Store listing",
    text: "Vehicle names, descriptions, images, links, and any captured prices start with the Everfall store.",
  },
  {
    icon: ShieldCheck,
    title: "Extract and validate",
    text: "Recognized store results establish availability. Blocked or failed checks cannot replace verified stock with a sold-out result.",
  },
  {
    icon: Database,
    title: "Normalize and preserve",
    text: "Package IDs connect updates to listing history. Text and prices become consistent data, while recorded history is retained.",
  },
  {
    icon: SlidersHorizontal,
    title: "Apply approved presentation",
    text: "Central corrections, feature labels, visibility rules, and templates shape how each surface displays the catalog.",
  },
  {
    icon: PanelsTopLeft,
    title: "Deliver to members",
    text: "Website cards show individual vehicles. Discord announcements report listing updates; live widgets summarize stock in managed channels.",
  },
];

export function VehicleCardsGuide({ listings }: { listings: ListingItem[] }) {
  const [listingId, setListingId] = useState(listings[0]?.id || "");
  const listing = listings.find((item) => item.id === listingId) || listings[0];
  const selectId = useId();
  return (
    <div className="space-y-5 pt-4">
      <div>
        <h4 className="font-semibold">Vehicle Cards</h4>
        <p className="mt-1 text-sm text-muted-foreground">
          Explore the published format and follow a vehicle from its store
          listing to your community.
        </p>
      </div>
      {listing ? (
        <Card className="space-y-4 p-4 sm:p-5">
          <div className="max-w-sm space-y-2">
            <Label htmlFor={selectId}>Preview vehicle</Label>
            <Select value={listing.id} onValueChange={setListingId}>
              <SelectTrigger id={selectId}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {listings.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.presentation?.effective.name || item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <AnnotatedPreview annotations={cardAnnotations}>
            <VehicleCard key={listing.id} listing={listing} />
          </AnnotatedPreview>
        </Card>
      ) : (
        <Card className="p-5 text-sm text-muted-foreground" role="status">
          No vehicles are available for preview yet. The data flow below
          explains how future listings are processed.
        </Card>
      )}
      <section aria-label="From store to members" className="space-y-3">
        <h4 className="font-semibold">From store to members</h4>
        <ol className="grid gap-3 @5xl/main:grid-cols-5">
          {steps.map((step, index) => (
            <li key={step.title} className="relative min-w-0">
              <Card className="h-full space-y-3 p-4">
                <step.icon className="h-5 w-5 text-muted-foreground" />
                <h5 className="text-sm font-semibold">
                  {index + 1}. {step.title}
                </h5>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {step.text}
                </p>
                {index < steps.length - 1 && (
                  <>
                    <ArrowDown
                      aria-hidden
                      className="h-4 w-4 text-muted-foreground @5xl/main:hidden"
                    />
                    <ArrowRight
                      aria-hidden
                      className="hidden h-4 w-4 text-muted-foreground @5xl/main:block"
                    />
                  </>
                )}
              </Card>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

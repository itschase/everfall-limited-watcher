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
import {
  AnnouncementPreviewCard,
  buildAnnouncementPreviewPayload,
  WidgetPreviewCard,
  buildWidgetPreviewPayload,
} from "@/components/discord/DiscordMessagePreview";
import type {
  PublicPresentationResponse,
  ListingItem,
  MonitorStatus,
  WidgetTemplateConfig,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
    title: "Deliver to your server",
    text: "Discord vehicle announcements use the configured in-stock or sold-out format in your notification channel. Live widgets provide a separate stock overview.",
  },
];

export function VehicleCardsGuide({
  listings,
  announcements,
  monitorStatus,
  portalOrigin,
}: {
  listings: ListingItem[];
  announcements?: PublicPresentationResponse["announcements"];
  monitorStatus: MonitorStatus | null;
  portalOrigin?: string;
}) {
  const [listingId, setListingId] = useState(listings[0]?.id || "");
  const listing = listings.find((item) => item.id === listingId) || listings[0];
  const selectId = useId();
  const [exampleMode, setExampleMode] = useState<
    "in_stock" | "sold_out" | null
  >(null);
  const mode = exampleMode || (listing?.isAvailable ? "in_stock" : "sold_out");
  const template = announcements?.[mode === "in_stock" ? "inStock" : "soldOut"];
  const previewProps =
    listing && template
      ? { mode, template, listing, monitorStatus, portalOrigin }
      : null;
  const payload = previewProps
    ? buildAnnouncementPreviewPayload(previewProps)
    : null;
  const components =
    payload?.components?.find((component: any) => component.type === 17)
      ?.components || [];
  const annotations: Annotation[] = components.flatMap(
    (component: any, index: number) => {
      const key = "announcement-" + index;
      if (component.type === 10)
        return [
          {
            key,
            title: "Vehicle announcement and availability",
            text: "The configured message combines the vehicle name, verified stock state, normalized features, description, and enabled timing information. Approved central corrections and the selected announcement format determine what appears. Failed checks preserve the last verified stock state.",
          },
        ];
      if (component.type === 12 && component.items?.length)
        return [
          {
            key,
            title: "Discord image gallery",
            text: "Listing images are arranged using the announcement’s configured image slots. Only available images are included.",
          },
        ];
      if (component.type === 1 && component.components?.length)
        return [
          {
            key,
            title: "Member action links",
            text: "The configured buttons take members to the listing, store, or website. Availability and the chosen announcement format determine the labels and destinations.",
          },
        ];
      return [];
    },
  );
  return (
    <div className="space-y-5 pt-4">
      <div>
        <h4 className="font-semibold">Vehicle Cards</h4>
        <p className="mt-1 text-sm text-muted-foreground">
          Preview the Discord vehicle announcement your members receive and
          follow its data from the store to your server.
        </p>
      </div>
      {listing ? (
        <Card className="space-y-4 p-4 sm:p-5">
          <div className="max-w-sm space-y-2">
            <Label htmlFor={selectId}>Preview vehicle</Label>
            <Select
              value={listing.id}
              onValueChange={(value) => {
                setListingId(value);
                setExampleMode(null);
              }}
            >
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
          <Tabs
            value={mode}
            onValueChange={(value) =>
              setExampleMode(value as "in_stock" | "sold_out")
            }
          >
            <TabsList className="h-auto flex-wrap">
              <TabsTrigger value="in_stock">In stock announcement</TabsTrigger>
              <TabsTrigger value="sold_out">Sold out update</TabsTrigger>
            </TabsList>
            <TabsContent value={mode} className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Read-only Discord embed preview using the published announcement
                format. Switching examples does not change stock or send a
                message.{" "}
                {mode !== (listing.isAvailable ? "in_stock" : "sold_out")
                  ? "This example differs from the vehicle’s current recorded stock state."
                  : "Showing the vehicle’s current recorded stock state."}
              </p>
              {previewProps ? (
                <AnnotatedPreview
                  key={listing.id + mode}
                  annotations={annotations}
                >
                  <AnnouncementPreviewCard {...previewProps} />
                </AnnotatedPreview>
              ) : (
                <p role="status" className="text-sm text-muted-foreground">
                  The announcement format is unavailable. Refresh servers to
                  load the current format.
                </p>
              )}
            </TabsContent>
          </Tabs>
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

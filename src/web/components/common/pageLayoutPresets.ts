import type {
  PageLayoutSpacing,
  PageSectionAlignment,
  PageSurfaceStyle,
} from "../../../shared/presentation";

export function getSpacingClasses(spacing?: PageLayoutSpacing): {
  heroPadding: string;
  sectionPadding: string;
  stackGap: string;
} {
  switch (spacing) {
    case "compact":
      return {
        heroPadding: "py-8 sm:py-12",
        sectionPadding: "py-8 sm:py-10",
        stackGap: "space-y-6",
      };
    case "spacious":
      return {
        heroPadding: "py-16 sm:py-24",
        sectionPadding: "py-14 sm:py-20",
        stackGap: "space-y-10",
      };
    case "standard":
    default:
      return {
        heroPadding: "py-12 sm:py-20",
        sectionPadding: "py-10 sm:py-14",
        stackGap: "space-y-8",
      };
  }
}

export function getSurfaceCardClass(surface?: PageSurfaceStyle): string {
  switch (surface) {
    case "subtle":
      return "border-border/60 bg-zinc-950/60";
    case "bordered":
      return "border-zinc-700/80 bg-zinc-950";
    case "elevated":
    default:
      return "border-border bg-card";
  }
}

export function getHeaderAlignmentClasses(alignment?: PageSectionAlignment): {
  container: string;
  ctaRow: string;
} {
  if (alignment === "left") {
    return {
      container: "text-left",
      ctaRow: "justify-start",
    };
  }
  return {
    container: "text-center",
    ctaRow: "justify-center",
  };
}

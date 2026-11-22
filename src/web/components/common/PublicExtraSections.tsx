import { PublicContentSection } from "../../../shared/pageSections";
import { SiteIcon } from "./SiteIcon";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function PublicExtraSections({
  sections = [],
  previewMode,
}: {
  sections?: PublicContentSection[];
  previewMode?: boolean;
}) {
  return (
    <>
      {sections
        .filter((section) => section.enabled)
        .map((section) => (
          <section
            key={section.id}
            className={cn(
              "mx-auto w-full px-4 sm:px-6",
              section.contentWidth === "wide" ? "max-w-7xl" : "max-w-5xl",
              section.spacing === "compact"
                ? "py-4"
                : section.spacing === "spacious"
                  ? "py-12"
                  : "py-8",
            )}
          >
            <div
              className={cn(
                "rounded-xl p-4 sm:p-5",
                section.alignment === "center" && "text-center",
                section.style === "bordered"
                  ? "border border-border"
                  : section.style === "elevated"
                    ? "border border-border bg-card"
                    : "bg-muted/40",
              )}
            >
              <SiteIcon
                name={section.icon}
                className={cn(
                  "mb-3",
                  section.iconSize === "small"
                    ? "h-4 w-4"
                    : section.iconSize === "large"
                      ? "h-8 w-8"
                      : "h-5 w-5",
                  section.alignment === "center" && "mx-auto",
                )}
              />
              <h2 className="text-xl font-semibold tracking-tight">
                {section.title}
              </h2>
              <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
                {section.body.split(/\n\s*\n/).map((paragraph, index) => (
                  <p key={index} className="whitespace-pre-line break-words">
                    {paragraph}
                  </p>
                ))}
              </div>
              {section.buttonLabel && section.buttonUrl && (
                <Button
                  asChild
                  className="mt-4"
                  variant={
                    section.buttonStyle === "primary" ? "default" : "outline"
                  }
                >
                  {previewMode ? (
                    <span>{section.buttonLabel}</span>
                  ) : (
                    <a href={section.buttonUrl}>{section.buttonLabel}</a>
                  )}
                </Button>
              )}
            </div>
          </section>
        ))}
    </>
  );
}

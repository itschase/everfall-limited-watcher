import {
  PublicPageExtensions,
  PublicContentSection,
} from "../../../shared/pageSections";
import { ArrowDown, ArrowUp, Copy, RotateCcw, Trash2 } from "lucide-react";
import { IconPicker } from "@/components/common/IconPicker";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

export function PageExtensionsEditor({
  page,
  onChange,
}: {
  page: PublicPageExtensions;
  onChange: (patch: PublicPageExtensions) => void;
}) {
  const sections = page.extraSections || [];
  const patch = (index: number, changes: Partial<PublicContentSection>) =>
    onChange({
      extraSections: sections.map((item, i) =>
        i === index ? { ...item, ...changes } : item,
      ),
    });
  const move = (index: number, delta: number) => {
    const next = [...sections];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    onChange({ extraSections: next });
  };
  const fresh = (): PublicContentSection => ({
    id: crypto.randomUUID(),
    title: "New section",
    body: "",
    icon: "none",
    enabled: true,
    buttonLabel: "",
    buttonUrl: "",
    alignment: "left",
    style: "subtle",
    spacing: "standard",
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Buttons & additional sections</CardTitle>
        <CardDescription>
          Use structured paragraphs, information cards, or CTAs. Leave a
          destination blank to keep the default. Sections appear after the
          built-in content.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 @2xl/main:grid-cols-2">
          <label className="space-y-1 text-sm">
            Primary button destination
            <Input
              value={page.primaryCtaUrl || ""}
              onChange={(event) =>
                onChange({ primaryCtaUrl: event.target.value })
              }
              placeholder="Default, /path, or https://…"
            />
          </label>
          <label className="space-y-1 text-sm">
            Secondary button destination
            <Input
              value={page.secondaryCtaUrl || ""}
              onChange={(event) =>
                onChange({ secondaryCtaUrl: event.target.value })
              }
              placeholder="Default, /path, or https://…"
            />
          </label>
        </div>
        {sections.map((section, index) => (
          <details
            key={section.id}
            className="rounded-lg border border-border p-3"
            open={undefined}
          >
            <summary className="cursor-pointer break-words text-sm font-medium">
              {index + 1}. {section.title || "Untitled section"}
              {!section.enabled && " (Hidden)"}
            </summary>
            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <label className="mr-auto flex items-center gap-2 text-xs">
                  Enabled
                  <Switch
                    checked={section.enabled}
                    onCheckedChange={(enabled) => patch(index, { enabled })}
                  />
                </label>
                <Button
                  size="icon"
                  variant="outline"
                  aria-label="Move section up"
                  disabled={!index}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp />
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  aria-label="Move section down"
                  disabled={index === sections.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown />
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  aria-label="Duplicate section"
                  disabled={sections.length >= 16}
                  onClick={() =>
                    onChange({
                      extraSections: [
                        ...sections.slice(0, index + 1),
                        {
                          ...section,
                          id: crypto.randomUUID(),
                          title: `${section.title} copy`,
                        },
                        ...sections.slice(index + 1),
                      ],
                    })
                  }
                >
                  <Copy />
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  aria-label="Reset section"
                  onClick={() => patch(index, { ...fresh(), id: section.id })}
                >
                  <RotateCcw />
                </Button>
                <Button
                  size="icon"
                  variant="destructive"
                  aria-label="Remove section"
                  onClick={() =>
                    onChange({
                      extraSections: sections.filter((_, i) => i !== index),
                    })
                  }
                >
                  <Trash2 />
                </Button>
              </div>
              <label className="block space-y-1 text-sm">
                Section title
                <Input
                  value={section.title}
                  maxLength={160}
                  onChange={(event) =>
                    patch(index, { title: event.target.value })
                  }
                />
              </label>
              <label className="block space-y-1 text-sm">
                Paragraphs
                <textarea
                  className="w-full rounded-md border border-input bg-background p-3 text-sm"
                  rows={4}
                  maxLength={2400}
                  value={section.body}
                  onChange={(event) =>
                    patch(index, { body: event.target.value })
                  }
                />
              </label>
              <IconPicker
                value={section.icon}
                fallback="none"
                onChange={(icon) => patch(index, { icon })}
              />
              <div className="grid gap-3 @2xl/main:grid-cols-2">
                <label className="space-y-1 text-sm">
                  Button label
                  <Input
                    value={section.buttonLabel}
                    maxLength={60}
                    onChange={(event) =>
                      patch(index, { buttonLabel: event.target.value })
                    }
                  />
                </label>
                <label className="space-y-1 text-sm">
                  Button destination
                  <Input
                    value={section.buttonUrl}
                    onChange={(event) =>
                      patch(index, { buttonUrl: event.target.value })
                    }
                    placeholder="/path or https://…"
                  />
                </label>
              </div>
              <div className="flex flex-wrap gap-3">
                {(["alignment", "style", "spacing"] as const).map((key) => (
                  <label key={key} className="space-y-1 text-xs capitalize">
                    {key}
                    <select
                      className="ml-2 rounded-md border border-input bg-background p-2"
                      value={section[key]}
                      onChange={(event) =>
                        patch(index, { [key]: event.target.value })
                      }
                    >
                      {(key === "alignment"
                        ? ["left", "center"]
                        : key === "style"
                          ? ["subtle", "bordered", "elevated"]
                          : ["compact", "standard", "spacious"]
                      ).map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </div>
          </details>
        ))}
        <Button
          variant="secondary"
          disabled={sections.length >= 16}
          onClick={() => onChange({ extraSections: [...sections, fresh()] })}
        >
          Add Section
        </Button>
      </CardContent>
    </Card>
  );
}

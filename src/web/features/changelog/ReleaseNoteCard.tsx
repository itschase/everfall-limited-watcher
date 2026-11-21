import {
  PublicReleaseNote,
  RELEASE_GROUPS,
  ReleaseGroup,
} from "../../../shared/releaseNotes";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
export function ReleaseNoteCard({ note }: { note: PublicReleaseNote }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">Version {note.version}</Badge>
          <time dateTime={note.date} className="text-xs text-muted-foreground">
            {new Date(`${note.date}T12:00:00Z`).toLocaleDateString(undefined, {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </time>
          {!note.published && <Badge variant="secondary">Draft</Badge>}
        </div>
        <CardTitle className="pt-2 text-xl">{note.title}</CardTitle>
        <CardDescription className="whitespace-pre-line leading-relaxed">
          {note.summary}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {(Object.keys(RELEASE_GROUPS) as ReleaseGroup[])
          .filter((key) => note[key].length)
          .map((key) => (
            <section key={key}>
              <h3 className="mb-2 text-sm font-semibold">
                {RELEASE_GROUPS[key]}
              </h3>
              <ul className="list-disc space-y-3 pl-5 text-sm leading-relaxed text-muted-foreground">
                {note[key].map((paragraph, index) => (
                  <li
                    key={index}
                    className="whitespace-pre-line break-words pl-1"
                  >
                    {paragraph}
                  </li>
                ))}
              </ul>
            </section>
          ))}
      </CardContent>
    </Card>
  );
}

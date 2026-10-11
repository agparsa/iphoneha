/**
 * Helpers for the magazine's Markdown: stable heading anchors for the table of
 * contents. The same function names the heading in the body and the entry in
 * the contents, so the two always match.
 */

/** Plain text of a Markdown heading: no emphasis, code ticks or link syntax. */
export function plainHeading(markdown: string): string {
  return markdown
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]/g, '')
    .trim();
}

/** «چک صیادی چیست؟» → «چک-صیادی-چیست»; Persian letters stay as they are. */
export function headingId(text: string): string {
  return plainHeading(text)
    .replace(/‌/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

export interface TocEntry {
  id: string;
  text: string;
}

/** The article's `##` sections, skipping fenced code. */
export function tableOfContents(markdown: string): TocEntry[] {
  const entries: TocEntry[] = [];
  let fenced = false;
  for (const line of markdown.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    if (fenced) continue;
    const match = /^##\s+(.+?)\s*#*\s*$/.exec(line);
    if (match) {
      const text = plainHeading(match[1]!);
      entries.push({ id: headingId(text), text });
    }
  }
  return entries;
}

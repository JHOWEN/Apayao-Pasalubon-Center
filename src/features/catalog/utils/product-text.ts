const HTML_ENTITY_REPLACEMENTS: Array<[RegExp, string]> = [
  [/&nbsp;/gi, " "],
  [/&amp;/gi, "&"],
  [/&quot;/gi, '"'],
  [/&#39;|&apos;/gi, "'"],
  [/&lt;/gi, "<"],
  [/&gt;/gi, ">"],
];

/** Convert admin-entered product copy into a compact catalog summary. */
export function cleanProductDescription(value: string | null | undefined, fallback: string) {
  const withoutMarkup = String(value ?? "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, " ");
  const cleaned = HTML_ENTITY_REPLACEMENTS.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    withoutMarkup,
  )
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || fallback;
}

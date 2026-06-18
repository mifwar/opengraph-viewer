// MetadataInspector — orchestrates the OG parser, JSON-LD extractor, and Rich Result
// validator into a single inspection result. Keeps JSON-LD logic decoupled from lib/og.ts.
//
// SEAM: inspectHtml takes html from any source. A future rendered-DOM (post-JS) pass can
// call this a second time with rendered html and diff the results — no refactor needed.

import { parseOg, type ParsedOg } from "./og";
import {
  extractJsonLd,
  allSchemas,
  schemaTypeCounts,
  type JsonLdBlock,
} from "./jsonld";
import { validateSchemas, type ValidationResult } from "./richResults";

export type Overview = {
  url: string;
  title?: string;
  description?: string;
  ogTagCount: number;
  jsonLdBlockCount: number;
  schemaTypes: string[];
  errorCount: number;
  warningCount: number;
};

export type Inspection = {
  og: ParsedOg;
  jsonld: JsonLdBlock[];
  validations: ValidationResult[];
  overview: Overview;
};

/** Count meta tags that belong to the Open Graph namespace (og:*). */
function countOgTags(raw: ParsedOg["raw"]): number {
  let n = 0;
  for (const [key, values] of Object.entries(raw)) {
    if (key.startsWith("og:")) n += values.length;
  }
  return n;
}

/** Best-effort title/description from JSON-LD when OG/HTML didn't provide one. */
function jsonLdFallback(
  blocks: JsonLdBlock[],
  field: "name" | "headline" | "description",
): string | undefined {
  for (const block of blocks) {
    for (const schema of block.schemas) {
      const v = schema.node[field];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
  }
  return undefined;
}

export function inspectHtml(html: string, finalUrl: string): Inspection {
  const og = parseOg(html, finalUrl);
  const jsonld = extractJsonLd(html);
  const schemas = allSchemas(jsonld);
  const validations = validateSchemas(schemas);

  const errorCount = validations.reduce((n, v) => n + v.errors.length, 0);
  const warningCount = validations.reduce((n, v) => n + v.warnings.length, 0);

  const title =
    og.title ??
    jsonLdFallback(jsonld, "headline") ??
    jsonLdFallback(jsonld, "name");
  const description = og.description ?? jsonLdFallback(jsonld, "description");

  const counts = schemaTypeCounts(jsonld);

  const overview: Overview = {
    url: finalUrl,
    title,
    description,
    ogTagCount: countOgTags(og.raw),
    jsonLdBlockCount: jsonld.length,
    schemaTypes: Object.keys(counts),
    errorCount,
    warningCount,
  };

  return { og, jsonld, validations, overview };
}

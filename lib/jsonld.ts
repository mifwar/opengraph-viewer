// JsonLdExtractor — pulls <script type="application/ld+json"> blocks from raw HTML,
// parses them, captures parse errors, and flattens @graph / arrays / nested objects
// into a flat list of detected schemas. Zero dependencies (mirrors lib/og.ts approach).
//
// IMPORTANT: run this on the RAW html, before lib/og.ts's parseOg strips <script> tags.

export type DetectedSchema = {
  /** All @type values on this node (string or array in source). */
  types: string[];
  /** Top-level property keys (excluding @-prefixed JSON-LD keywords). */
  topLevelProps: string[];
  /** @type values of directly/indirectly nested schema objects. */
  nestedTypes: string[];
  /** The schema object itself. */
  node: Record<string, unknown>;
};

export type JsonLdBlock = {
  /** Position of the block in document order, 0-based. */
  index: number;
  /** Raw text content between the script tags. */
  raw: string;
  /** Parsed JSON value, or null if parsing failed. */
  parsed: unknown | null;
  /** Parse error message, or null when parsing succeeded. */
  error: string | null;
  /** Schemas discovered within this block (flattened). */
  schemas: DetectedSchema[];
};

const SCRIPT_RE =
  /<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Normalize an @type value (string | string[] | undefined) into a string array. */
function typeOf(node: Record<string, unknown>): string[] {
  const t = node["@type"];
  if (typeof t === "string") return [t];
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === "string");
  return [];
}

/**
 * Walk a parsed JSON-LD value collecting every object that carries an @type.
 * Handles top-level arrays, @graph containers, and arbitrarily nested schemas.
 * The top-level @graph wrapper itself is unwrapped (not reported as a schema).
 */
function collectSchemas(value: unknown): DetectedSchema[] {
  const out: DetectedSchema[] = [];

  const visit = (val: unknown, isTopGraphMember: boolean) => {
    if (Array.isArray(val)) {
      for (const item of val) visit(item, isTopGraphMember);
      return;
    }
    if (!isObject(val)) return;

    const types = typeOf(val);

    // Unwrap @graph containers (with or without their own @type) so members
    // are reported individually rather than as one umbrella schema.
    const graph = val["@graph"];
    if (Array.isArray(graph)) {
      for (const item of graph) visit(item, false);
      // A bare { @context, @graph } wrapper has no @type — don't report it.
      // If it also carries an @type, fall through to report it below.
      if (types.length === 0) return;
    }

    if (types.length === 0) {
      // No @type here, but nested objects might still be schemas.
      for (const v of Object.values(val)) {
        if (isObject(v) || Array.isArray(v)) visit(v, false);
      }
      return;
    }

    const topLevelProps = Object.keys(val).filter((k) => !k.startsWith("@"));
    const nestedTypes = collectNestedTypes(val);

    out.push({ types, topLevelProps, nestedTypes, node: val });

    // Recurse into property values to surface deeper nested schemas as their own
    // top-level entries too (e.g. an Article's nested Person/Organization).
    for (const v of Object.values(val)) {
      if (isObject(v) || Array.isArray(v)) visit(v, false);
    }
  };

  visit(value, true);
  // De-duplicate: a nested object is reported both inline (nestedTypes) and as its
  // own entry; that's intentional. But avoid reporting the exact same node twice.
  return dedupeByNode(out);
}

/** Collect @type values of objects nested anywhere inside a schema node (one level of meaning, recursive in structure). */
function collectNestedTypes(node: Record<string, unknown>): string[] {
  const seen = new Set<string>();
  const walk = (val: unknown, isRoot: boolean) => {
    if (Array.isArray(val)) {
      for (const item of val) walk(item, false);
      return;
    }
    if (!isObject(val)) return;
    if (!isRoot) {
      for (const t of typeOf(val)) seen.add(t);
    }
    for (const v of Object.values(val)) {
      if (isObject(v) || Array.isArray(v)) walk(v, false);
    }
  };
  walk(node, true);
  return [...seen];
}

function dedupeByNode(schemas: DetectedSchema[]): DetectedSchema[] {
  const seen = new Set<Record<string, unknown>>();
  const out: DetectedSchema[] = [];
  for (const s of schemas) {
    if (seen.has(s.node)) continue;
    seen.add(s.node);
    out.push(s);
  }
  return out;
}

/** Extract and parse all JSON-LD blocks from raw HTML, in document order. */
export function extractJsonLd(html: string): JsonLdBlock[] {
  const blocks: JsonLdBlock[] = [];
  SCRIPT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  let index = 0;
  while ((m = SCRIPT_RE.exec(html)) !== null) {
    const raw = m[1].trim();
    if (!raw) continue;
    let parsed: unknown | null = null;
    let error: string | null = null;
    let schemas: DetectedSchema[] = [];
    try {
      parsed = JSON.parse(raw);
      schemas = collectSchemas(parsed);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
    blocks.push({ index: index++, raw, parsed, error, schemas });
  }
  return blocks;
}

/** Flat list of every detected schema across all blocks (parse-error blocks contribute none). */
export function allSchemas(blocks: JsonLdBlock[]): DetectedSchema[] {
  return blocks.flatMap((b) => b.schemas);
}

/** Counts of each schema @type across all blocks, e.g. { Article: 1, Person: 2 }. */
export function schemaTypeCounts(blocks: JsonLdBlock[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const s of allSchemas(blocks)) {
    for (const t of s.types) counts[t] = (counts[t] ?? 0) + 1;
  }
  return counts;
}

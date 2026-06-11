export type RawMeta = Record<string, string[]>;

export type DiscoveredImage = {
  raw: string;
  resolved: string;
  source: "og:image" | "twitter:image" | "og:image:url" | "image_src";
  width?: number;
  height?: number;
  alt?: string;
  type?: string;
};

export type ParsedOg = {
  title?: string;
  description?: string;
  siteName?: string;
  type?: string;
  url?: string;
  images: DiscoveredImage[];
  primaryImage?: DiscoveredImage;
  primaryImageSource?: "og:image" | "twitter:image" | "og:image:url" | "image_src";
  raw: RawMeta;
  warnings: string[];
};

const META_RE = /<meta\b([^>]*?)\/?>/gi;
const TITLE_RE = /<title\b[^>]*>([\s\S]*?)<\/title>/i;
const LINK_RE = /<link\b([^>]*?)\/?>/gi;
const HTML_COMMENT_RE = /<!--([\s\S]*?)-->/g;

type Attrs = Record<string, string>;

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function parseAttrs(raw: string): Attrs {
  const attrs: Attrs = {};
  const re = /([a-zA-Z_:][a-zA-Z0-9_:\-.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const name = m[1].toLowerCase();
    const value = decodeEntities(m[2] ?? m[3] ?? m[4] ?? "");
    attrs[name] = value;
  }
  return attrs;
}

function safeResolve(base: string, maybeRelative: string): string {
  try {
    return new URL(maybeRelative, base).toString();
  } catch {
    return maybeRelative;
  }
}

function extractTitle(html: string): string | undefined {
  const m = html.match(TITLE_RE);
  if (!m) return undefined;
  return decodeEntities(m[1].trim());
}

function stripCommentsAndScripts(html: string): string {
  return html
    .replace(HTML_COMMENT_RE, " ")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ");
}

function findAll(re: RegExp, html: string): RegExpExecArray[] {
  const out: RegExpExecArray[] = [];
  let m: RegExpExecArray | null;
  re.lastIndex = 0;
  while ((m = re.exec(html)) !== null) out.push(m);
  return out;
}

type MetaEntry = { key: string; value: string };

export function parseOg(html: string, pageUrl: string): ParsedOg {
  const cleaned = stripCommentsAndScripts(html);
  const raw: RawMeta = {};
  const warnings: string[] = [];

  const pushRaw = (key: string, value: string) => {
    if (!raw[key]) raw[key] = [];
    raw[key].push(value);
  };

  for (const m of findAll(META_RE, cleaned)) {
    const attrs = parseAttrs(m[1]);
    const key = (attrs.property ?? attrs.name ?? attrs.itemprop ?? "").toLowerCase();
    const value = (attrs.content ?? attrs.value ?? "").trim();
    if (!key || !value) continue;
    pushRaw(key, value);
  }

  for (const m of findAll(LINK_RE, cleaned)) {
    const attrs = parseAttrs(m[1]);
    const rel = (attrs.rel ?? "").toLowerCase();
    if (rel === "image_src" && attrs.href) pushRaw("image_src", attrs.href);
  }

  const images: DiscoveredImage[] = [];
  const pushImage = (
    src: DiscoveredImage["source"],
    rawUrl: string,
    extras: { width?: string; height?: string; alt?: string; type?: string } = {},
  ) => {
    const resolved = safeResolve(pageUrl, rawUrl);
    const w = extras.width ? parseInt(extras.width, 10) : undefined;
    const h = extras.height ? parseInt(extras.height, 10) : undefined;
    images.push({
      raw: rawUrl,
      resolved,
      source: src,
      width: Number.isFinite(w) ? w : undefined,
      height: Number.isFinite(h) ? h : undefined,
      alt: extras.alt,
      type: extras.type,
    });
  };

  const hasMore = (arr: string[] | undefined, i: number) => !!arr && i < arr.length;

  const walkGroupedImages = (prefix: "og:image" | "twitter:image", source: DiscoveredImage["source"]) => {
    const base = raw[prefix] ?? [];
    const subs: Record<string, string[]> = {};
    for (const [k, vs] of Object.entries(raw)) {
      if (k.startsWith(prefix + ":") && k.length > prefix.length + 1) {
        subs[k.slice(prefix.length + 1)] = vs;
      }
    }
    let wi = 0, hi = 0, ai = 0, ti = 0;
    base.forEach((url) => {
      const w = subs.width?.[wi];
      const h = subs.height?.[hi];
      const a = subs.alt?.[ai];
      const t = subs.type?.[ti];
      pushImage(source, url, { width: w, height: h, alt: a, type: t });
      if (hasMore(subs.width, wi)) wi++;
      if (hasMore(subs.height, hi)) hi++;
      if (hasMore(subs.alt, ai)) ai++;
      if (hasMore(subs.type, ti)) ti++;
    });
  };

  walkGroupedImages("og:image", "og:image");
  for (const v of raw["og:image:url"] ?? []) pushImage("og:image:url", v);
  walkGroupedImages("twitter:image", "twitter:image");
  for (const v of raw["image_src"] ?? []) pushImage("image_src", v);

  let primaryImage: DiscoveredImage | undefined;
  let primaryImageSource: ParsedOg["primaryImageSource"];
  if (images.length > 0) {
    primaryImage = images[0];
    primaryImageSource = images[0].source;
  }
  if (!primaryImage) warnings.push("No og:image, og:image:url, twitter:image, or image_src found");

  const htmlTitle = extractTitle(cleaned);
  const title = raw["og:title"]?.[0] ?? raw["twitter:title"]?.[0] ?? htmlTitle;
  const description =
    raw["og:description"]?.[0] ?? raw["twitter:description"]?.[0] ?? raw["description"]?.[0];

  return {
    title,
    description,
    siteName: raw["og:site_name"]?.[0],
    type: raw["og:type"]?.[0],
    url: raw["og:url"]?.[0],
    images,
    primaryImage,
    primaryImageSource,
    raw,
    warnings,
  };
}

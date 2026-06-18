"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ParsedOg, DiscoveredImage } from "@/lib/og";
import type { JsonLdBlock, DetectedSchema } from "@/lib/jsonld";
import type { ValidationResult } from "@/lib/richResults";
import type { Overview } from "@/lib/inspect";

type ApiOk = {
  ok: true;
  pageUrl: string;
  finalUrl: string;
  httpStatus: number;
  contentType: string;
  bytes: number;
  fetchDurationMs: number;
  redirected: boolean;
  userAgent: string;
  parsed: ParsedOg;
  jsonld: JsonLdBlock[];
  validations: ValidationResult[];
  overview: Overview;
  html: string;
};
type ApiErr = { ok: false; error: string; details?: string };
type ApiResponse = ApiOk | ApiErr;

type TabId = "overview" | "og" | "rich" | "jsonld" | "html";
const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "og", label: "Open Graph" },
  { id: "rich", label: "Rich Results" },
  { id: "jsonld", label: "JSON-LD" },
  { id: "html", label: "Raw HTML" },
];

const SAMPLE_LOCAL = "http://localhost:3000/";
const SAMPLE_PUBLIC = "https://en.wikipedia.org/wiki/Open_Graph_protocol";

// The /api/og fetch runs on whatever host serves this page. So localhost/LAN URLs
// only resolve when the viewer itself is served locally — on a public deployment
// "localhost" means the server's machine, not the user's. Gate the localhost UI on this.
function isLocalHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]" ||
    hostname.endsWith(".local") ||
    /^192\.168\./.test(hostname) ||
    /^10\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
  );
}

export default function OgViewer() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [copied, setCopied] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("overview");
  const [localCapable, setLocalCapable] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const current = (document.documentElement.getAttribute("data-theme") as "light" | "dark" | null) ?? "light";
    setTheme(current);
    setLocalCapable(isLocalHost(window.location.hostname));
    inputRef.current?.focus();
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      try { localStorage.setItem("ogv-theme", next); } catch {}
      return next;
    });
  }, []);

  const run = useCallback(async (target: string) => {
    const trimmed = target.trim();
    if (!trimmed) return;
    setLoading(true);
    setData(null);
    setTab("overview");
    try {
      let normalized = trimmed;
      if (!/^https?:\/\//i.test(normalized)) normalized = "http://" + normalized;
      const res = await fetch("/api/og", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: normalized }),
      });
      const json = (await res.json()) as ApiResponse;
      setData(json);
    } catch (err) {
      setData({ ok: false, error: "Network error", details: err instanceof Error ? err.message : String(err) });
    } finally {
      setLoading(false);
    }
  }, []);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void run(url);
  };

  const onRefresh = () => {
    if (data?.ok) void run(data.pageUrl);
    else void run(url);
  };

  const copy = useCallback(async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1400);
    } catch {
      setCopied(null);
    }
  }, []);

  const proxyImageSrc = (rawUrl: string) =>
    `/api/og/image?url=${encodeURIComponent(rawUrl)}`;

  const httpPill = useMemo(() => {
    if (loading) return { className: "pill", text: "fetching…" };
    if (!data) return null;
    if (!data.ok) return { className: "pill err", text: data.error };
    return {
      className: `pill ${data.httpStatus >= 200 && data.httpStatus < 400 ? "ok" : "err"}`,
      text: `HTTP ${data.httpStatus}`,
    };
  }, [data, loading]);

  return (
    <>
      <form className="url-bar" onSubmit={onSubmit}>
        <input
          ref={inputRef}
          type="text"
          inputMode="url"
          placeholder={
            localCapable
              ? "https://example.com/blog/my-post  or  http://localhost:3000/blog/my-post"
              : "https://example.com/blog/my-post"
          }
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          spellCheck={false}
          autoComplete="off"
        />
        <button type="submit" className="primary" disabled={loading || !url.trim()}>
          {loading ? "Loading…" : "Fetch"}
        </button>
        <button type="button" onClick={onRefresh} disabled={loading || (!url.trim() && !data?.ok)} title="Refetch">
          ↻
        </button>
        <button type="button" onClick={toggleTheme} className="ghost" title="Toggle theme" aria-label="Toggle theme">
          {theme === "dark" ? "☀" : "☾"}
        </button>
      </form>

      <div className="status">
        {httpPill && <span className={httpPill.className}>{httpPill.text}</span>}
        {data?.ok && (
          <>
            <span className="pill">{data.fetchDurationMs} ms</span>
            <span className="pill">{(data.bytes / 1024).toFixed(1)} kB</span>
            {data.redirected && <span className="pill warn">redirected</span>}
            {data.overview.jsonLdBlockCount > 0 && (
              <span className="pill">{data.overview.jsonLdBlockCount} JSON-LD</span>
            )}
            {data.overview.errorCount > 0 && (
              <span className="pill err">{data.overview.errorCount} errors</span>
            )}
            {data.overview.warningCount > 0 && (
              <span className="pill warn">{data.overview.warningCount} warnings</span>
            )}
          </>
        )}
      </div>

      {!data && !loading && (
        <div className="empty">
          <div>Enter a URL above and press Enter.</div>
          <div style={{ marginTop: 10, display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
            {localCapable && (
              <button onClick={() => { setUrl(SAMPLE_LOCAL); void run(SAMPLE_LOCAL); }}>Try localhost</button>
            )}
            <button onClick={() => { setUrl(SAMPLE_PUBLIC); void run(SAMPLE_PUBLIC); }}>Try public</button>
          </div>
        </div>
      )}

      {data && !data.ok && (
        <div className="error">
          <div><strong>Error:</strong> {data.error}</div>
          {data.details && <div className="details">{data.details}</div>}
        </div>
      )}

      {data?.ok && (
        <>
          <nav className="tabs" role="tablist">
            {TABS.map((t) => {
              const badge =
                t.id === "rich" && data.overview.errorCount > 0
                  ? data.overview.errorCount
                  : t.id === "jsonld" && data.overview.jsonLdBlockCount > 0
                  ? data.overview.jsonLdBlockCount
                  : null;
              return (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={tab === t.id}
                  className={"tab" + (tab === t.id ? " active" : "")}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                  {badge != null && <span className="tab-badge">{badge}</span>}
                </button>
              );
            })}
          </nav>

          {tab === "overview" && <OverviewPanel data={data} onCopy={copy} copied={copied} />}
          {tab === "og" && (
            <OpenGraphPanel
              parsed={data.parsed}
              meta={{ pageUrl: data.pageUrl, finalUrl: data.finalUrl, httpStatus: data.httpStatus, contentType: data.contentType, bytes: data.bytes, fetchDurationMs: data.fetchDurationMs, userAgent: data.userAgent, redirected: data.redirected }}
              proxyImageSrc={proxyImageSrc}
              onCopy={copy}
              copied={copied}
            />
          )}
          {tab === "rich" && (
            <RichResultsPanel
              validations={data.validations}
              schemas={data.jsonld.flatMap((b) => b.schemas)}
            />
          )}
          {tab === "jsonld" && <JsonLdPanel blocks={data.jsonld} onCopy={copy} copied={copied} />}
          {tab === "html" && <RawHtmlPanel html={data.html} onCopy={copy} copied={copied} />}
        </>
      )}
    </>
  );
}

/* ------------------------------ Overview ------------------------------ */

function OverviewPanel({
  data,
  onCopy,
  copied,
}: {
  data: ApiOk;
  onCopy: (text: string, key: string) => void;
  copied: string | null;
}) {
  const o = data.overview;
  return (
    <div className="preview-grid">
      <div className="card" style={{ gridColumn: "1 / -1" }}>
        <div className="card-head"><span>Overview</span></div>
        <div className="card-body">
          <div className="field">
            <div className="label">URL</div>
            <div className="value mono" style={{ fontSize: 12 }}>
              {o.url}
              <button style={{ marginLeft: 8, padding: "2px 8px", fontSize: 11 }} onClick={() => onCopy(o.url, "ov-url")}>
                {copied === "ov-url" ? "✓" : "Copy"}
              </button>
            </div>
          </div>
          <div className="field">
            <div className="label">Title</div>
            <div className="value">{o.title ?? <span className="dim">—</span>}</div>
          </div>
          <div className="field">
            <div className="label">Description</div>
            <div className="value">{o.description ?? <span className="dim">—</span>}</div>
          </div>

          <div className="metric-row">
            <Metric label="OG tags" value={o.ogTagCount} />
            <Metric label="JSON-LD blocks" value={o.jsonLdBlockCount} />
            <Metric label="Errors" value={o.errorCount} tone={o.errorCount > 0 ? "err" : "ok"} />
            <Metric label="Warnings" value={o.warningCount} tone={o.warningCount > 0 ? "warn" : "ok"} />
          </div>

          <div className="field" style={{ marginTop: 14 }}>
            <div className="label">Detected schema types</div>
            <div className="value">
              {o.schemaTypes.length === 0 ? (
                <span className="dim">none</span>
              ) : (
                <div className="chips">
                  {o.schemaTypes.map((t) => (
                    <span key={t} className="chip">{t}</span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="note">
            Structured data is read from the <strong>initial HTML response</strong>. Data injected
            later by client-side JavaScript is not executed and will not appear here.
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone?: "ok" | "warn" | "err" }) {
  return (
    <div className="metric">
      <div className={"metric-value" + (tone ? " " + tone : "")}>{value}</div>
      <div className="metric-label">{label}</div>
    </div>
  );
}

/* ------------------------------ Open Graph (existing behavior) ------------------------------ */

function OpenGraphPanel({
  parsed,
  meta,
  proxyImageSrc,
  onCopy,
  copied,
}: {
  parsed: ParsedOg;
  meta: {
    pageUrl: string;
    finalUrl: string;
    httpStatus: number;
    contentType: string;
    bytes: number;
    fetchDurationMs: number;
    userAgent: string;
    redirected: boolean;
  };
  proxyImageSrc: (rawUrl: string) => string;
  onCopy: (text: string, key: string) => void;
  copied: string | null;
}) {
  return (
    <div className="preview-grid">
      <div className="card">
        <div className="card-head">
          <span>Preview</span>
          {parsed.primaryImage && (
            <div className="row-buttons">
              <button onClick={() => window.open(proxyImageSrc(parsed.primaryImage!.resolved), "_blank", "noopener")}>
                Open in new tab
              </button>
              <button onClick={() => onCopy(parsed.primaryImage!.resolved, "primary")}>
                Copy URL
              </button>
              {copied === "primary" && <span className="copied">copied</span>}
            </div>
          )}
        </div>
        <div className="card-body">
          <div className="image-frame">
            {parsed.primaryImage ? (
              <img
                src={proxyImageSrc(parsed.primaryImage.resolved)}
                alt={parsed.primaryImage.alt ?? parsed.title ?? "og:image"}
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            ) : (
              <div className="ph">No image found. Inspect raw meta below.</div>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <span>Metadata</span>
        </div>
        <div className="card-body">
          <div className="field">
            <div className="label">Title</div>
            <div className="value">{parsed.title ?? <span className="dim">—</span>}</div>
          </div>
          <div className="field">
            <div className="label">Description</div>
            <div className="value">{parsed.description ?? <span className="dim">—</span>}</div>
          </div>
          <div className="field">
            <div className="label">Site</div>
            <div className="value dim">{parsed.siteName ?? "—"}</div>
          </div>
          <div className="field">
            <div className="label">Type</div>
            <div className="value mono dim">{parsed.type ?? "—"}</div>
          </div>
          <div className="field">
            <div className="label">Selected image source</div>
            <div className="value mono">
              {parsed.primaryImageSource ?? "—"}
              {parsed.primaryImage && parsed.primaryImage.source !== parsed.primaryImageSource && (
                <span className="dim"> (displayed from {parsed.primaryImage.source})</span>
              )}
            </div>
          </div>
          <div className="field">
            <div className="label">Resolved image URL</div>
            <div className="value mono" style={{ fontSize: 12 }}>
              {parsed.primaryImage?.resolved ?? "—"}
            </div>
          </div>
        </div>
      </div>

      {parsed.images.length > 1 && (
        <div className="card" style={{ gridColumn: "1 / -1" }}>
          <div className="card-head">
            <span>All images ({parsed.images.length})</span>
            <span className="dim" style={{ fontSize: 11 }}>First one is primary</span>
          </div>
          <div className="card-body">
            <div className="images">
              {parsed.images.map((img, i) => (
                <ImageTile
                  key={i}
                  img={img}
                  primary={i === 0}
                  proxySrc={proxyImageSrc(img.resolved)}
                  onCopy={() => onCopy(img.resolved, `tile-${i}`)}
                  copied={copied === `tile-${i}`}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="card" style={{ gridColumn: "1 / -1" }}>
        <div className="card-head">
          <span>Debug</span>
        </div>
        <div className="card-body">
          <div className="kv">
            <div className="k">pageUrl</div><div className="v">{meta.pageUrl}</div>
            <div className="k">finalUrl</div><div className="v">{meta.finalUrl}</div>
            <div className="k">httpStatus</div><div className="v">{meta.httpStatus}</div>
            <div className="k">contentType</div><div className="v">{meta.contentType}</div>
            <div className="k">bytes</div><div className="v">{meta.bytes}</div>
            <div className="k">duration</div><div className="v">{meta.fetchDurationMs} ms</div>
            <div className="k">userAgent</div><div className="v">{meta.userAgent}</div>
            <div className="k">redirected</div><div className="v">{String(meta.redirected)}</div>
          </div>
        </div>
      </div>

      <div className="card" style={{ gridColumn: "1 / -1" }}>
        <div className="card-head">
          <span>Raw meta</span>
        </div>
        <div className="card-body">
          {parsed.warnings.length > 0 && (
            <div className="error" style={{ marginBottom: 10 }}>
              {parsed.warnings.join("; ")}
            </div>
          )}
          <RawMeta raw={parsed.raw} />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Rich Results ------------------------------ */

function RichResultsPanel({
  validations,
  schemas,
}: {
  validations: ValidationResult[];
  schemas: DetectedSchema[];
}) {
  if (validations.length === 0) {
    return (
      <div className="card">
        <div className="card-head"><span>Rich Results</span></div>
        <div className="card-body">
          <div className="ph">No schemas found to validate. Check the JSON-LD tab.</div>
        </div>
      </div>
    );
  }
  return (
    <div className="preview-grid">
      {validations.map((v, i) => {
        const crumbs = v.schemaTypes.includes("BreadcrumbList")
          ? parseBreadcrumbs(schemas[i]?.node)
          : null;
        return (
          <div className="card" key={i} style={{ gridColumn: "1 / -1" }}>
            <div className="card-head">
              <span>{v.schemaTypes.join(", ") || "Unknown"}</span>
              <span className="row-buttons">
                {v.errors.length > 0 && <span className="pill err">{v.errors.length} errors</span>}
                {v.warnings.length > 0 && <span className="pill warn">{v.warnings.length} warnings</span>}
                {v.passed.length > 0 && <span className="pill ok">{v.passed.length} passed</span>}
              </span>
            </div>
            <div className="card-body">
              {crumbs && crumbs.length > 0 && <BreadcrumbTrail crumbs={crumbs} />}
              {v.unknown ? (
                <div className="ph">No validation rules for this type yet — displayed for reference.</div>
              ) : (
                <div className="checks">
                  {v.errors.map((c, j) => (
                    <div className="check err" key={`e${j}`}><span className="check-icon">✕</span> {c.message}</div>
                  ))}
                  {v.warnings.map((c, j) => (
                    <div className="check warn" key={`w${j}`}><span className="check-icon">!</span> {c.message}</div>
                  ))}
                  {v.passed.map((c, j) => (
                    <div className="check ok" key={`p${j}`}><span className="check-icon">✓</span> {c.message}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

type Crumb = { position: number; name: string; url?: string };

/** Extract an ordered breadcrumb trail from a BreadcrumbList node. */
function parseBreadcrumbs(node: Record<string, unknown> | undefined): Crumb[] {
  if (!node) return [];
  const list = node.itemListElement;
  const items = Array.isArray(list) ? list : list != null ? [list] : [];
  const crumbs: Crumb[] = [];
  items.forEach((raw, idx) => {
    if (typeof raw !== "object" || raw == null) return;
    const li = raw as Record<string, unknown>;
    const item = li.item;
    let name: string | undefined;
    let url: string | undefined;
    if (typeof item === "string") {
      url = item;
    } else if (item && typeof item === "object") {
      const it = item as Record<string, unknown>;
      if (typeof it.name === "string") name = it.name;
      if (typeof it["@id"] === "string") url = it["@id"] as string;
      else if (typeof it.url === "string") url = it.url as string;
    }
    if (typeof li.name === "string") name = li.name;
    const position = typeof li.position === "number" ? li.position : idx + 1;
    crumbs.push({ position, name: name ?? url ?? `Item ${position}`, url });
  });
  return crumbs.sort((a, b) => a.position - b.position);
}

function BreadcrumbTrail({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav className="breadcrumb-trail" aria-label="Breadcrumb">
      {crumbs.map((c, i) => (
        <span key={i} className="crumb">
          {c.url ? (
            <a href={c.url} target="_blank" rel="noopener noreferrer">{c.name}</a>
          ) : (
            <span>{c.name}</span>
          )}
          {i < crumbs.length - 1 && <span className="crumb-sep">›</span>}
        </span>
      ))}
    </nav>
  );
}

/* ------------------------------ JSON-LD ------------------------------ */

function JsonLdPanel({
  blocks,
  onCopy,
  copied,
}: {
  blocks: JsonLdBlock[];
  onCopy: (text: string, key: string) => void;
  copied: string | null;
}) {
  if (blocks.length === 0) {
    return (
      <div className="card">
        <div className="card-head"><span>JSON-LD</span></div>
        <div className="card-body">
          <div className="ph">No application/ld+json blocks found in the initial HTML.</div>
        </div>
      </div>
    );
  }
  return (
    <div className="preview-grid">
      {blocks.map((b) => {
        const types = b.schemas.flatMap((s) => s.types);
        return (
          <div className="card" key={b.index} style={{ gridColumn: "1 / -1" }}>
            <div className="card-head">
              <span>Block #{b.index + 1}{types.length > 0 ? ` · ${types.join(", ")}` : ""}</span>
              <span className="row-buttons">
                {b.error ? (
                  <span className="pill err">invalid JSON</span>
                ) : (
                  <span className="pill ok">{b.schemas.length} schema{b.schemas.length === 1 ? "" : "s"}</span>
                )}
              </span>
            </div>
            <div className="card-body">
              {b.error && (
                <div className="error" style={{ marginBottom: 10 }}>
                  <strong>Parse error:</strong> {b.error}
                </div>
              )}

              {b.schemas.length > 0 && (
                <div className="schema-list">
                  {b.schemas.map((s, i) => (
                    <div className="schema-item" key={i}>
                      <div className="chips">
                        {s.types.map((t) => <span key={t} className="chip">{t}</span>)}
                      </div>
                      {s.topLevelProps.length > 0 && (
                        <div className="schema-props">
                          <span className="label">props:</span> {s.topLevelProps.join(", ")}
                        </div>
                      )}
                      {s.nestedTypes.length > 0 && (
                        <div className="schema-props">
                          <span className="label">nested:</span> {s.nestedTypes.join(", ")}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="json-grid">
                <div>
                  <div className="label" style={{ marginBottom: 6, display: "flex", justifyContent: "space-between" }}>
                    <span>Raw source</span>
                    <button style={{ padding: "2px 8px", fontSize: 11 }} onClick={() => onCopy(b.raw, `raw-${b.index}`)}>
                      {copied === `raw-${b.index}` ? "✓" : "Copy"}
                    </button>
                  </div>
                  <pre className="raw">{b.raw}</pre>
                </div>
                {b.parsed != null && (
                  <div>
                    <div className="label" style={{ marginBottom: 6 }}>Parsed structure</div>
                    <pre className="raw">{JSON.stringify(b.parsed, null, 2)}</pre>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------ Raw HTML ------------------------------ */

function RawHtmlPanel({
  html,
  onCopy,
  copied,
}: {
  html: string;
  onCopy: (text: string, key: string) => void;
  copied: string | null;
}) {
  return (
    <div className="card">
      <div className="card-head">
        <span>Initial HTML ({(html.length / 1024).toFixed(1)} kB)</span>
        <button style={{ padding: "2px 8px", fontSize: 11 }} onClick={() => onCopy(html, "rawhtml")}>
          {copied === "rawhtml" ? "✓" : "Copy"}
        </button>
      </div>
      <div className="card-body">
        <pre className="raw" style={{ maxHeight: 560 }}>{html}</pre>
      </div>
    </div>
  );
}

/* ------------------------------ shared bits (unchanged) ------------------------------ */

function ImageTile({
  img,
  primary,
  proxySrc,
  onCopy,
  copied,
}: {
  img: DiscoveredImage;
  primary: boolean;
  proxySrc: string;
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <div className={"tile" + (primary ? " primary" : "")}>
      {primary && <span className="badge">Primary</span>}
      <div className="thumb">
        <img
          src={proxySrc}
          alt={img.alt ?? img.source}
          loading="lazy"
          onError={(e) => {
            const el = e.currentTarget as HTMLImageElement;
            el.style.opacity = "0.2";
          }}
        />
      </div>
      <div className="meta">
        <div>{img.source}{img.width && img.height ? ` · ${img.width}×${img.height}` : ""}</div>
        <div className="row-buttons" style={{ marginTop: 6 }}>
          <button onClick={() => window.open(proxySrc, "_blank", "noopener")}>Open</button>
          <button onClick={onCopy}>Copy{copied ? " ✓" : ""}</button>
        </div>
      </div>
    </div>
  );
}

function RawMeta({ raw }: { raw: Record<string, string[]> }) {
  const entries = Object.entries(raw);
  if (entries.length === 0) return <div className="ph">No meta tags found.</div>;
  return (
    <div className="raw">
      {entries.map(([k, vs]) => (
        <div key={k}>
          <span className="k">{k}{vs.length > 1 ? ` ×${vs.length}` : ""}</span>
          <span> = </span>
          <span className="v">"{vs[0]}"</span>
          {vs.length > 1 && vs.slice(1).map((v, i) => (
            <div key={i} style={{ paddingLeft: 18 }}>"{v}"</div>
          ))}
        </div>
      ))}
    </div>
  );
}

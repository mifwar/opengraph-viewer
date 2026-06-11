"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ParsedOg, DiscoveredImage } from "@/lib/og";

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
};
type ApiErr = { ok: false; error: string; details?: string };
type ApiResponse = ApiOk | ApiErr;

const SAMPLE_LOCAL = "http://localhost:3000/";
const SAMPLE_PUBLIC = "https://en.wikipedia.org/wiki/Open_Graph_protocol";

export default function OgViewer() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [copied, setCopied] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const current = (document.documentElement.getAttribute("data-theme") as "light" | "dark" | null) ?? "light";
    setTheme(current);
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

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1400);
    } catch {
      setCopied(null);
    }
  };

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
          placeholder="https://example.com/blog/my-post  or  http://localhost:3000/blog/my-post"
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
            {data.parsed.images.length > 1 && (
              <span className="pill">{data.parsed.images.length} images</span>
            )}
          </>
        )}
      </div>

      {!data && !loading && (
        <div className="empty">
          <div>Enter a URL above and press Enter.</div>
          <div style={{ marginTop: 10, display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
            <button onClick={() => { setUrl(SAMPLE_LOCAL); void run(SAMPLE_LOCAL); }}>Try localhost</button>
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
        <div className="preview-grid">
          <div className="card">
            <div className="card-head">
              <span>Preview</span>
              {data.parsed.primaryImage && (
                <div className="row-buttons">
                  <button onClick={() => window.open(proxyImageSrc(data.parsed.primaryImage!.resolved), "_blank", "noopener")}>
                    Open in new tab
                  </button>
                  <button onClick={() => copy(data.parsed.primaryImage!.resolved, "primary")}>
                    Copy URL
                  </button>
                  {copied === "primary" && <span className="copied">copied</span>}
                </div>
              )}
            </div>
            <div className="card-body">
              <div className="image-frame">
                {data.parsed.primaryImage ? (
                  <img
                    src={proxyImageSrc(data.parsed.primaryImage.resolved)}
                    alt={data.parsed.primaryImage.alt ?? data.parsed.title ?? "og:image"}
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
                <div className="value">{data.parsed.title ?? <span className="dim">—</span>}</div>
              </div>
              <div className="field">
                <div className="label">Description</div>
                <div className="value">{data.parsed.description ?? <span className="dim">—</span>}</div>
              </div>
              <div className="field">
                <div className="label">Site</div>
                <div className="value dim">{data.parsed.siteName ?? "—"}</div>
              </div>
              <div className="field">
                <div className="label">Type</div>
                <div className="value mono dim">{data.parsed.type ?? "—"}</div>
              </div>
              <div className="field">
                <div className="label">Selected image source</div>
                <div className="value mono">
                  {data.parsed.primaryImageSource ?? "—"}
                  {data.parsed.primaryImage && data.parsed.primaryImage.source !== data.parsed.primaryImageSource && (
                    <span className="dim"> (displayed from {data.parsed.primaryImage.source})</span>
                  )}
                </div>
              </div>
              <div className="field">
                <div className="label">Resolved image URL</div>
                <div className="value mono" style={{ fontSize: 12 }}>
                  {data.parsed.primaryImage?.resolved ?? "—"}
                </div>
              </div>
            </div>
          </div>

          {data.parsed.images.length > 1 && (
            <div className="card" style={{ gridColumn: "1 / -1" }}>
              <div className="card-head">
                <span>All images ({data.parsed.images.length})</span>
                <span className="dim" style={{ fontSize: 11 }}>First one is primary</span>
              </div>
              <div className="card-body">
                <div className="images">
                  {data.parsed.images.map((img, i) => (
                    <ImageTile
                      key={i}
                      img={img}
                      primary={i === 0}
                      proxySrc={proxyImageSrc(img.resolved)}
                      onCopy={() => copy(img.resolved, `tile-${i}`)}
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
                <div className="k">pageUrl</div><div className="v">{data.pageUrl}</div>
                <div className="k">finalUrl</div><div className="v">{data.finalUrl}</div>
                <div className="k">httpStatus</div><div className="v">{data.httpStatus}</div>
                <div className="k">contentType</div><div className="v">{data.contentType}</div>
                <div className="k">bytes</div><div className="v">{data.bytes}</div>
                <div className="k">duration</div><div className="v">{data.fetchDurationMs} ms</div>
                <div className="k">userAgent</div><div className="v">{data.userAgent}</div>
                <div className="k">redirected</div><div className="v">{String(data.redirected)}</div>
              </div>
            </div>
          </div>

          <div className="card" style={{ gridColumn: "1 / -1" }}>
            <div className="card-head">
              <span>Raw meta</span>
            </div>
            <div className="card-body">
              {data.parsed.warnings.length > 0 && (
                <div className="error" style={{ marginBottom: 10 }}>
                  {data.parsed.warnings.join("; ")}
                </div>
              )}
              <RawMeta raw={data.parsed.raw} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

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

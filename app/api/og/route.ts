import { NextRequest, NextResponse } from "next/server";
import { parseOg, type ParsedOg } from "@/lib/og";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_TIMEOUT_MS = 10_000;
const CRAWLER_UA =
  "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php) OpenGraph-Viewer/0.1";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

type OgResponse =
  | {
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
    }
  | { ok: false; error: string; details?: string };

function isValidHttpUrl(input: string): { ok: true; url: URL } | { ok: false; reason: string } {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return { ok: false, reason: "Invalid URL" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: `Unsupported protocol: ${url.protocol}` };
  }
  return { ok: true, url };
}

async function extractUrl(req: NextRequest): Promise<string | null> {
  if (req.method === "GET") {
    const u = req.nextUrl.searchParams.get("url");
    return u?.trim() || null;
  }
  if (req.method === "POST") {
    const ct = req.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      const body = await req.json().catch(() => null);
      if (body && typeof body === "object" && typeof body.url === "string") return body.url.trim();
    } else {
      const text = await req.text();
      if (!text) return null;
      try {
        const j = JSON.parse(text);
        if (j && typeof j.url === "string") return j.url.trim();
      } catch {
        return text.trim();
      }
    }
  }
  return null;
}

async function handle(req: NextRequest): Promise<NextResponse<OgResponse>> {
  const input = await extractUrl(req);
  if (!input) {
    return NextResponse.json(
      { ok: false, error: "Missing url parameter" },
      { status: 400, headers: CORS_HEADERS },
    );
  }
  const v = isValidHttpUrl(input);
  if (!v.ok) {
    return NextResponse.json({ ok: false, error: v.reason }, { status: 400, headers: CORS_HEADERS });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  const t0 = Date.now();

  let res: Response;
  try {
    res = await fetch(v.url.toString(), {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": CRAWLER_UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
    });
  } catch (err) {
    clearTimeout(timeout);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error && err.name === "AbortError" ? "Fetch timed out" : "Fetch failed",
        details: msg,
      },
      { status: 502, headers: CORS_HEADERS },
    );
  }
  clearTimeout(timeout);

  const finalUrl = res.url || v.url.toString();
  const contentType = res.headers.get("content-type") ?? "";
  const bytesHeader = res.headers.get("content-length");
  const html = await res.text();
  const bytes = bytesHeader ? parseInt(bytesHeader, 10) : html.length;

  const elapsed = Date.now() - t0;

  if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
    return NextResponse.json(
      {
        ok: false,
        error: `Non-HTML response (${contentType || "unknown"})`,
        details: `URL returned ${res.status}. Image may live here directly; open it in a new tab.`,
      },
      { status: 200, headers: CORS_HEADERS },
    );
  }

  const parsed = parseOg(html, finalUrl);

  return NextResponse.json(
    {
      ok: true,
      pageUrl: v.url.toString(),
      finalUrl,
      httpStatus: res.status,
      contentType,
      bytes,
      fetchDurationMs: elapsed,
      redirected: finalUrl !== v.url.toString(),
      userAgent: CRAWLER_UA,
      parsed,
    },
    { headers: CORS_HEADERS },
  );
}

export async function GET(req: NextRequest) {
  return handle(req);
}
export async function POST(req: NextRequest) {
  return handle(req);
}
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

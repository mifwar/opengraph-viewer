import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const CRAWLER_UA =
  "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php) OpenGraph-Viewer/0.1";

const TIMEOUT_MS = 15_000;

export async function GET(req: NextRequest) {
  const target = req.nextUrl.searchParams.get("url");
  if (!target) {
    return NextResponse.json({ error: "Missing url" }, { status: 400, headers: CORS_HEADERS });
  }
  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400, headers: CORS_HEADERS });
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return NextResponse.json(
      { error: `Unsupported protocol: ${parsed.protocol}` },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(parsed.toString(), {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": CRAWLER_UA, Accept: "image/*,*/*;q=0.8" },
    });
  } catch (err) {
    clearTimeout(timeout);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: err instanceof Error && err.name === "AbortError" ? "Image fetch timed out" : "Image fetch failed", details: msg },
      { status: 502, headers: CORS_HEADERS },
    );
  }
  clearTimeout(timeout);

  const headers = new Headers(CORS_HEADERS);
  const ct = res.headers.get("content-type");
  if (ct) headers.set("Content-Type", ct);
  const cl = res.headers.get("content-length");
  if (cl) headers.set("Content-Length", cl);
  headers.set("Cache-Control", "no-store");

  return new NextResponse(res.body, { status: res.status, headers });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

import { dashboardSnapshot } from "@/lib/server/dashboard";
import { createHash } from "node:crypto";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const data = await dashboardSnapshot();
    const etag =
      '"' +
      createHash("sha256")
        .update(
          JSON.stringify({
            sources: data.sources,
            weights: data.weights,
            clients: data.clients,
          }),
        )
        .digest("hex") +
      '"';
    const headers = { "Cache-Control": "private, no-cache", ETag: etag };
    if (request.headers.get("if-none-match") === etag)
      return new Response(null, { status: 304, headers });
    return Response.json(data, { headers });
  } catch {
    return Response.json(
      {
        error:
          "Dashboard configuration could not be validated. Check server provider settings and exposure weights.",
      },
      { status: 503 },
    );
  }
}

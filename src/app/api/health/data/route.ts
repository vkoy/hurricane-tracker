import { deploymentHealth } from "@/lib/server/monitoring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const report = await deploymentHealth();
  return Response.json(report, {
    status: report.status === "error" ? 503 : 200,
    headers: { "Cache-Control": "no-store" },
  });
}

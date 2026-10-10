const deployment = process.env.STORMGRID_MONITOR_URL;
if (!deployment || new URL(deployment).protocol !== "https:") {
  throw new Error(
    "Set STORMGRID_MONITOR_URL to the deployment's HTTPS origin.",
  );
}
let lastError;
for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    const response = await fetch(new URL("/api/health/data", deployment), {
      signal: AbortSignal.timeout(90000),
      headers: { Accept: "application/json" },
    });
    const report = await response.json();
    if (
      report.service !== "stormgrid-intelligence" ||
      !Array.isArray(report.checks) ||
      !Number.isFinite(Date.parse(report.checkedAt)) ||
      Date.now() - Date.parse(report.checkedAt) > 5 * 60000
    ) {
      throw new Error("Invalid or outdated monitoring response.");
    }
    for (const check of report.checks)
      console.log(`[${check.status}] ${check.id}: ${check.message}`);
    if (!response.ok || !["ok", "warning"].includes(report.status))
      throw new Error(
        `Deployment data check failed (HTTP ${response.status}).`,
      );
    console.log(
      `Deployment checked at ${report.checkedAt}; revision ${report.revision || "unknown"}.`,
    );
    process.exit(0);
  } catch (error) {
    lastError = error;
    console.error(`Attempt ${attempt}/3: ${error.message}`);
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}
throw lastError;

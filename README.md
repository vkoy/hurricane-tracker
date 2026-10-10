# StormGrid Intelligence

A responsive storm and electric-grid operations dashboard built with Next.js, React, TypeScript, Tailwind CSS, MapLibre GL JS and Turf.js. It uses retrieved NOAA forecasts and a documented public utility-territory archive. There are no hardcoded operational storms, rankings, outage reports or exposed customer counts.

## Phase 1 capabilities

- Interactive U.S. map with bundled geographic context, zoom/pan, storm centers, observed tracks, forecast tracks/positions, uncertainty cones and official forecast wind polygons.
- Independent utility-boundary and calculated exposure overlays; clickable territories and utility detail panels.
- Utility rankings calculated from geodesic intersections, searchable by company, source state/city and type; risk/state/type filters; score/customer/outage/asset sort controls. Unavailable metrics stay unavailable.
- Track/forecast playback with issue and valid timestamps, source health, archived/stale/partial states, methodology, JSON export and light/dark mode.
- Desktop operations layout and mobile drawers. Source-availability alerts are available; utility threshold alerts are Phase 2.

## Client-only portfolio

The operational dashboard is restricted server-side to the requested client list in `data/clients.json`. It contains **47 clients**, with PSEGLI and its muni portal combined into one entry as requested. CSU means Colorado Springs Utilities. The full national archive remains an ingestion reference; unlisted utilities are excluded before spatial scoring and are not sent in map features, ranking assessments, or operational exports.

- **42 clients match 71 distinct archived operating-company territories.** Parent companies (including AEP, Ameren, Evergy, Eversource, FirstEnergy, LG&E/KU, National Grid and PHI) can have several rows, each with its own actual territory score. No unsupported corporate aggregate score or customer sum is produced. Current ownership and complete group coverage are not established by an archive match.
- **Altice, Hydro One, Hydro Ottawa, Nova Scotia Power and Toronto Hydro remain visible but have no connected boundary.** Altice needs a permitted telecommunications/network footprint; the four Canadian clients need authoritative permitted Canadian boundary data. Selecting one shows an empty utility layer and unavailable exposure, not another client's geography or zero risk.
- Use **Client portfolio** to filter both map and rankings to one client. Search accepts the provided names and aliases, including APC, AE, BG&E, CenHud, DESC, GPC, MPC, OGE, ORU, OUC, PEC, PHI, PNM, REC, SDGE, SECO, SMECO and TNMP. The PSEGLI muni portal is a search alias.
- Each registry member uses an explicit archive ID **and** exact normalized source name. No fuzzy name matching is used: Santee Electric Cooperative is not Santee Cooper; Sumter EMC in Georgia is not SECO in Florida; Austin, Minnesota is not Austin Energy. National Grid does not include Narragansett/Rhode Island Energy. Dominion Virginia and DESC are separate entries. PSEGLI uses the archived LIPA service footprint and is distinct from PSE&G.
- **Data sources → Client portfolio coverage** lists every client, available territories and limitations. Monitoring reports known unconnected clients as coverage warnings rather than network outages. A provider override also passes through this allowlist; update reviewed ID/name pairs if the provider uses different identities. Never bypass the allowlist with an approximate match.

To change the portfolio, edit `data/clients.json`, verify each ID/name against the source, run `npm test`, and redeploy. Tests check the requested list size, alias handling, absence of unrelated utilities, ambiguous-name exclusions, parent-group gaps and missing Canadian/telecom coverage.

## Start and test

Use Node.js 22.19+ or Node 24 LTS and npm. Tested on Node 24.19.0.

```sh
cd /workspace/hurricane-tracker
npm ci
npm run dev
```

Cloud tasks already have an isolated checkout. Use it; do not create another Git worktree unless requested. This sandbox's home npm cache is not writable: use `npm ci --cache /tmp/stormgrid-npm-cache`.

```sh
npm run typecheck
npm test
npm run build
npm start
```

The application listens on port 3000 (`PORT` can override it). `GET /api/health` checks startup; `GET /api/dashboard` provides normalized records, geographic layers, assessments and source status. HTTP health does not imply all providers are available.

Browser checks:

```sh
npx playwright install chromium
npm run test:e2e
# This cloud image already has Chromium:
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:e2e
```

Unit tests cover area intersections, double-counting, missing-data normalization, storm isolation, cone-only rejection, weight validation, provider schemas, NHC timestamps and last-success caching. Playwright covers desktop/mobile rendering, independent layer switches, no-active-storm behavior, calculated rankings, selection, filters and dialogs. Synthetic fixtures are confined to intercepted automated tests and are never served by application routes.

## Deploy on Render

Create a Node web service connected to this repository's `main` branch. Use:

- Build command: `npm ci --include=dev && npm run build`
- Start command: `npm start`
- Health check: `/api/health`
- Environment: `NODE_VERSION=24.19.0`, `NODE_ENV=production`
- Persistent disk mount: `/var/data`
- Cache setting: `STORMGRID_CACHE_DIR=/var/data/stormgrid-cache`

Choose a service plan supporting persistent disks and start with one instance.
Render supplies `PORT`; the start command binds to all network interfaces.
No database or API keys are required for the default sources. Keep the committed
`data/` and `public/` directories in the deployment.
The `prebuild` and `predev` scripts copy the installed MapLibre worker into
`public/vendor/`; it is served locally and requires no external CDN.

Builds require development dependencies, including TypeScript and Tailwind.
The committed `.npmrc` includes them even with `NODE_ENV=production`; the explicit
build flag above also documents this requirement. Omitting them can produce
`Can't resolve '@/components/dashboard'` or `@/lib/server/dashboard` errors even
though those source files exist. For a failed deployment, update the build command
and deploy the latest commit again.

After deployment, check the public page, `/api/health`, and **Data connections**.
NOAA requires outbound HTTPS to `www.nhc.noaa.gov` and
`mapservices.weather.noaa.gov`. Archived utility status is expected; failed or
stale NOAA status needs investigation even when the HTTP health check succeeds.

If you have not attached a persistent disk, leave `STORMGRID_CACHE_DIR` unset;
setting the variable does not create or attach a disk. The default local cache
is lost when the host replaces the instance. If the configured directory is not
writable, successful feeds still load using a bounded in-memory cache. **Data
connections** and server logs show a persistent-cache warning; last-success
fallback then lasts only until restart. Attach the disk or correct the writable
cache path to restore persistence.

## Data sources and actual verification

### Official NOAA NHC forecasts

- Current storm summary: <https://www.nhc.noaa.gov/CurrentStorms.json>
- GIS service: <https://mapservices.weather.noaa.gov/tropical/rest/services/tropical/NHC_tropical_weather/MapServer>
- Product documentation: <https://www.nhc.noaa.gov/gis/>
- Government information terms: <https://www.noaa.gov/disclaimer>

These public feeds require no API key. Allow `www.nhc.noaa.gov` and `mapservices.weather.noaa.gov` through the environment's egress policy. The server honors HTTP(S) proxies through Undici and keeps TLS verification enabled.

Both services were retrieved and inspected during implementation. The tested snapshot contained three storm summaries, 19 track segments, 94 observed/forecast positions, two cones and 20 forecast wind-radius polygons. These are a validation snapshot, not fixed application values. One reported storm had no associated GIS positions; that is explicitly reported as **partial coverage**, and no wind footprint or exposure score is invented for it.

The adapter discovers supported layers from service metadata and queries only active storm wallets. It associates features through `STORMID` or the ATCF identifier in `idp_source`, not a guessed match against prefixed display names. NHC compact numeric DTGs and UTC `DD/HHMM` valid times are normalized, including month rollover. Observed history and forecast tracks remain distinct. GIS `MAXWIND`, `TCSPD` and forecast `RADII` follow NHC knot conventions; ambiguous current-summary intensity values are not assigned a guessed unit. Invalid/truncated upstream responses fail closed.

Advisories older than 12 hours, or missing issue dates, are marked stale. Not all official products are published for every storm or period. Missing forecast wind geometry never becomes a cone-shaped wind field. A successful empty storm response is distinct from an unavailable feed.

### Public, archived utility territories

The default national layer is a **dated public-domain HIFLD archive**, attributed to ORNL / DOE CESER and hosted by `NBAM_Org`:

- [Dataset and public-use terms](https://www.arcgis.com/home/item.html?id=597555ce8e4a4892a030784a7c657fdd)
- [Original metadata XML](https://www.arcgis.com/sharing/rest/content/items/597555ce8e4a4892a030784a7c657fdd/info/metadata/metadata.xml)
- [Public polygon service](https://services3.arcgis.com/OYP7N6mAJJCyH6hd/arcgis/rest/services/Electric_Retail_Service_Territories_HIFLD/FeatureServer/0)

Metadata states **public-domain information / public use**, publication September 30, 2024, source dates September 2015–August 2023. The host archived the layer August 21, 2025 and says it will not update it. The application labels it **archived**, not live or current legal boundaries.

The source contains 2,931 records. The reviewed snapshot includes **2,920 valid territories**, including Florida Power & Light and Southern California Edison. **234 previously excluded records** were recovered by dissolving overlapping or nested, individually valid source polygons. This preserves the geographic union of their original coverage and removes double-counting within a utility. **11 records remain excluded** because individual polygon components are invalid. The exact exclusions, source timestamps, and per-record recovery audit are in `data/utility-source.json`. Data sources lists every remaining coverage gap; absence is **not evidence of no exposure**. Record coverage is not a percentage of U.S. land or customers covered.

Boundaries are generalized using GEOS topology-preserving simplification at 0.002 degrees for regional screening. Recovery first requires every component to be valid, then verifies that the union covers every original component before simplification. No `buffer(0)`, `make_valid`, inferred territory, or repair of invalid individual polygons is used. Utility detail panels disclose normalized geometry. Boundaries may still overlap between companies, use county approximations, or be outdated. **Recovery improves usability, not the source vintage**; verify current utility-published boundaries before operational use.

Each utility retains its original source date, source description, customer-data year and publisher record. `STATE` and `CITY` are **entity attributes supplied by the source**, not a spatially computed list of all served states/cities. Customer totals are historical entity totals; they are never treated as exposed customer counts.

The verified archive is bundled so a new checkout can display real territories without an external boundary request. To rebuild it from the public service (not needed to run the app):

```sh
python -m venv /tmp/stormgrid-ingest
/tmp/stormgrid-ingest/bin/pip install shapely==2.2.0
/tmp/stormgrid-ingest/bin/python scripts/ingest-utility-archive.py
/tmp/stormgrid-ingest/bin/python scripts/recover-utility-overlaps.py
/tmp/stormgrid-ingest/bin/python -m unittest discover -s tests -p 'test_*.py'
```

The first script checks complete downloads, retries native geometry and quarantines invalid records. The second downloads the excluded native records, performs only the constrained union described above, and retains an audit trail. Review changed coverage and source terms before accepting a refreshed snapshot. The `--reuse-downloads` option is only for temporary development downloads.

Source review also rejected a Lee County layer that infers FPL territory outside LCEC coverage, and a Texas layer titled Electric Utilities with water/sewer metadata. Public availability alone is not sufficient evidence of authoritative electric-service boundaries.

### Replace the archive with a current reviewed provider

Copy `.env.example` to `.env.local`. Restart the server after configuration changes. All settings are **server-side**; do not use `NEXT_PUBLIC_*` for credentials. Public source URLs must not contain tokens or other secrets. Private services require a dedicated authenticated server-side adapter.

| Variable                  | Meaning                                                                                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `UTILITY_SERVICE_URL`     | Public HTTPS GeoJSON URL or specific ArcGIS polygon layer ending `/FeatureServer/0` or `/MapServer/0` (actual layer ID may vary). Unset uses the archive.                 |
| `UTILITY_SOURCE_URL`      | Public source/documentation link shown to users.                                                                                                                          |
| `UTILITY_ATTRIBUTION`     | Verified publishing utility/agency. Required for an override.                                                                                                             |
| `UTILITY_LICENSE`         | Reviewed reuse/redistribution terms. Required for an override.                                                                                                            |
| `UTILITY_SOURCE_DATE`     | Actual ISO dataset vintage. Required for an override.                                                                                                                     |
| `UTILITY_FIELD_MAP`       | JSON mapping normalized `id`, `name`, `state`, `type`, `customers`, `website` and optional `sourceDate`, `city`, `customerYear`, `boundarySource` to provider attributes. |
| `UTILITY_DISABLE_ARCHIVE` | Set to `true` to show no territories when no override is configured.                                                                                                      |
| `EXPOSURE_WEIGHTS`        | Six nonnegative administrator weights that sum to 100.                                                                                                                    |
| `STORMGRID_CACHE_DIR`     | Writable persistent cache location; defaults to `.stormgrid-cache`.                                                                                                       |

An override requires unique polygon IDs, names and valid WGS84 Polygon/MultiPolygon geometry. Optional fields remain null when absent. ArcGIS retrieval obtains all object IDs, respects the service's record limit and rejects incomplete/truncated pages. The current generic adapter supports at most 10,000 polygons and 24 MB per upstream response. Use reviewed, appropriately generalized data for large services; invalid override data fails closed. No service territory is inferred from EIA customer tables.

Add the chosen provider hostname to environment networking. NOAA and ArcGIS domains were saved in the environment draft; draft saving and publication are distinct from runtime access. Verify the actual operation in **Data connections** after configuration changes.

## Refresh and performance

### Deployment monitoring

- `/api/health` is the cheap Render process health check. Keep this as Render's health-check path so a NOAA outage does not cause restart loops.
- `/api/health/data` checks official-feed retrieval freshness, expected source coverage, loaded utility geometries and a real cache write/delete probe. It returns **503** for unavailable/stale/overdue feeds, missing utility data or unwritable cache; **200 with warning** for known partial GIS coverage and archived utility vintage. Verified no-active-storm responses do not require GIS geometry. The response is small, excludes paths and credentials, and identifies the Render commit when available.
- Checks are coalesced and cached for 60 seconds. A recent retrieval must be within twice its refresh interval (minimum 30 minutes). Advisory-age checks also remain in the NOAA adapter. A writable directory does not prove persistent-disk attachment.
- `.github/workflows/monitor-deployment.yml` checks the current Render deployment every 10 minutes and can be run manually under **GitHub → Actions → Monitor deployment**. The default URL is `https://hurricane-tracker-3cdl.onrender.com`. Set the repository Actions variable `STORMGRID_MONITOR_URL` to change it. Each run retries failures, prints individual checks and fails visibly when data readiness is broken. No paid monitor or secrets are required. This also warms the on-demand feed cache.
- GitHub schedules can be delayed, disabled for inactivity, or limited by your Actions allowance. For a stricter operational SLA, point an external uptime monitor at `/api/health/data`. This repository does not configure email/SMS delivery; GitHub notification preferences remain yours.

Run the same check manually with `STORMGRID_MONITOR_URL=https://your-app.example node scripts/check-deployment.mjs`.

### Detailed MapLibre basemap

The default map adds street, waterway, building and place context from **OpenFreeMap**, with OpenStreetMap/OpenMapTiles attribution. Its public instance requires no registration or API key and documents no request/view limit: [provider documentation](https://github.com/hyperknot/openfreemap#readme). Map data is periodically refreshed, not live weather or a verified infrastructure inventory. No uptime SLA is assumed.

Browser networking must allow `https://tiles.openfreemap.org` for vector tiles and fonts. Requests go directly from the browser; no bulk download or server-side tile proxy is used. When it fails, the bundled Natural Earth/Census map and operational overlays remain usable, with an explicit fallback message. The **Basemap** button cycles detailed streets, the offline map and high contrast. Dark/light styling is supported; building detail appears at neighborhood zoom. These building outlines must not be interpreted as grid assets.

Google Maps remains a possible future renderer, but this implementation keeps MapLibre and needs no Google billing account or key.

- The open dashboard polls the server every 60 seconds. Conditional ETags avoid retransmitting unchanged geographic datasets.
- NHC results are cached for 10 minutes; optional live boundary providers for 24 hours. Public services offer no application-guaranteed rate limit or SLA; recheck provider terms before public deployment.
- Concurrent requests are coalesced. A failed refresh retains the last successful normalized payload on disk, explicitly marked stale with its original retrieval timestamp.
- The archived boundary source is immutable and retains its actual archive retrieval time. It is not relabeled fresh on each page request.
- Spatial bounding-box rejection and cached areas avoid unnecessary polygon intersections. Client rankings use an indexed assessment lookup and incremental list rendering. MapLibre renders source layers without reloading the page.
- Single-server Phase 1 refreshes on demand. To keep ingestion warm without an open browser, schedule a trusted job every 10 minutes to request `/api/dashboard`; monitor source states as well as HTTP health. Example cron: `*/10 * * * * curl --fail --silent --show-error http://127.0.0.1:3000/api/dashboard >/dev/null`.
- For multiple replicas or detailed national asset inventories, add shared cache/storage, distributed scheduling, vector tiles and PostGIS spatial indexes. No database is needed for this bounded Phase 1 dataset.

## Exposure model

| Factor            | Weight | Input                                                                                            |
| ----------------- | -----: | ------------------------------------------------------------------------------------------------ |
| Forecast wind     |    25% | Maximum intersecting official forecast wind-radius threshold in knots, capped at 100.            |
| Territory overlap |    20% | Geodesic area inside the union of official ≥34 kt forecast wind polygons / total territory area. |
| Customers exposed |    20% | Unavailable until verified spatial customer data or a validated allocation model exists.         |
| Critical assets   |    15% | Unavailable until a verified, permitted asset inventory exists.                                  |
| Surge/flooding    |    10% | Unavailable until verified hazard-depth data exists.                                             |
| Scenario exposure |    10% | Percent of territory in the official center-track uncertainty cone.                              |

`score = round(sum(available factor × weight) / sum(available weights))`

Missing inputs are null, not zero. Available weights are renormalized. Completeness is the proportion of total model weight with available inputs. For example, wind + territory + cone have 55% completeness. Scores with differing factor sets should not be compared without reviewing those differences. Every result exposes contributing values, weights, computation time and an explanation.

Wind polygons are unioned before intersection so overlapping forecast periods are not double-counted. The cone is a scenario-sensitivity factor, **not a wind footprint or local impact probability**; a cone alone cannot produce a score. An all-storm low-exposure label is withheld when another active storm has no hazard data. Positive all-storm rankings describe the highest **available** assessment; select a storm for explicit scope.

Risk bands: low 0–19, moderate 20–39, high 40–59, very high 60–79, extreme 80–100. These are configurable index assumptions, not validated outage coefficients. A small intersecting wind zone may raise the wind factor even when much of the territory is unexposed. Input-coverage confidence is limited below 60%, moderate at 60–79%, high at 80% or above; it does not establish forecast skill or boundary currency.

The timeline reveals observed and forecast positions. Scores and hazard polygons use the full available advisory footprint, not an invented hour-specific forecast. Reported outages, estimated exposed customers, asset failures and restoration estimates remain unavailable until verified sources are connected.

## Structure and remaining scope

```text
src/app/                     Page, styles, dashboard and health API routes
src/components/              Dashboard, dialogs and MapLibre map
src/lib/types.ts             Normalized provider and assessment contracts
src/lib/scoring.ts           Turf geodesic overlap and weighted scoring
src/lib/selection.ts         Indexed, missing-data-aware ranking selection
src/lib/server/providers.ts  Validating NOAA and custom boundary adapters
src/lib/server/http.ts       Bounded proxy-aware HTTP and last-success cache
src/lib/server/utility-archive.ts  Dated public boundary snapshot loader
src/lib/server/dashboard.ts Provider orchestration and assessment generation
data/                       Actual boundary archive and provenance manifest
public/geo/                 Natural Earth / Census geographic context
scripts/                    Reproducible basemap and territory preparation
tests/                      Unit and desktop/mobile browser checks
```

Basemap GeoJSON comes from `world-atlas` (Natural Earth, public domain) and `us-atlas` (U.S. Census-derived public-domain data). Run `npm run prepare:map` to regenerate it. City labels provide geographic context only. No commercial tile account is required.

Phase 2 controls for surge, transmission, substations, observed outages, population and critical infrastructure are visibly disabled. Historical storm selection, advisory comparison, scenario editing, impact-threshold alerts, authenticated administrator UI, email/SMS and validated outage modeling are not implemented. Current-storm historical-track playback is available. Administrator weights can be changed through the validated server environment setting.

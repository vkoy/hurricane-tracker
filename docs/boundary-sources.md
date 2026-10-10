# Additional client boundary review

Reviewed October 10, 2026. The 47-client allowlist remains unchanged. Public
discoverability alone is not evidence of permitted reuse or authoritative origin.

## Ontario: connected as a reviewed snapshot

The [Land Information Ontario catalogue entry](https://www.arcgis.com/home/item.html?id=1095a9f75eab4c23bb40c139825ead77)
is marked authoritative and links to the Ministry's
[LDC Boundaries Map](https://www.arcgis.com/home/item.html?id=94a074ee344e4c7fb60fed59171fd8bd).
Its configured web map (`f97d03444d1e47c990f5d4321a070563`) references the
[ENERGY_LDC_ED polygon service](https://services7.arcgis.com/6QOxmnOtgEvCBqJG/arcgis/rest/services/ENERGY_LDC_ED/FeatureServer/0).
The map identifies the Ontario Energy Board as the originator. The catalogue
and map explicitly identify the [Open Government Licence – Ontario](https://www.ontario.ca/page/open-government-licence-ontario),
permitting reuse including commercial use with attribution and no endorsement.
The standalone layer item has no separate licence text; the licence evidence is
the official catalogue and parent application, retained in the snapshot manifest.

**Contains information licensed under the Open Government Licence – Ontario.**
Ontario Ministry of Energy / Ontario Energy Board. No endorsement is implied.

| Source licence | Client / operating entity | Result |
| --- | --- | --- |
| ED-2002-0497 | Toronto Hydro-Electric System Limited | Valid native polygon included |
| ED-2002-0556 | Hydro Ottawa Limited | Valid overlapping component polygons dissolved, then included |
| ED-2003-0037 | Hydro One Remote Communities Inc. | Valid overlapping component polygons dissolved, then included |
| ED-2003-0043 | Hydro One Networks Inc. | Invalid individual rings; entire record excluded |

The older Ontario government 2023 service was also inspected for Hydro One
Networks and has invalid individual rings. Neither version was repaired, reduced
to a city/province envelope, nor partially included under the full company name.
Hydro One is marked **partial**, with Remote Communities scored separately.

For overlapping valid components, GEOS union must cover every original component.
All included results pass validity checks before and after topology-preserving
generalization at 0.002 degrees. Per-record hashes, validity findings and methods
are in `data/ontario-client-source.json`; geometry is in
`data/ontario-client-territories.geojson`.

The service's layer-level data edit timestamp is November 24, 2025. This is **not**
an effective date for each boundary. Individual effective dates and customer
vintages could not be established, so boundary dates, customer counts, customer
exposure, asset exposure and outages are not inferred. The application displays
retrieval time separately. The provider describes its map as illustrative, with
no accuracy/completeness guarantee; regional screening is not a legal-boundary
determination. NHC hazard availability also does not establish complete Canadian
weather-hazard coverage, especially after tropical systems transition.

Queries were publicly accessible without a key and returned the complete four
requested licence/name pairs. No contractual quota, SLA, or reliable refresh
interval was established. Deployment serves the bundled snapshot without calling
Ontario per page load. Refresh is a manual, reviewed import and redeploy:

```sh
python -m pip install --target /tmp/stormgrid-geometry shapely==2.2.0
PYTHONPATH=/tmp/stormgrid-geometry python scripts/ingest-ontario-clients.py
PYTHONPATH=/tmp/stormgrid-geometry python -m unittest discover -s tests -p 'test_boundary_normalization.py'
npm test
npm run build
```

Review changed licence terms, source identity, exclusions, snapshot counts and
client notes before committing a refresh. Network destinations for ingestion:
`www.arcgis.com` and `services7.arcgis.com`. Setting `UTILITY_SERVICE_URL` replaces
both bundled providers; `UTILITY_DISABLE_ARCHIVE=true` disables both. The reviewed
allowlist still applies. No new Render environment variables or API keys are needed.

## Still unconnected

- **Nova Scotia Power:** no authoritative reusable service-area polygon was
  verified in the accessible ArcGIS catalogue. Province-wide or municipal
  boundaries would imply unsupported coverage, so none were substituted.
- **Altice:** catalogue results included network examples, site locations,
  county aggregates, broadband adoption tables and limited regional projects.
  These did not establish a complete, licensed client service/network footprint.
  An approved telecom footprint needs its own documented meaning and exposure
  inputs; it must not be treated as an electric utility with electric customers.

These findings are limited to the sources reviewed, not a claim that suitable
data does not exist. Direct access to `data.ontario.ca` and `www.oeb.ca` was blocked
by this cloud environment's network policy; the official ArcGIS catalogue,
Ministry application, linked layer and their published terms were accessible.
Further publisher-site research may require additional allowed domains. A
client-supplied licensed GeoJSON/shapefile or permitted public provider remains
the path for the two unconnected clients and the excluded Hydro One territory.

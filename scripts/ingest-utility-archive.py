"""Build the public, dated HIFLD territory snapshot. Requires shapely==2.2.0.

Geometry is checked with GEOS; invalid generalized shapes are retried at native
resolution, and invalid native records are quarantined rather than repaired.
No fictitious boundaries or customer allocations are introduced.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import json
from pathlib import Path
import urllib.parse
import urllib.request

from shapely.geometry import mapping, shape

BASE = 'https://services3.arcgis.com/OYP7N6mAJJCyH6hd/arcgis/rest/services/Electric_Retail_Service_Territories_HIFLD/FeatureServer/0'
SOURCE = 'https://www.arcgis.com/home/item.html?id=597555ce8e4a4892a030784a7c657fdd'
FIELDS = 'ID,NAME,STATE,TYPE,CUSTOMERS,WEBSITE,SOURCEDATE,YEAR,CITY,SOURCE'


def fetch(params):
    with urllib.request.urlopen(BASE + '/query?' + urllib.parse.urlencode(params), timeout=90) as response:
        value = json.load(response)
    if value.get('error') or value.get('exceededTransferLimit'):
        raise ValueError('Provider error or truncated response')
    return value


def valid(feature):
    geometry = shape(feature['geometry'])
    return geometry.is_valid and not geometry.is_empty and geometry.area > 0


def source_date(value):
    return datetime.fromtimestamp(value / 1000, timezone.utc).isoformat().replace('+00:00', 'Z') if isinstance(value, (int, float)) else None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--reuse-downloads', action='store_true', help='Use the three validated development downloads in /tmp')
    args = parser.parse_args()
    if args.reuse_downloads:
        coarse = json.loads(Path('/tmp/stormgrid-utility-snapshot.json').read_text())['features']
        refined = {f['properties']['ID']: f for f in json.loads(Path('/tmp/stormgrid-refined-utilities.json').read_text())['features']}
        native = {f['properties']['ID']: f for f in json.loads(Path('/tmp/stormgrid-native-utilities.json').read_text())['features']}
    else:
        ids = fetch({'where': '1=1', 'returnIdsOnly': 'true', 'f': 'json'})['objectIds']
        def batch(items):
            return fetch({'objectIds': ','.join(map(str, items)), 'outFields': FIELDS, 'outSR': 4326, 'f': 'geojson', 'maxAllowableOffset': 0.002})['features']
        with ThreadPoolExecutor(max_workers=3) as pool:
            coarse = [f for batch_result in pool.map(batch, [ids[i:i+250] for i in range(0,len(ids),250)]) for f in batch_result]
        if len(coarse) != len(ids):
            raise ValueError('Incomplete provider download')
        invalid_ids = [f['properties']['ID'] for f in coarse if not valid(f)]
        def original(items):
            where = 'ID IN (' + ','.join("'" + identifier.replace("'", "''") + "'" for identifier in items) + ')'
            return fetch({'where': where, 'outFields': FIELDS, 'outSR': 4326, 'f': 'geojson'})['features']
        with ThreadPoolExecutor(max_workers=3) as pool:
            native = {f['properties']['ID']: f for batch_result in pool.map(original, [invalid_ids[i:i+20] for i in range(0,len(invalid_ids),20)]) for f in batch_result}
        refined = {}

    features, excluded = [], []
    for f in coarse:
        identifier = f['properties']['ID']
        chosen = next((candidate for candidate in [f, refined.get(identifier), native.get(identifier)] if candidate and valid(candidate)), None)
        if chosen is None:
            excluded.append({'id': identifier, 'name': f['properties']['NAME'], 'reason': 'Invalid native or unavailable polygon; not repaired or scored'})
            continue
        # GEOS topology-preserving generalization, max tolerance 0.002 degrees.
        geometry = shape(chosen['geometry']).simplify(0.002, preserve_topology=True)
        if not geometry.is_valid or geometry.is_empty:
            raise ValueError('Unexpected invalid simplification')
        p = chosen['properties']
        website = p.get('WEBSITE')
        if not isinstance(website, str) or not website.startswith('https://'):
            website = None
        count = p.get('CUSTOMERS')
        properties = {
            'id': identifier, 'name': p['NAME'], 'state': p.get('STATE') or 'Not provided',
            'type': p.get('TYPE') or 'Not provided', 'city': p.get('CITY') or '',
            'customers': count if isinstance(count,(int,float)) and count >= 0 else None,
            'customerYear': p.get('YEAR'), 'website': website, 'sourceUrl': SOURCE,
            'sourceDate': source_date(p.get('SOURCEDATE')), 'boundarySource': p.get('SOURCE'),
        }
        features.append({'type': 'Feature', 'geometry': mapping(geometry), 'properties': properties})
    if len({f['properties']['id'] for f in features}) != len(features):
        raise ValueError('Duplicate utility IDs')
    directory = Path(__file__).resolve().parents[1] / 'data'
    directory.mkdir(exist_ok=True)
    (directory/'utility-territories.geojson').write_text(json.dumps({'type':'FeatureCollection','features':features},separators=(',',':')))
    manifest = {
        'source': SOURCE, 'service': BASE, 'retrievedAt': datetime.now(timezone.utc).isoformat().replace('+00:00','Z'),
        'datasetPublication': '2024-09-30', 'sourceDateRange': ['2015-09-30','2023-08-01'], 'archivedAt': '2025-08-21',
        'publisher': 'ORNL / DOE CESER; public HIFLD copy hosted by NBAM_Org',
        'license': 'None (Public Domain Information); None (Public Use). Read source metadata for limitations.',
        'sourceRecordCount': len(coarse), 'includedCount':len(features),'excludedCount':len(excluded),'excluded':excluded,
        'processing': 'GEOS validity checks; invalid generalized polygons retried at higher/native resolution. No geometry repair. Topology-preserving generalization at 0.002 degrees for regional screening; area-based exposure is approximate.',
        'limitations': 'Archived, not current legal boundaries. Source geometries may be county approximations, overlap or omit territories. Source attributes have varying vintages. STATE and CITY are provider entity attributes, not a computed list of every state/city intersecting the territory. Customers are entity totals from YEAR, never modeled exposed customers.',
    }
    (directory/'utility-source.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(f'Wrote {len(features)} real archived territories; quarantined {len(excluded)} invalid records.')


if __name__ == '__main__':
    main()

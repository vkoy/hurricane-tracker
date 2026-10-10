"""Recover invalid multipart archives only by unioning individually valid polygons.

Requires shapely==2.2.0. No buffer, make_valid, inferred edges, or topology repair
of individual polygons is permitted. Original source coverage is preserved as
the geographic union; overlapping areas cease to be counted more than once.
Run after ingest-utility-archive.py to reproduce the reviewed national snapshot.
"""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import json
from pathlib import Path
import urllib.parse
import urllib.request
from shapely import union_all, is_valid_reason
from shapely.geometry import shape, mapping

ROOT = Path(__file__).resolve().parents[1]

def dissolve_valid_components(geometry):
    if geometry.is_valid:
        return geometry
    if geometry.geom_type != 'MultiPolygon' or not all(p.is_valid and not p.is_empty for p in geometry.geoms):
        raise ValueError('An individual polygon is invalid; no repair attempted')
    merged = union_all(list(geometry.geoms))
    if not merged.is_valid or merged.is_empty or merged.geom_type not in ['Polygon', 'MultiPolygon']:
        raise ValueError('Union did not produce a valid polygon')
    # GEOS union must retain every supplied component, including all islands.
    if not all(merged.covers(p) for p in geometry.geoms):
        raise ValueError('Union failed coverage preservation check')
    return merged

def main():
    directory = ROOT / 'data'
    manifest = json.loads((directory / 'utility-source.json').read_text())
    collection = json.loads((directory / 'utility-territories.geojson').read_text())
    ids = [r['id'] for r in manifest['excluded']]
    if not ids:
        print('No excluded records remain.'); return
    def fetch(batch):
        where = 'ID IN (' + ','.join("'" + i.replace("'", "''") + "'" for i in batch) + ')'
        query = urllib.parse.urlencode({'where': where, 'outFields': 'ID,NAME,STATE,TYPE,CUSTOMERS,WEBSITE,SOURCEDATE,YEAR,CITY,SOURCE', 'outSR': 4326, 'f': 'geojson'})
        with urllib.request.urlopen(manifest['service'] + '/query?' + query, timeout=90) as response:
            data = json.load(response)
        if data.get('error') or data.get('exceededTransferLimit'):
            raise ValueError('Source download incomplete')
        return data['features']
    with ThreadPoolExecutor(max_workers=3) as pool:
        features = [f for group in pool.map(fetch, [ids[i:i+10] for i in range(0,len(ids),10)]) for f in group]
    if {str(f['properties']['ID']) for f in features} != set(ids) or len(features) != len(ids):
        raise ValueError('Source IDs do not match the complete requested record set')
    recovered = manifest.get('recovered', [])
    excluded = []
    for f in features:
        p = f['properties']; identifier = str(p['ID'])
        original = shape(f['geometry'])
        try:
            merged = dissolve_valid_components(original)
            generalized = merged.simplify(0.002, preserve_topology=True)
            if not generalized.is_valid or generalized.is_empty:
                raise ValueError('Invalid simplified result')
        except ValueError as error:
            excluded.append({'id': identifier, 'name': p['NAME'], 'reason': str(error)})
            continue
        source_date = p.get('SOURCEDATE')
        source_date = datetime.fromtimestamp(source_date/1000,timezone.utc).isoformat().replace('+00:00','Z') if isinstance(source_date,(int,float)) else None
        count = p.get('CUSTOMERS'); website = p.get('WEBSITE')
        properties = {
            'id': identifier, 'name': p['NAME'], 'state': p.get('STATE') or 'Not provided',
            'type': p.get('TYPE') or 'Not provided', 'city': p.get('CITY') or '',
            'customers': count if isinstance(count,(int,float)) and count >= 0 else None,
            'customerYear': p.get('YEAR'), 'website': website if isinstance(website,str) and website.startswith('https://') else None,
            'sourceUrl': manifest['source'], 'sourceDate': source_date, 'boundarySource': p.get('SOURCE'),
            'geometryProcessing': 'Overlapping valid source polygons dissolved; geographic union preserved, then generalized at 0.002 degrees. Archived boundary, not a current legal territory.',
        }
        collection['features'].append({'type':'Feature','geometry':mapping(generalized),'properties':properties})
        recovered.append({'id':identifier,'name':p['NAME'],'originalValidity':is_valid_reason(original),
            'sourceComponentCount':len(original.geoms) if original.geom_type == 'MultiPolygon' else 1,
            'method':'GEOS union of individually valid source polygons; coverage-preservation check before simplification',
            'sourceDate':source_date})
    if len({f['properties']['id'] for f in collection['features']}) != len(collection['features']):
        raise ValueError('Duplicate IDs after recovery')
    manifest.update({'includedCount':len(collection['features']),'excludedCount':len(excluded),'excluded':excluded,
        'recovered':recovered,'normalizedCount':len(recovered),
        'normalizationRetrievedAt':datetime.now(timezone.utc).isoformat().replace('+00:00','Z'),
        'processing':'GEOS validity checks and topology-preserving generalization at 0.002 degrees. Invalid multipart records are recovered only when all individual polygons are valid and their union preserves every source component. No invalid individual polygon repair or inferred coverage. Per-record recovery audit retained.'})
    (directory/'utility-territories.geojson').write_text(json.dumps(collection,separators=(',',':')))
    (directory/'utility-source.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(f"Included {manifest['includedCount']}; recovered {len(recovered)}; excluded {len(excluded)}")

if __name__ == '__main__': main()

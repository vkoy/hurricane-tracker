"""Retrieve the reviewed Ontario client boundary snapshot (shapely==2.2.0).

Downloads four exact OEB licence/name pairs from the Ministry's public map.
Rejects incomplete responses and invalid individual polygons. Only overlapping
valid multipart polygons may be dissolved, preserving every source component.
No customer estimates, municipal-boundary substitutions, or ring repairs.
"""
import hashlib
import importlib.util
import json
from datetime import datetime, timezone
from pathlib import Path
import urllib.parse
import urllib.request
from shapely.geometry import shape, mapping
from shapely.validation import explain_validity

ROOT = Path(__file__).resolve().parents[1]
SERVICE = 'https://services7.arcgis.com/6QOxmnOtgEvCBqJG/arcgis/rest/services/ENERGY_LDC_ED/FeatureServer/0'
APP_ID = '94a074ee344e4c7fb60fed59171fd8bd'
SOURCE = 'https://www.arcgis.com/home/item.html?id=' + APP_ID
LICENSE = 'https://www.ontario.ca/page/open-government-licence-ontario'
ATTRIBUTION = 'Contains information licensed under the Open Government Licence – Ontario. Ontario Ministry of Energy / Ontario Energy Board.'
EXPECTED = {
    'ED-2003-0043': 'Hydro One Networks Inc.',
    'ED-2003-0037': 'Hydro One Remote Communities Inc.',
    'ED-2002-0556': 'Hydro Ottawa Limited',
    'ED-2002-0497': 'Toronto Hydro-Electric System Limited',
}
spec = importlib.util.spec_from_file_location('recovery', ROOT / 'scripts/recover-utility-overlaps.py')
recovery = importlib.util.module_from_spec(spec)
spec.loader.exec_module(recovery)


def fetch(url):
    with urllib.request.urlopen(url, timeout=60) as response:
        result = json.load(response)
    if result.get('error') or result.get('exceededTransferLimit'):
        raise ValueError('Provider error or truncated response')
    return result


def main():
    item = fetch(f'https://www.arcgis.com/sharing/rest/content/items/{APP_ID}?f=json')
    if item.get('owner') != 'Leah-Marie.Marajh_MoEnergy' or 'Open Government Licence' not in item.get('accessInformation', ''):
        raise ValueError('Publisher or reuse terms changed; review before updating')
    metadata = fetch(SERVICE + '?f=json')
    where = 'ED_Num IN (' + ','.join("'" + i + "'" for i in EXPECTED) + ')'
    query = urllib.parse.urlencode({'where': where, 'f': 'geojson', 'outSR': 4326,
        'outFields': 'ObjectId,LDC_Name,ED_Num,LDCBrand,NotesEN,WebsiteLDC'})
    raw = fetch(SERVICE + '/query?' + query)
    records = raw.get('features', [])
    if len(records) != len(EXPECTED) or {f['properties']['ED_Num']: f['properties']['LDC_Name'] for f in records} != EXPECTED:
        raise ValueError('Incomplete or changed source identities; review required')
    retrieved = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
    features, excluded, audit = [], [], []
    for f in records:
        p = f['properties']
        identifier = 'ON-' + p['ED_Num']
        original = shape(f['geometry'])
        record = {'id': identifier, 'name': p['LDC_Name'], 'sourceObjectId': p['ObjectId'],
            'sourceValidity': explain_validity(original),
            'sourceSha256': hashlib.sha256(json.dumps(f, sort_keys=True).encode()).hexdigest()}
        try:
            merged = recovery.dissolve_valid_components(original)
            simplified = merged.simplify(0.002, preserve_topology=True)
            if simplified.is_empty or not simplified.is_valid or simplified.area <= 0:
                raise ValueError('Invalid generalized geometry')
        except ValueError as error:
            excluded.append({**record, 'reason': str(error)})
            continue
        processing = ('Native valid polygon' if original.is_valid else 'Overlapping valid source components dissolved with coverage-preservation checks') + '; generalized at 0.002 degrees for regional screening. No individual ring repair.'
        notes = 'Government-published illustrative service area; not a precise legal boundary. Per-feature effective date and customer vintage are unavailable. Snapshot is refreshed manually.'
        if p.get('NotesEN'):
            notes += ' ' + p['NotesEN']
        if p['ED_Num'] == 'ED-2003-0037':
            notes += ' Covers Remote Communities only. The main Hydro One Networks territory is excluded due to invalid geometry; its exposure remains unknown.'
        properties = {
            'id': identifier, 'name': p['LDC_Name'], 'state': 'ON',
            'country': 'Canada', 'type': 'Not provided', 'customers': None,
            'customerYear': None, 'website': p['WebsiteLDC'] if p['WebsiteLDC'].startswith('https://') else None,
            'sourceUrl': SOURCE, 'sourceDate': None, 'sourceRetrievedAt': retrieved,
            'boundarySource': 'Ontario Ministry of Energy / Ontario Energy Board',
            'boundaryNotes': notes, 'geometryProcessing': processing,
            'licenseUrl': LICENSE, 'attribution': ATTRIBUTION,
        }
        features.append({'type': 'Feature', 'geometry': mapping(simplified), 'properties': properties})
        audit.append({**record, 'processing': processing})
    manifest = {
        'source': SOURCE, 'service': SERVICE, 'sourceItem': 'da406a9978784582b7ffe0ed842a6833',
        'officialCatalogueItem': 'https://www.arcgis.com/home/item.html?id=1095a9f75eab4c23bb40c139825ead77',
        'publisher': 'Ontario Ministry of Energy / Ontario Energy Board',
        'retrievedAt': retrieved, 'featureEffectiveDate': None,
        'layerDataLastEditAt': datetime.fromtimestamp(metadata['editingInfo']['dataLastEditDate']/1000, timezone.utc).isoformat().replace('+00:00', 'Z'),
        'license': 'Open Government Licence – Ontario', 'licenseUrl': LICENSE,
        'attribution': ATTRIBUTION, 'licenseEvidence': item['accessInformation'],
        'requestedCount': len(EXPECTED), 'includedCount': len(features),
        'excluded': excluded, 'records': audit,
        'limitations': 'Illustrative government-published service areas; not current legal boundaries. Layer edit time is not a per-feature effective date. Hydro One Networks is excluded if any individual ring is invalid; Remote Communities alone is not complete Hydro One coverage. Customer counts and infrastructure exposure are not supplied.',
        'refresh': 'Manual reviewed snapshot import and redeploy; no runtime calls or guaranteed provider update interval/quota. Public ArcGIS queries; no key required at retrieval.',
    }
    (ROOT / 'data/ontario-client-territories.geojson').write_text(json.dumps({'type': 'FeatureCollection', 'features': features}, separators=(',', ':')) + '\n')
    (ROOT / 'data/ontario-client-source.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(f'Ontario: {len(features)} included, {len(excluded)} excluded')


if __name__ == '__main__':
    main()

import importlib.util
import json
from pathlib import Path
import unittest
from shapely.geometry import Polygon, MultiPolygon, box, shape

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('recovery', ROOT/'scripts/recover-utility-overlaps.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class BoundaryNormalizationTests(unittest.TestCase):
    def test_overlapping_valid_components_preserve_coverage_without_double_counting(self):
        parts = [box(0,0,2,2), box(1,1,3,3), box(10,10,11,11)]
        result = module.dissolve_valid_components(MultiPolygon(parts))
        self.assertTrue(result.is_valid)
        self.assertEqual(result.area, 8)
        self.assertTrue(all(result.covers(p) for p in parts))

    def test_invalid_individual_rings_are_not_repaired(self):
        bowtie = Polygon([(0,0),(2,2),(0,2),(2,0),(0,0)])
        with self.assertRaises(ValueError):
            module.dissolve_valid_components(MultiPolygon([bowtie]))

    def test_bundled_archive_is_valid_complete_against_manifest_and_includes_fpl(self):
        data=json.loads((ROOT/'data/utility-territories.geojson').read_text())
        manifest=json.loads((ROOT/'data/utility-source.json').read_text())
        features=data['features']
        self.assertEqual(len(features),manifest['includedCount'])
        self.assertEqual(manifest['includedCount']+manifest['excludedCount'],manifest['sourceRecordCount'])
        self.assertEqual(len({f['properties']['id'] for f in features}),len(features))
        self.assertTrue(all(shape(f['geometry']).is_valid for f in features))
        self.assertTrue(any(f['properties']['name']=='FLORIDA POWER & LIGHT CO' for f in features))
        excluded={f['id'] for f in manifest['excluded']}
        self.assertFalse(excluded & {f['properties']['id'] for f in features})

if __name__ == '__main__': unittest.main()

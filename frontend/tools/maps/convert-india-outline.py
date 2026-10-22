"""Build the interactive India map from the verified GeoBoundaries ADM1 source.

Run from the repository root:
    python public/maps/convert-india-outline.py

Requires Shapely 2.1.2. The source is already downloaded beside this script;
the script normalizes its names/metadata to the application's 36-region model.
"""

import copy
import json
from pathlib import Path

from shapely.geometry import shape, mapping
from shapely.validation import explain_validity

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "geoBoundaries-IND-ADM1-simplified.geojson"
DESTINATION = ROOT / "india-states.geo.json"
CURRENT = ROOT / "india-northern-base.geo.json"


def write(path, data):
    path.write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False) + "\n", encoding="utf-8")


def main():
    source = json.loads(SOURCE.read_text(encoding="utf-8"))
    current = json.loads(DESTINATION.read_text(encoding="utf-8"))
    current_by_iso = {feature["properties"].get("iso3166-2"): feature for feature in current["features"]}
    source_by_iso = {feature["properties"]["shapeISO"]: feature for feature in source["features"]}
    # GeoBoundaries retains a few historic ISO spellings used by its source;
    # map them to the current ISO codes already used by the application.
    for legacy, current_code in {"IN-OR": "IN-OD", "IN-TG": "IN-TS", "IN-UT": "IN-UK", "IN-CT": "IN-CG"}.items():
        source_by_iso[current_code] = source_by_iso.pop(legacy)

    expected = set(current_by_iso)
    actual = set(source_by_iso)
    assert expected == actual, f"Source region codes differ: missing={expected - actual}, extra={actual - expected}"

    if not CURRENT.exists():
        write(CURRENT, {"type": "FeatureCollection", "features": [current_by_iso[code] for code in sorted(expected)]})

    output = copy.deepcopy(current)
    for feature in output["features"]:
        code = feature["properties"]["iso3166-2"]
        geometry = shape(source_by_iso[code]["geometry"])
        assert geometry.is_valid, f"{code}: {explain_validity(geometry)}"
        assert not geometry.is_empty, f"{code}: empty geometry"
        feature["geometry"] = mapping(geometry)
        feature["properties"]["boundary-source"] = "geoBoundaries GB Open India ADM1"

    output["copyright"] = "geoBoundaries GB Open India ADM1; DataMeet India community / Election Commission of India"
    output["copyrightShort"] = "geoBoundaries / DataMeet"
    output["derivation"] = {
        "script": "convert-india-outline.py",
        "source": "geoBoundaries-IND-ADM1-simplified.geojson",
        "sourceVersion": "geoBoundaries-IND-ADM1-1811400, build 2023-12-12",
        "sourceCrs": "OGC:CRS84 (WGS84 longitude/latitude)",
        "license": "CC BY 2.5 India",
        "licenseUrl": "https://creativecommons.org/licenses/by/2.5/in/",
        "boundaryConvention": "DataMeet India community / Election Commission of India administrative boundaries",
        "northernExtent": "Includes separate Jammu and Kashmir and Ladakh geometries through approximately 37.08 N",
    }
    assert len(output["features"]) == 36
    write(DESTINATION, output)
    print("36 valid regions written from GeoBoundaries GB Open India ADM1")
    for name in ("Jammu and Kashmir", "Ladakh"):
        feature = next(f for f in output["features"] if f["properties"]["name"] == name)
        geometry = shape(feature["geometry"])
        print(f"{name}: bounds={geometry.bounds}")


if __name__ == "__main__":
    main()

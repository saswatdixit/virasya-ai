# India map data

`india-states.geo.json` is WGS84 GeoJSON with 36 current regions generated
from `geoBoundaries-IND-ADM1-simplified.geojson`. The source is the
geoBoundaries GB Open India ADM1 release, sourced from the DataMeet India
community and the Election Commission of India.

The source contains separate, detailed modern geometries for Jammu and Kashmir
and Ladakh, including the complete northern extent used by this map. No
connecting lines or endpoint-tangent approximations are added by the
application. The international outline and administrative convention are the
ones represented by the documented GeoBoundaries/DataMeet source; disputed
areas and claims should not be interpreted as a different legal convention.

## Reproduce

From the repository root, with temporary Shapely dependencies installed outside
the repository:

```powershell
pip install shapely
python tools/maps/convert-india-outline.py
```

Source metadata: geoBoundaries GB Open India ADM1, release
`IND-ADM1-1811400` (build 2023-12-12), GeoJSON CRS84/WGS84. Sources: DataMeet
India community / Election Commission of India; geoBoundaries metadata at
<https://www.geoboundaries.org/api/current/gbOpen/IND/ADM1/>; CC BY 2.5 India
<https://creativecommons.org/licenses/by/2.5/in/>.

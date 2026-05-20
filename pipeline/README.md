# GIS Pipeline

This directory contains the offline data production pipeline for River Trekking Map.

The first version is intentionally small and dependency-free. It uses OpenStreetMap data from Overpass, generates creek-trail candidate segments, and writes static GeoJSON files that the web app can later load directly.

## Current V0 Scope

Inputs:

- OSM trails and paths
- OSM waterways
- OSM roads for context only
- OSM urban landuse polygons for exclusion

Outputs:

- candidate creek segments
- nearby candidate trail segments
- raw overlay layers for inspection

V0 does not yet use USGS NHD, USGS 3DEP DEM, CPAD, or NLCD. Those belong in later pipeline versions.

## Run

From the repo root:

```bash
python3 pipeline/scripts/build_candidates.py --area uvas
```

Useful options:

```bash
python3 pipeline/scripts/build_candidates.py --area fall_creek --trail-distance-m 75 --min-segment-m 200
python3 pipeline/scripts/build_candidates.py --area little_yosemite --out data/processed/little_yosemite
```

## Area Presets

Current presets:

- `uvas`
- `fall_creek`
- `purisima`
- `little_yosemite`
- `big_basin`
- `mt_tam`

## Algorithm

For each creek:

1. Sample the creek line every 25 meters.
2. Check whether each sample point is within the configured distance of a trail/path.
3. Allow small geometry gaps.
4. Emit candidate creek segments when the qualifying run is long enough.
5. Exclude OSM urban landuse polygons by default.

Then build matching trail segments near the generated creek candidates.

Roads are downloaded for context, but they do not count for candidate generation.

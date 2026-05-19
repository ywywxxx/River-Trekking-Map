# River Trekking Map Architecture

## 1. Architecture Goal

The MVP architecture should make one thing easy:

Generate creek candidate data from public geospatial sources and display it on an interactive web map for filtering and inspection.

The first version should avoid unnecessary backend complexity. The product risk is not API design; the product risk is whether the generated creek candidates are useful.

## 2. MVP Architecture Summary

Recommended MVP stack:

- data processing: Python geospatial pipeline
- output format: static GeoJSON first, PMTiles or vector tiles later
- frontend: React + TypeScript
- map renderer: MapLibre GL JS
- backend: none for MVP
- deployment: static web app

High-level flow:

```text
Raw public geospatial data
  -> Python GIS pipeline
  -> processed creek candidates
  -> static data files
  -> React / MapLibre web map
```

## 3. Why No Backend First

The MVP can start without a backend because:

- the first dataset is limited to the Bay Area and nearby regions
- filters can run client-side for the first version
- static files simplify development and deployment
- the main uncertainty is candidate quality, not API scale

A backend should be added only when:

- candidate data becomes too large for direct client loading
- filtering needs server-side spatial queries
- user accounts, saved routes, annotations, or uploaded tracks are introduced
- data updates need to be managed through a service

## 4. Repository Structure

Recommended structure:

```text
.
├── docs/
│   ├── PRODUCT.md
│   ├── ARCHITECTURE.md
│   ├── DATA_SOURCES.md
│   ├── AGENTS_AND_SKILLS.md
│   └── VALIDATION.md
├── apps/
│   └── web/
│       ├── src/
│       ├── public/
│       └── package.json
├── pipeline/
│   ├── river_trekking/
│   ├── scripts/
│   ├── notebooks/
│   └── pyproject.toml
├── data/
│   ├── raw/
│   ├── interim/
│   └── processed/
├── examples/
│   └── candidates.sample.geojson
├── README.md
└── .gitignore
```

The current docs can stay at repo root for now. Once implementation starts, move them into `docs/` in one cleanup commit.

## 5. Data Pipeline

The pipeline converts raw geospatial data into `Creek Candidate Segment` records.

Input data:

- waterways
- trails and paths
- roads
- parking / trailheads
- elevation raster
- public land / park boundaries
- optional land cover or urban exclusion layers

Main steps:

1. Load study boundary.
2. Load waterways inside the boundary.
3. Filter likely creek-scale waterways.
4. Load trails and paths inside the boundary.
5. Split waterways into manageable segments.
6. Calculate segment length.
7. Calculate trail proximity.
8. Calculate escape interval score.
9. Sample elevation along segment geometry.
10. Calculate elevation gain, gain rate, average slope, and local slope.
11. Calculate access and public land signals.
12. Calculate candidate scores.
13. Export processed candidates.

## 6. Candidate Data Model

Initial candidate output should be GeoJSON.

Each feature should contain:

```json
{
  "type": "Feature",
  "geometry": {
    "type": "LineString",
    "coordinates": []
  },
  "properties": {
    "id": "string",
    "name": "string | null",
    "length_m": 0,
    "start_elevation_m": null,
    "end_elevation_m": null,
    "elevation_gain_m": null,
    "elevation_gain_rate_m_per_km": null,
    "average_slope": null,
    "max_local_slope": null,
    "nearest_trail_distance_m": null,
    "escape_interval_m": 500,
    "escape_proximity_threshold_m": 30,
    "escape_interval_pass": false,
    "trail_proximity_tier": "unknown",
    "terrain_interest_score": null,
    "trail_safety_score": null,
    "access_score": null,
    "risk_score": null,
    "total_candidate_score": null,
    "public_land_overlap_ratio": null,
    "nearest_road_distance_m": null,
    "nearest_parking_distance_m": null,
    "data_confidence": "low"
  }
}
```

## 7. Scoring Versions

Scoring should be versioned because thresholds will change during validation.

Suggested versions:

- `score_v0`: trail proximity and segment length only
- `score_v1`: adds elevation and terrain interest
- `score_v2`: adds public land and access confidence
- `score_v3`: adds better risk classification and validation feedback

The app should display the scoring version used by the dataset.

## 8. Frontend App

The frontend should be a focused map tool, not a landing page.

Primary screen:

- full-page map
- compact filter panel
- selected candidate detail panel
- layer control

Required MVP interactions:

- load candidate GeoJSON
- render creek candidate lines
- color candidates by score or trail proximity tier
- click a candidate to inspect details
- filter by length
- filter by trail proximity tier
- filter by escape interval pass
- filter by elevation gain rate once available
- toggle candidate and trail layers

## 9. Map Rendering

Recommended map library:

- MapLibre GL JS

Reasons:

- supports vector-style map rendering
- works well with GeoJSON and vector tiles
- avoids dependence on proprietary map SDKs
- can later use PMTiles or custom vector tiles

Initial basemap options:

- OpenStreetMap-compatible raster/vector basemap
- terrain-oriented basemap if available
- satellite can be added later

## 10. Static Data Strategy

Start with:

```text
apps/web/public/data/candidates.geojson
apps/web/public/data/trails.geojson
```

If files become too large:

- simplify geometries
- split by tiles or region
- move to PMTiles
- add backend only if static tiling is insufficient

Large raw data should not be committed to Git.

## 11. Validation Areas

The MVP should be tested against known areas:

- Fall Creek
- Uvas Canyon
- Purisima Creek
- Half Moon Bay / San Mateo Coast Range
- Henry Cowell / Big Basin area
- Mount Tamalpais / Marin

Validation should check:

- whether expected creek corridors appear
- whether urban false positives are suppressed
- whether large rivers are filtered out
- whether trail proximity behaves as expected
- whether candidate scores match human intuition

## 12. Development Order

Recommended implementation order:

1. Create repo structure and docs.
2. Research and document data sources.
3. Build first pipeline with OSM waterways and trails only.
4. Generate `score_v0` candidates.
5. Build frontend map with mock or generated GeoJSON.
6. Add DEM-derived terrain metrics.
7. Validate against known areas.
8. Add public land and access signals.
9. Polish MVP and deploy static app.

## 13. Open Architecture Questions

- Should waterways come from OSM only for v0, or OSM plus NHD?
- What DEM resolution is enough for useful local slope scoring?
- Should static data be GeoJSON, FlatGeobuf, PMTiles, or vector tiles after v0?
- Which basemap provider should be used for public deployment?
- How large is the first Bay Area candidate dataset after filtering?
- When does client-side filtering stop being acceptable?

## 14. Current Defaults

- backend: none
- app type: static web app
- frontend: React + TypeScript
- map renderer: MapLibre GL JS
- pipeline: Python geospatial stack
- first output: GeoJSON
- first scoring version: `score_v0`
- first filters: length, trail proximity, escape interval pass

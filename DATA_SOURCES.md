# Data Sources

Last reviewed: 2026-05-15

## 1. MVP Recommendation

Use open and public geospatial data first.

Recommended MVP source stack:

1. OpenStreetMap for trails, paths, roads, parking, gates, trailheads, and waterway hints.
2. USGS NHD / NHDPlus HR for authoritative creek and stream geometry.
3. USGS 3DEP DEM for elevation, slope, terrain, and gain calculations.
4. California Protected Areas Database (CPAD) for park, open space, and public land boundaries.
5. Agency trail datasets for validation and better local coverage in key parks.
6. NLCD for coarse urban / impervious surface exclusion.

AllTrails should remain a product experience reference, not a data source.

## 2. Source Priority

## 2.1 OpenStreetMap

Use for:

- trails and paths
- roads
- parking
- access hints
- gates and barriers
- trailhead-like points of interest
- secondary waterway hints

Access:

- Overpass API
- Geofabrik California `.osm.pbf`
- custom extracts from BBBike or similar services

Useful tags:

- `highway=path`
- `highway=footway`
- `highway=track`
- `highway=service`
- `waterway=*`
- `amenity=parking`
- `tourism=information`
- `barrier=*`
- `access=*`
- `foot=*`
- `bicycle=*`
- `surface=*`
- `sac_scale=*`

License:

- Open Database License (ODbL)
- attribution required
- database share-alike implications need review before public release

Recommendation:

Use OSM as the primary general-purpose vector source for the MVP, especially for trails and access context.

OSM is useful but not authoritative for legal access. Treat access tags as hints, not guarantees.

## 2.2 USGS National Hydrography Dataset / NHDPlus HR

Use for:

- creek and stream flowlines
- named waterways
- waterbodies
- more authoritative hydrography than OSM

Access:

- USGS hydrography downloads
- The National Map Downloader
- USGS services

Reference:

- https://www.usgs.gov/NHD/DataAccess

License:

- U.S. federal public data
- generally public domain
- cite USGS

Recommendation:

Use NHD / NHDPlus HR as the canonical creek layer where possible. Use OSM waterways as supplemental hints, especially for small named features or local edits.

## 2.3 USGS 3DEP DEM

Use for:

- elevation profile
- elevation gain
- elevation gain rate
- average slope
- local slope
- hillshade / terrain context

Access:

- The National Map Downloader
- USGS 3DEP services and downloads

Reference:

- https://www.usgs.gov/the-national-map-data-delivery/gis-data-download

License:

- U.S. federal public data
- generally public domain
- cite USGS

Recommendation:

Start with 10 m or 1/3 arc-second DEM for the first Bay Area MVP. Use 1 m lidar-derived DEM only for focused pilot areas if needed.

## 2.4 California Protected Areas Database

Use for:

- parks
- open spaces
- protected lands
- managing agencies
- public access categories

Access:

- California Open Data
- CALANDS / CPAD downloads
- ArcGIS REST services

References:

- https://lab.data.ca.gov/dataset/california-protected-areas-database
- https://calands.org/cpad/

License:

- California Open Data listing indicates Creative Commons Attribution
- confirm exact terms before public release

Recommendation:

Use CPAD as the primary public land and park boundary layer. Use it to score access confidence and to down-rank segments outside known public/open-space lands.

CPAD boundaries are not legal survey boundaries and should not be presented as proof of access.

## 2.5 Agency Trail and Park Data

Use for:

- official trail validation
- local park boundary validation
- staging areas
- parking
- entry points
- improving OSM coverage in important parks

Priority agency sources:

- East Bay Regional Park District
- Santa Clara County Parks
- California State Parks
- National Park Service / Golden Gate National Recreation Area
- Marin County GIS / MarinMap
- San Mateo County GIS
- MTC / ABAG regional trail and Bay Trail datasets

References:

- East Bay Regional Park District maps/data: https://www.ebparks.org/maps
- Santa Clara County Parks GIS: https://parks.santaclaracounty.gov/maps-gis
- California State Parks GIS: https://www.parks.ca.gov/?page_id=862
- NPS GIS tools/data: https://www.nps.gov/subjects/gisandmapping/tools-and-data.htm
- Marin County GIS: https://www.marincounty.gov/departments/it/maps-and-geographic-information-systems-gis
- San Mateo County GIS Data Download: https://www.smcgov.org/tsd/gis-data-download
- ABAG open data catalog: https://abag.ca.gov/tools-resources/data-tools/open-data-catalog

Recommendation:

Do not require agency trail data for the first generated dataset. Use it for validation and for high-value areas where OSM is incomplete or ambiguous.

## 2.6 NLCD Land Cover

Use for:

- coarse urban exclusion
- impervious surface filtering
- broad vegetation / developed land context

Access:

- MRLC / USGS downloads
- web services
- cloud-hosted raster access where available

Reference:

- https://www.usgs.gov/centers/eros/news/nlcd-2021-now-available

License:

- U.S. federal public data

Recommendation:

Use NLCD as a coarse filter to down-rank urbanized creek segments. Do not rely on 30 m land cover for precise creek-level decisions.

## 2.7 Optional Later Sources

### SFEI California Aquatic Resource Inventory

Use for:

- wetlands
- riparian context
- aquatic resource sensitivity

Recommendation:

Consider later for ecological context and sensitive-area flags, not for MVP route discovery.

### LANDFIRE / CAL FIRE FRAP Vegetation

Use for:

- vegetation
- canopy / fuel context
- wildland condition

Recommendation:

Optional later. Too much complexity for the first MVP.

### Caltrans All Public Roads Network

Use for:

- road fallback
- road validation

Recommendation:

Use only if OSM road data is not enough.

### U.S. Census TIGER/Line Roads

Use for:

- fallback public roads

Recommendation:

Fallback only. Less useful than OSM for park roads and trail access.

## 3. MVP Data Build Plan

## 3.1 First Pass

Build the first candidate dataset from:

- OSM trails, roads, parking, and access hints
- NHD / NHDPlus HR creeks and streams
- 3DEP DEM
- CPAD park and open-space boundaries

First pass output:

- `candidates.geojson`
- `trails.geojson`
- optional `public_lands.geojson`

## 3.2 OSM Extraction

Extract OSM features within the MVP study area:

- `highway=path`
- `highway=footway`
- `highway=track`
- `highway=service`
- `waterway=*`
- `amenity=parking`
- `tourism=information`
- `barrier=*`
- `access=*`
- `foot=*`
- `bicycle=*`
- `surface=*`

OSM should provide the first working trail layer.

## 3.3 Creek Layer

Use NHD / NHDPlus HR as the primary creek geometry source.

Use OSM waterways to:

- compare named creeks
- fill obvious local gaps
- add source confidence
- validate whether users recognize the creek names

## 3.4 Elevation Layer

Use USGS 3DEP DEM to compute:

- start elevation
- end elevation
- elevation gain
- elevation gain rate
- average slope
- max local slope
- local slope variation

Use lower resolution DEM first for speed. Improve resolution only after the candidate logic is working.

## 3.5 Public Land and Access

Use CPAD to compute:

- public land overlap ratio
- managing agency
- access category if available
- access confidence

Agency data should override or supplement CPAD where available.

## 4. Validation Areas

Use these areas to validate data coverage and candidate quality:

- Fall Creek
- Uvas Canyon
- Purisima Creek
- Half Moon Bay / San Mateo Coast Range
- Henry Cowell / Big Basin
- Mount Tamalpais / Marin
- East Bay Regional Parks

Validation questions:

- Does the creek appear?
- Does the nearby trail appear?
- Is trail proximity reasonable?
- Does the public land layer match expected park/open-space boundaries?
- Does the elevation profile look plausible?
- Are there obvious urban false positives?

## 5. Data Cautions

Do not imply that data proves legal access or safe travel.

Known issues:

- OSM trail legality can be inconsistent.
- NHD may miss very small or seasonal channels.
- DEM-derived slope may not capture small waterfalls, boulders, logs, or slippery rock.
- CPAD boundaries are not legal survey boundaries.
- Agency datasets may have different update schedules and licensing terms.
- Seasonal water presence is not solved in MVP.

## 6. Data Sources to Avoid for Derived Geometry

Avoid proprietary or unclear sources for derived data unless terms explicitly allow the intended use:

- Google Maps
- AllTrails
- Strava heatmaps
- commercial basemap geometry
- scraped trail databases

These can be used as product inspiration or manual reference only when allowed by their terms, not as raw geometry sources.

## 7. MVP Decision

For the first implementation:

- OSM is the primary trail and access-context layer.
- NHD / NHDPlus HR is the primary creek layer.
- 3DEP is the primary elevation layer.
- CPAD is the primary public land layer.
- Agency trail datasets are validation and enhancement sources.
- NLCD is optional for urban filtering.

# River Trekking Map Product Document

## 1. Product Summary

River Trekking Map is a web map for discovering creek corridors that may be suitable for river trekking, creek scrambling, and water-based hiking.

The MVP focuses on the Bay Area and nearby regions. It automatically identifies candidate creek segments that are small enough to explore, located in interesting terrain, and close enough to trails for practical exit options.

The product should be treated as a discovery and planning tool, not a safety guarantee or official route recommendation system.

## 2. Product Positioning

Existing outdoor apps are mostly trail-first. They help users find hikes, routes, trailheads, reviews, and elevation profiles.

River trekking is different. The main object is not the trail. The main object is the creek corridor:

- a small stream or creek
- located in a valley, forest, canyon, or hilly terrain
- with rocks, pools, small drops, cascades, or other terrain interest
- close enough to a trail that a user can exit the creek when needed

The MVP should therefore find and rank creek-trail corridors, rather than claiming to provide verified river trekking routes.

## 3. Target Region

Initial geographic scope:

- North: Point Reyes and Marin
- South: Monterey and the northern Big Sur / Santa Lucia foothill area
- West: Pacific Coast
- East: Sacramento-side edge of the Bay Area / Central Valley transition

Primary areas of interest:

- Point Reyes
- Marin Headlands
- Mount Tamalpais
- East Bay Hills
- Peninsula open spaces
- Santa Cruz Mountains
- Big Basin / Fall Creek / Henry Cowell area
- Uvas Canyon / Mount Madonna / Santa Clara County foothills
- Monterey Bay and nearby mountain areas
- Diablo Range west-facing foothills

The first implementation can use a bounding box or coarse polygon. More precise region boundaries can come later.

## 4. Target Users

The first version targets experienced outdoor users, not beginners.

Primary users:

- hikers who already explore off-trail or semi-off-trail terrain
- creek scramblers
- waterfall and cascade hunters
- users comfortable reading terrain maps
- users who want to evaluate access, slope, trail proximity, and exit options before exploring

The product should avoid beginner-oriented language such as "safe route" or "guaranteed passable."

## 5. MVP Goal

The MVP must answer one core question:

Can we automatically find Bay Area creek segments that look promising for river trekking and have nearby trails that allow frequent exit?

The first release should optimize for candidate discovery and filtering, not community content.

## 6. Non-Goals for MVP

The MVP will not include:

- user login
- social features
- user ratings
- GPX upload
- mobile app
- offline maps
- real-time water level prediction
- verified legal access
- verified route passability
- route safety guarantees
- full AllTrails-style trail review system

The data model may leave room for these features later, but they should not block the first version.

## 7. Core Product Object

### Creek Candidate Segment

A Creek Candidate Segment is a section of creek that passes basic filters for:

- waterway type
- minimum length
- terrain interest
- proximity to trails
- access potential

It is not a verified route. It is a candidate for human review or future field validation.

Suggested fields:

- id
- name, if available
- geometry
- length_m
- start_elevation_m
- end_elevation_m
- elevation_gain_m
- elevation_gain_rate_m_per_km
- average_slope
- max_local_slope
- waterway_source
- trail_proximity_score
- escape_interval_score
- nearest_trail_name
- nearest_road_distance_m
- nearest_parking_distance_m
- public_land_overlap_ratio
- terrain_interest_score
- access_score
- risk_score
- total_candidate_score
- data_confidence

## 8. MVP User Experience

The MVP can be a single web map page.

Main areas:

- map canvas
- filter panel
- layer controls
- selected creek detail panel

Map layers:

- creek candidate segments
- source waterways
- trails
- roads / access points
- terrain basemap
- satellite basemap
- optional public land / park boundaries

Clicking a creek candidate opens a detail panel with:

- name, if known
- length
- elevation gain
- elevation gain rate
- average slope
- max local slope
- nearest trail
- trail proximity summary
- escape check summary
- nearest road / parking estimate
- public land overlap estimate
- terrain interest score
- warnings and data confidence

## 9. Default MVP Filters

Initial filter defaults:

- minimum creek segment length: 1 km
- trail proximity threshold: 30 m
- strong trail proximity threshold: 10 m
- escape interval: 500 m
- minimum candidate score: TBD after data inspection

User-adjustable filters:

- minimum creek length
- maximum creek-trail distance
- escape interval
- elevation gain rate
- average slope
- max local slope
- distance to road / parking
- public land only
- exclude urbanized areas
- named trails only

## 10. Trail Proximity and Escape Logic

The product should not only check whether a trail exists near a creek. It should evaluate whether the creek has repeated opportunities to exit.

Default rule:

For every 500 m window along a creek candidate, at least one point should be within 30 m of a trail.

Scoring tiers:

| Tier | Rule |
| --- | --- |
| Excellent | Every 500 m window has a trail within 15 m |
| Good | Every 500 m window has a trail within 30 m |
| Acceptable | Every 500 m window has a trail within 75 m |
| Poor | At least one 500 m window has no nearby trail within 75 m |

The UI can expose this as:

- trail proximity: 10 m / 30 m / 75 m / 150 m
- escape interval: 250 m / 500 m / 1 km

## 11. Candidate Scoring

Candidate scoring should be simple and explainable in the MVP.

Suggested formula:

```text
Creek Trekking Score =
  Terrain Interest
  + Trail Safety
  + Access
  + Naturalness
  - Risk
```

### Terrain Interest

Positive signals:

- moderate elevation gain rate
- local slope variation
- valley terrain
- nearby cascade / waterfall / rapids names
- forested or natural land cover

Negative signals:

- flat drainage channels
- urban waterways
- large rivers

### Trail Safety

Positive signals:

- creek is close to trail
- creek and trail run roughly parallel
- repeated trail proximity every 500 m
- trail crosses creek at useful intervals

Negative signals:

- long creek sections with no nearby trail
- trail exists but is far above the creek on steep side slopes

### Access

Positive signals:

- close to road or parking
- start and end are reachable
- near established parks or open spaces

Negative signals:

- no practical public access
- crosses likely private land
- very long approach before creek start

### Naturalness

Positive signals:

- forest / park / open space
- away from dense urban development
- creek appears within a valley or ravine

Negative signals:

- channelized city creek
- drainage ditch
- industrial or residential corridor

### Risk

Risk should reduce the score but should also be displayed separately.

Risk signals:

- very steep local slope
- abrupt elevation drops
- likely cliffs or waterfalls
- long distance from trail
- uncertain land access
- data quality problems

## 12. Data Sources

The MVP should use open or public data sources first.

Preferred sources:

- OpenStreetMap waterways
- OpenStreetMap trails and paths
- USGS National Hydrography Dataset, if needed
- USGS 3DEP DEM or equivalent elevation data
- public park / open space boundaries
- public roads and parking points
- land cover data, if needed

AllTrails should be treated as a product experience reference, not a primary data source.

Reasons:

- bulk AllTrails data may not be legally or technically available
- OSM and public GIS data are better suited for reproducible MVP processing
- user-contributed route data can be added later through uploads or first-party records

## 13. Safety and Trust

The product must be explicit about uncertainty.

Required safety messaging:

- Candidate segments are generated from map and terrain data.
- A candidate segment does not mean the route is legal, safe, or passable.
- Water level, weather, landslides, deadfall, slippery rocks, private land, closures, and trail conditions may change.
- Users are responsible for their own judgment, equipment, local rules, and turnaround decisions.

The UI should avoid language such as:

- safe route
- verified passable
- guaranteed exit
- beginner friendly

Preferred language:

- candidate
- likely
- nearby trail
- data confidence
- needs field validation
- possible exit point

## 14. Future Roadmap

### V1

- Bay Area candidate discovery map
- filters
- creek detail panel
- explainable scoring
- generated candidate dataset

### V2

- saved candidates
- manual annotations
- export route / GPX
- refined public land and access checks
- better obstacle detection
- trailhead and parking quality

### V3

- user accounts
- uploaded GPS tracks
- completed creek logs
- difficulty / fun / scenery ratings
- impassable section annotations
- seasonal water notes
- community validation and moderation

### V4

- mobile-first field mode
- offline maps
- hazard reports
- water level integrations
- personalized recommendations

## 15. Open Questions

- What exact geographic boundary should define the initial Bay Area dataset?
- Should the first pipeline use OSM waterways only, or OSM plus NHD?
- Which DEM resolution is sufficient for useful local slope detection?
- How should the product distinguish fun steep terrain from dangerous impassable terrain?
- How strict should public land filtering be in MVP?
- Should candidate generation include unnamed waterways?
- Should dry seasonal creeks be included or excluded?
- What minimum water persistence signal is needed to call something a creek?

## 16. Current Product Decisions

- MVP region: Bay Area and nearby coastal / mountain areas from Point Reyes to Monterey and east toward Sacramento.
- MVP focus: automatic candidate discovery and filtering.
- MVP object: Creek Candidate Segment.
- MVP account system: none.
- MVP default trail proximity: 30 m.
- MVP strong trail proximity: 10 m.
- MVP escape interval: 500 m.
- MVP minimum creek length: 1 km.
- MVP data strategy: open/public geospatial data first.
- Product reference: AllTrails-like map browsing experience, but with creek-first filtering.

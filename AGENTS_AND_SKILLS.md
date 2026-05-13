# Agents and Skills Plan

## 1. Purpose

This document defines the likely agent roles, responsibilities, and supporting skills needed to build River Trekking Map.

The goal is to separate the work into clear streams:

- product and requirements
- geospatial data sourcing
- GIS processing and scoring
- web map frontend
- backend and data API
- validation and QA
- safety, legal, and trust review

This is a planning document. It does not mean every agent is needed immediately.

## 2. Recommended Build Strategy

The project should start with a narrow MVP:

1. Define the Bay Area study boundary.
2. Acquire open waterway, trail, elevation, road, and public land data.
3. Generate creek candidate segments.
4. Score candidates based on trail proximity, terrain, access, and risk.
5. Display candidates on a web map.
6. Validate results against known example areas such as Fall Creek, Uvas Canyon, and Purisima Creek.

Agent usage should follow this sequence:

- use research / explorer agents first to clarify data and architecture
- use worker agents after the data model and implementation boundaries are clear
- avoid too many parallel coding agents until the repo structure is stable

## 3. Agent Roles

## 3.1 Product Agent

### Responsibility

Owns product clarity and keeps the build aligned with the MVP.

### Tasks

- refine `PRODUCT.md`
- define MVP user stories
- define filter behavior
- define detail panel content
- define safety copy
- prioritize V1 vs later features
- maintain open questions

### Outputs

- product requirements
- feature list
- user flows
- product terminology
- acceptance criteria

### Skills / Tools

- no special technical skill required
- should understand outdoor mapping products
- should maintain Markdown docs

### When Needed

Immediately and throughout the project.

## 3.2 Geospatial Data Research Agent

### Responsibility

Finds and evaluates available data sources for waterways, trails, elevation, public land, roads, parking, and land cover.

### Tasks

- compare OSM waterways vs USGS NHD for creek coverage
- identify trail data sources for Bay Area parks and open spaces
- identify DEM source and resolution
- identify public land boundary sources
- identify road and parking sources
- document data licensing and update cadence

### Outputs

- data source inventory
- recommended source priority
- download/API instructions
- license notes
- known gaps

### Skills / Tools

- web research
- GIS data literacy
- OSM / Overpass knowledge
- USGS / NHD / 3DEP familiarity
- California public GIS familiarity

### When Needed

Before implementation of the data pipeline.

## 3.3 GIS Pipeline Agent

### Responsibility

Builds the processing pipeline that turns raw waterways, trails, DEM, and access data into creek candidate segments.

### Tasks

- define study boundary geometry
- download or load geospatial data
- clean waterway geometries
- split waterways into candidate segments
- calculate length and elevation profile
- calculate creek-trail proximity
- calculate escape interval score
- calculate terrain interest score
- calculate access score
- export candidates as GeoJSON / MBTiles / database rows

### Outputs

- repeatable data pipeline
- processed candidate dataset
- scoring fields
- data quality report

### Skills / Tools

- Python geospatial stack
- GeoPandas
- Shapely
- Rasterio
- PyProj
- OSMnx or Overpass API
- GDAL / ogr2ogr
- PostGIS, if backend storage uses PostgreSQL

### When Needed

Core MVP work. This is one of the most important roles.

## 3.4 Scoring and Ranking Agent

### Responsibility

Designs and tunes the explainable scoring model for creek candidates.

### Tasks

- turn product criteria into numeric features
- define scoring weights
- tune thresholds for trail proximity and escape intervals
- separate positive interest from risk
- compare scores against known areas
- propose defaults for the UI filters

### Outputs

- scoring formula
- threshold table
- candidate ranking examples
- calibration notes

### Skills / Tools

- GIS analysis
- basic statistics
- product judgment
- outdoor terrain interpretation

### When Needed

After the first candidate dataset exists.

## 3.5 Frontend Map Agent

### Responsibility

Builds the web map interface.

### Tasks

- implement map canvas
- render creek candidate segments
- render trails and basemap layers
- implement filter panel
- implement selected creek detail panel
- style candidate colors by score or risk
- support hover and click interactions
- make the layout usable on desktop first

### Outputs

- running web app
- map layers
- interactive filters
- detail panel
- responsive layout baseline

### Skills / Tools

- React or equivalent frontend framework
- TypeScript
- MapLibre GL JS or Leaflet
- vector tiles / GeoJSON rendering
- UI component design

### When Needed

After a sample candidate dataset exists. Can start earlier with mock GeoJSON.

## 3.6 Backend / API Agent

### Responsibility

Provides the data service used by the frontend.

### Tasks

- choose storage format for MVP
- serve candidate segments
- support bounding-box queries
- support filter parameters
- serve detail records
- prepare future support for saved routes and annotations

### Outputs

- API design
- backend service
- data loading script
- local development setup

### Skills / Tools

- Node.js / Python backend
- FastAPI, Express, or similar
- PostgreSQL / PostGIS if needed
- static GeoJSON or PMTiles if keeping MVP simple

### When Needed

May be deferred if the MVP can load static GeoJSON or PMTiles directly in the frontend.

## 3.7 Validation Agent

### Responsibility

Checks whether generated candidates make sense against known locations and expected terrain.

### Tasks

- inspect candidates in Fall Creek
- inspect candidates in Uvas Canyon
- inspect candidates around Purisima Creek
- inspect false positives in urban or flat areas
- inspect false negatives where known creek-trail corridors are missing
- document tuning recommendations

### Outputs

- validation report
- screenshots
- false positive / false negative examples
- recommended scoring changes

### Skills / Tools

- map inspection
- GIS viewer tools
- local Bay Area outdoor knowledge
- Playwright screenshots for app QA

### When Needed

After the first full candidate generation pass.

## 3.8 Safety, Legal, and Trust Agent

### Responsibility

Reviews product language, land access assumptions, safety warnings, and data licensing risk.

### Tasks

- review disclaimers
- avoid unsafe product claims
- check whether data license terms are compatible with the app
- flag private land and restricted access concerns
- recommend wording for uncertainty and data confidence

### Outputs

- safety copy
- legal/access risk notes
- license summary
- trust and moderation recommendations

### Skills / Tools

- data licensing research
- outdoor recreation safety awareness
- product trust and safety review

### When Needed

Before public release. Some input is useful during data source selection.

## 3.9 DevOps / Repo Agent

### Responsibility

Keeps the repo runnable and repeatable.

### Tasks

- define repo structure
- add development scripts
- document setup
- add linting and formatting
- add basic CI
- manage environment variables
- keep generated data out of Git when too large

### Outputs

- `README.md`
- setup scripts
- `.gitignore`
- CI workflow
- environment template

### Skills / Tools

- GitHub Actions
- package manager setup
- Docker, if needed
- data artifact management

### When Needed

Early, once the first implementation starts.

## 4. Suggested Initial Agent Split

For the next phase, the minimum useful split is:

1. Product / architecture owner
2. Data research agent
3. GIS pipeline agent
4. Frontend map agent

The backend can be delayed if the first app uses static generated data.

The validation agent becomes useful once there is a first candidate dataset.

## 5. Skills Needed by Project Phase

## 5.1 Planning Phase

Needed:

- product documentation
- GIS source research
- architecture planning

Likely skills:

- Markdown documentation
- web research
- geospatial data evaluation

## 5.2 Data Pipeline Phase

Needed:

- OSM / Overpass extraction
- DEM processing
- creek segmentation
- trail proximity calculation
- candidate scoring

Likely skills:

- Python geospatial development
- GeoPandas
- Shapely
- Rasterio
- GDAL
- PostGIS, if using a database

## 5.3 Frontend MVP Phase

Needed:

- map rendering
- filter controls
- detail panel
- dataset visualization

Likely skills:

- React
- TypeScript
- MapLibre GL JS or Leaflet
- responsive frontend design
- Playwright visual verification

## 5.4 Validation Phase

Needed:

- compare generated candidates against known example areas
- tune scoring
- identify false positives and false negatives

Likely skills:

- GIS map inspection
- product QA
- local outdoor domain review

## 5.5 Public Release Phase

Needed:

- safety language
- license review
- deployment
- documentation

Likely skills:

- deployment
- GitHub Actions
- trust and safety writing
- geospatial data license review

## 6. Skills Available in Current Codex Environment

Current named skills available to Codex:

- `imagegen`: useful later for visual assets, map marker mockups, landing graphics, or illustrative imagery. Not needed for the current product docs.
- `openai-docs`: useful only if the project later uses OpenAI APIs.
- `plugin-creator`: not needed unless building a Codex plugin.
- `skill-creator`: useful if we want to create a custom local skill for this project, such as a `geospatial-pipeline` skill.
- `skill-installer`: useful if we need to install curated or repo-based Codex skills.

No current built-in skill directly covers GIS processing. If this project grows, it may be worth creating a custom project skill for:

- Bay Area geospatial data sources
- OSM / USGS download commands
- candidate scoring rules
- validation locations
- common GIS pipeline commands

## 7. Potential Custom Skills

## 7.1 `river-trekking-product`

Purpose:

- maintain product language and requirements
- keep terminology consistent
- update PRD and roadmap

Useful when:

- refining feature scope
- writing UI copy
- reviewing safety language

## 7.2 `bay-area-geodata`

Purpose:

- store known data sources
- store download URLs and API examples
- store licensing notes
- store standard Bay Area bounds

Useful when:

- rebuilding the dataset
- onboarding new agents
- adding new public GIS sources

## 7.3 `creek-candidate-pipeline`

Purpose:

- document the data processing pipeline
- standardize feature calculations
- standardize candidate scoring
- document validation examples

Useful when:

- implementing or tuning GIS logic
- regenerating candidates
- debugging scoring output

## 8. Recommended Next Step

Before assigning coding agents, create an architecture document that decides:

- static data vs backend API
- frontend framework
- map rendering library
- geospatial processing language
- storage format for generated candidates
- first data sources
- initial study boundary

Recommended default:

- Python geospatial pipeline
- static GeoJSON or PMTiles for MVP
- React + TypeScript frontend
- MapLibre GL JS map rendering
- no backend until filtering or dataset size requires it

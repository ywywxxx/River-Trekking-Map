import { useCallback, useEffect, useRef, useState } from 'react'
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap, type MapLayerMouseEvent } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import './App.css'

type OverlayStatus = 'idle' | 'loading' | 'ready' | 'error'

type Place = {
  name: string
  note: string
  center: [number, number]
  zoom: number
}

type FeatureProperties = Record<string, string | number | boolean | null>
type LineFeature = GeoJSON.Feature<GeoJSON.LineString, FeatureProperties>
type LineCollection = GeoJSON.FeatureCollection<GeoJSON.LineString, FeatureProperties>
type PolygonFeature = GeoJSON.Feature<GeoJSON.Polygon, FeatureProperties>
type PolygonCollection = GeoJSON.FeatureCollection<GeoJSON.Polygon, FeatureProperties>
type ProjectedLine = {
  points: Array<readonly [number, number]>
  bbox: readonly [number, number, number, number]
}
type ProjectedPolygon = {
  rings: Array<Array<readonly [number, number]>>
  bbox: readonly [number, number, number, number]
}

const trailHighwayTypes = new Set(['path', 'footway', 'track', 'bridleway', 'steps'])
const urbanLanduseTypes = new Set(['residential', 'commercial', 'industrial', 'retail', 'construction'])
const overpassEndpoints = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]
const elevationCache = new Map<string, number>()

const places: Place[] = [
  {
    name: 'Purisima Creek',
    note: 'Half Moon Bay / San Mateo Coast Range',
    center: [-122.367, 37.438],
    zoom: 13.2,
  },
  {
    name: 'Fall Creek',
    note: 'Henry Cowell / Santa Cruz Mountains',
    center: [-122.09, 37.07],
    zoom: 13.4,
  },
  {
    name: 'Uvas Canyon',
    note: 'Santa Clara County foothills',
    center: [-121.794, 37.083],
    zoom: 13.3,
  },
  {
    name: 'Little Yosemite',
    note: 'Sunol Regional Wilderness',
    center: [-121.824, 37.514],
    zoom: 13.4,
  },
  {
    name: 'Mount Tam',
    note: 'Marin creek and trail network',
    center: [-122.596, 37.918],
    zoom: 12.7,
  },
  {
    name: 'Big Basin',
    note: 'Santa Cruz Mountains',
    center: [-122.222, 37.172],
    zoom: 12.8,
  },
]

const emptyLines: LineCollection = {
  type: 'FeatureCollection',
  features: [],
}

const emptyPolygons: PolygonCollection = {
  type: 'FeatureCollection',
  features: [],
}

function featureName(properties: FeatureProperties) {
  return String(properties.name || properties.ref || properties.highway || properties.waterway || 'Unnamed')
}

function escapeHtml(value: string | number | boolean | null) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => {
    const chars: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    }
    return chars[char]
  })
}

function buildPopupHtml(title: string, props: FeatureProperties) {
  const rows = [
    'name',
    'highway',
    'waterway',
    'surface',
    'access',
    'foot',
    'candidate_length_m',
    'qualifying_length_m',
    'elevation_range_m',
    'gain_rate_m_per_km',
    'local_gain_rate_m_per_km',
    'slope_percent',
    'local_slope_percent',
    'threshold_m',
    'min_segment_m',
    'max_gap_m',
    'near_access',
    'nearest_creek_m',
    'nearest_trail_m',
    'creek_along_trail_pct',
    'trail_along_creek_pct',
    'near_creek',
    'near_trail',
  ]
    .filter((key) => props[key] !== undefined && props[key] !== null && props[key] !== '')
    .map((key) => `<div><span>${key}</span><strong>${escapeHtml(props[key])}</strong></div>`)
    .join('')

  return `<section class="map-popup"><h3>${escapeHtml(title)}</h3>${rows}</section>`
}

function overpassToGeoJson(data: {
  elements?: Array<{
    type: string
    geometry?: Array<{ lat: number; lon: number }>
    tags?: FeatureProperties
  }>
}) {
  const trails: LineFeature[] = []
  const roads: LineFeature[] = []
  const streams: LineFeature[] = []
  const urbanAreas: PolygonFeature[] = []

  for (const element of data.elements ?? []) {
    if (element.type !== 'way' || !element.geometry || element.geometry.length < 2) {
      continue
    }

    const coordinates = element.geometry.map((point) => [point.lon, point.lat])
    const first = coordinates[0]
    const last = coordinates[coordinates.length - 1]
    const isClosed = first[0] === last[0] && first[1] === last[1]

    if (
      isClosed &&
      element.tags?.landuse &&
      urbanLanduseTypes.has(String(element.tags.landuse))
    ) {
      urbanAreas.push({
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [coordinates],
        },
        properties: element.tags,
      })
      continue
    }

    const feature: LineFeature = {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates,
      },
      properties: element.tags ?? {},
    }

    if (feature.properties.waterway) {
      streams.push(feature)
    } else if (
      feature.properties.highway &&
      trailHighwayTypes.has(String(feature.properties.highway))
    ) {
      trails.push(feature)
    } else if (feature.properties.highway) {
      roads.push(feature)
    }
  }

  return {
    trails: { type: 'FeatureCollection', features: trails } satisfies LineCollection,
    roads: { type: 'FeatureCollection', features: roads } satisfies LineCollection,
    streams: { type: 'FeatureCollection', features: streams } satisfies LineCollection,
    urbanAreas: { type: 'FeatureCollection', features: urbanAreas } satisfies PolygonCollection,
  }
}

async function fetchOverpass(query: string) {
  let lastError: unknown = null

  for (const endpoint of overpassEndpoints) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        body: new URLSearchParams({ data: query }),
      })

      if (!response.ok) {
        throw new Error(`Overpass request failed: ${response.status}`)
      }

      return response.json()
    } catch (error) {
      lastError = error
    }
  }

  throw lastError
}

function projectToMeters([lon, lat]: GeoJSON.Position) {
  const radius = 6378137
  const x = (lon * Math.PI * radius) / 180
  const y = Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * radius
  return [x, y] as const
}

function pointToSegmentDistance(point: readonly [number, number], a: readonly [number, number], b: readonly [number, number]) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]

  if (dx === 0 && dy === 0) {
    return Math.hypot(point[0] - a[0], point[1] - a[1])
  }

  const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(point[0] - (a[0] + t * dx), point[1] - (a[1] + t * dy))
}

function sampleLine(coordinates: GeoJSON.Position[], intervalMeters = 25) {
  const samples: Array<{ coordinate: GeoJSON.Position; point: readonly [number, number] }> = []

  for (let index = 1; index < coordinates.length; index += 1) {
    const startCoordinate = coordinates[index - 1]
    const endCoordinate = coordinates[index]
    const start = projectToMeters(startCoordinate)
    const end = projectToMeters(endCoordinate)
    const dx = end[0] - start[0]
    const dy = end[1] - start[1]
    const length = Math.hypot(dx, dy)
    const steps = Math.max(1, Math.ceil(length / intervalMeters))

    for (let step = 0; step < steps; step += 1) {
      const t = step / steps
      samples.push({
        coordinate: [
          startCoordinate[0] + (endCoordinate[0] - startCoordinate[0]) * t,
          startCoordinate[1] + (endCoordinate[1] - startCoordinate[1]) * t,
        ],
        point: [start[0] + dx * t, start[1] + dy * t],
      })
    }
  }

  if (coordinates.length > 0) {
    const coordinate = coordinates[coordinates.length - 1]
    samples.push({ coordinate, point: projectToMeters(coordinate) })
  }

  return samples
}

function bboxForPoints(points: Array<readonly [number, number]>) {
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (const point of points) {
    minX = Math.min(minX, point[0])
    minY = Math.min(minY, point[1])
    maxX = Math.max(maxX, point[0])
    maxY = Math.max(maxY, point[1])
  }

  return [minX, minY, maxX, maxY] as const
}

function expandedBboxForCoordinates(coordinates: GeoJSON.Position[], paddingMeters: number) {
  const bbox = bboxForPoints(coordinates.map(projectToMeters))
  return [
    bbox[0] - paddingMeters,
    bbox[1] - paddingMeters,
    bbox[2] + paddingMeters,
    bbox[3] + paddingMeters,
  ] as const
}

function bboxIntersects(
  a: readonly [number, number, number, number],
  b: readonly [number, number, number, number],
) {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1]
}

function projectLines(features: LineFeature[]) {
  return features.map((feature) => {
    const points = feature.geometry.coordinates.map(projectToMeters)
    return {
      points,
      bbox: bboxForPoints(points),
    } satisfies ProjectedLine
  })
}

function projectPolygons(features: PolygonFeature[]) {
  return features.map((feature) => {
    const rings = feature.geometry.coordinates.map((ring) => ring.map(projectToMeters))
    return {
      rings,
      bbox: bboxForPoints(rings.flat()),
    } satisfies ProjectedPolygon
  })
}

function pointInRing(point: readonly [number, number], ring: Array<readonly [number, number]>) {
  let inside = false

  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const currentPoint = ring[index]
    const previousPoint = ring[previous]
    const intersects =
      currentPoint[1] > point[1] !== previousPoint[1] > point[1] &&
      point[0] <
        ((previousPoint[0] - currentPoint[0]) * (point[1] - currentPoint[1])) /
          (previousPoint[1] - currentPoint[1]) +
          currentPoint[0]

    if (intersects) {
      inside = !inside
    }
  }

  return inside
}

function pointInPolygon(point: readonly [number, number], polygon: ProjectedPolygon) {
  if (
    point[0] < polygon.bbox[0] ||
    point[0] > polygon.bbox[2] ||
    point[1] < polygon.bbox[1] ||
    point[1] > polygon.bbox[3]
  ) {
    return false
  }

  if (!pointInRing(point, polygon.rings[0])) {
    return false
  }

  return !polygon.rings.slice(1).some((ring) => pointInRing(point, ring))
}

function pointInAnyPolygon(point: readonly [number, number], polygons: ProjectedPolygon[]) {
  return polygons.some((polygon) => pointInPolygon(point, polygon))
}

function pointNearAnySegment(
  point: readonly [number, number],
  targetLine: Array<readonly [number, number]>,
  thresholdMeters: number,
) {
  for (let index = 1; index < targetLine.length; index += 1) {
    if (pointToSegmentDistance(point, targetLine[index - 1], targetLine[index]) <= thresholdMeters) {
      return true
    }
  }

  return false
}

function pointNearAnyLine(
  point: readonly [number, number],
  targetLines: ProjectedLine[],
  thresholdMeters: number,
) {
  for (const targetLine of targetLines) {
    if (
      point[0] < targetLine.bbox[0] - thresholdMeters ||
      point[0] > targetLine.bbox[2] + thresholdMeters ||
      point[1] < targetLine.bbox[1] - thresholdMeters ||
      point[1] > targetLine.bbox[3] + thresholdMeters
    ) {
      continue
    }

    if (pointNearAnySegment(point, targetLine.points, thresholdMeters)) {
      return true
    }
  }

  return false
}

function buildCandidateCreekSegments(
  streams: LineCollection,
  accessLines: LineCollection,
  thresholdMeters: number,
  urbanAreas: PolygonCollection,
  excludeUrban: boolean,
  minSegmentMeters = 200,
  maxGapMeters = 125,
): LineCollection {
  const projectedAccessLines = projectLines(accessLines.features)
  const projectedUrbanAreas = excludeUrban ? projectPolygons(urbanAreas.features) : []
  const features: LineFeature[] = []

  for (const stream of streams.features) {
    const samples = sampleLine(stream.geometry.coordinates)
    const candidateAccessLines = projectedAccessLines.filter((line) =>
      bboxIntersects(
        expandedBboxForCoordinates(stream.geometry.coordinates, thresholdMeters + maxGapMeters),
        line.bbox,
      ),
    )

    if (candidateAccessLines.length === 0) {
      continue
    }

    let runCoordinates: GeoJSON.Position[] = []
    let runLength = 0
    let nearLength = 0
    let gapLength = 0
    let previousSample: (typeof samples)[number] | null = null

    const flushRun = () => {
      if (runCoordinates.length >= 2 && nearLength >= minSegmentMeters) {
        features.push({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: runCoordinates,
          },
          properties: {
            name: stream.properties.name ?? null,
            waterway: stream.properties.waterway ?? null,
            candidate_length_m: Math.round(runLength),
            qualifying_length_m: Math.round(nearLength),
            threshold_m: thresholdMeters,
            min_segment_m: minSegmentMeters,
            max_gap_m: maxGapMeters,
            near_trail: true,
            near_access: true,
          },
        })
      }

      runCoordinates = []
      runLength = 0
      nearLength = 0
      gapLength = 0
      previousSample = null
    }

    for (const sample of samples) {
      const inUrban = excludeUrban && pointInAnyPolygon(sample.point, projectedUrbanAreas)
      const nearAccess = pointNearAnyLine(sample.point, candidateAccessLines, thresholdMeters)
      const stepLength = previousSample
        ? Math.hypot(
            sample.point[0] - previousSample.point[0],
            sample.point[1] - previousSample.point[1],
          )
        : 0

      if ((inUrban || !nearAccess) && runCoordinates.length === 0) {
        flushRun()
        continue
      }

      if (inUrban || (!nearAccess && gapLength + stepLength > maxGapMeters)) {
        flushRun()
        continue
      }

      runLength += stepLength
      nearLength += nearAccess ? stepLength : 0
      gapLength = nearAccess ? 0 : gapLength + stepLength
      runCoordinates.push(sample.coordinate)
      previousSample = sample
    }

    flushRun()
  }

  return {
    type: 'FeatureCollection',
    features,
  }
}

function buildCandidateAccessSegments(
  accessLines: LineCollection,
  streams: LineCollection,
  thresholdMeters: number,
  urbanAreas: PolygonCollection,
  excludeUrban: boolean,
  minSegmentMeters = 200,
  maxGapMeters = 125,
): LineCollection {
  const projectedStreams = projectLines(streams.features)
  const projectedUrbanAreas = excludeUrban ? projectPolygons(urbanAreas.features) : []
  const features: LineFeature[] = []

  for (const accessLine of accessLines.features) {
    const samples = sampleLine(accessLine.geometry.coordinates)
    const candidateStreams = projectedStreams.filter((line) =>
      bboxIntersects(
        expandedBboxForCoordinates(accessLine.geometry.coordinates, thresholdMeters + maxGapMeters),
        line.bbox,
      ),
    )

    if (candidateStreams.length === 0) {
      continue
    }

    let runCoordinates: GeoJSON.Position[] = []
    let runLength = 0
    let nearLength = 0
    let gapLength = 0
    let previousSample: (typeof samples)[number] | null = null

    const flushRun = () => {
      if (runCoordinates.length >= 2 && nearLength >= minSegmentMeters) {
        features.push({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: runCoordinates,
          },
          properties: {
            name: accessLine.properties.name ?? null,
            highway: accessLine.properties.highway ?? null,
            candidate_length_m: Math.round(runLength),
            qualifying_length_m: Math.round(nearLength),
            threshold_m: thresholdMeters,
            min_segment_m: minSegmentMeters,
            max_gap_m: maxGapMeters,
            near_creek: true,
          },
        })
      }

      runCoordinates = []
      runLength = 0
      nearLength = 0
      gapLength = 0
      previousSample = null
    }

    for (const sample of samples) {
      const inUrban = excludeUrban && pointInAnyPolygon(sample.point, projectedUrbanAreas)
      const nearCreek = pointNearAnyLine(sample.point, candidateStreams, thresholdMeters)
      const stepLength = previousSample
        ? Math.hypot(
            sample.point[0] - previousSample.point[0],
            sample.point[1] - previousSample.point[1],
          )
        : 0

      if ((inUrban || !nearCreek) && runCoordinates.length === 0) {
        flushRun()
        continue
      }

      if (inUrban || (!nearCreek && gapLength + stepLength > maxGapMeters)) {
        flushRun()
        continue
      }

      runLength += stepLength
      nearLength += nearCreek ? stepLength : 0
      gapLength = nearCreek ? 0 : gapLength + stepLength
      runCoordinates.push(sample.coordinate)
      previousSample = sample
    }

    flushRun()
  }

  return {
    type: 'FeatureCollection',
    features,
  }
}

function sampleFeatureCoordinates(coordinates: GeoJSON.Position[], sampleCount = 10) {
  if (coordinates.length <= sampleCount) {
    return coordinates
  }

  return Array.from({ length: sampleCount }, (_, index) => {
    const coordinateIndex = Math.round((index * (coordinates.length - 1)) / (sampleCount - 1))
    return coordinates[coordinateIndex]
  })
}

function elevationKey(coordinate: GeoJSON.Position) {
  return `${coordinate[1].toFixed(5)},${coordinate[0].toFixed(5)}`
}

async function fetchOpenElevationChunk(coordinates: GeoJSON.Position[]) {
  const locations = coordinates
    .map((coordinate) => `${coordinate[1].toFixed(6)},${coordinate[0].toFixed(6)}`)
    .join('|')
  const response = await fetch(
    `https://api.open-elevation.com/api/v1/lookup?locations=${encodeURIComponent(locations)}`,
  )

  if (!response.ok) {
    throw new Error(`Open-Elevation request failed: ${response.status}`)
  }

  const data = (await response.json()) as { results?: Array<{ elevation?: number }> }
  return coordinates.map((_, index) => data.results?.[index]?.elevation ?? null)
}

async function fetchElevations(coordinates: GeoJSON.Position[]) {
  if (coordinates.length === 0) {
    return []
  }

  const elevations: Array<number | null> = Array.from({ length: coordinates.length }, () => null)
  const missingCoordinates: GeoJSON.Position[] = []
  const missingIndexes: number[] = []

  coordinates.forEach((coordinate, index) => {
    const cachedElevation = elevationCache.get(elevationKey(coordinate))

    if (cachedElevation !== undefined) {
      elevations[index] = cachedElevation
      return
    }

    missingCoordinates.push(coordinate)
    missingIndexes.push(index)
  })

  const chunkSize = 40

  for (let index = 0; index < missingCoordinates.length; index += chunkSize) {
    const chunk = missingCoordinates.slice(index, index + chunkSize)
    const chunkIndexes = missingIndexes.slice(index, index + chunkSize)

    try {
      const chunkElevations = await fetchOpenElevationChunk(chunk)

      chunkElevations.forEach((elevation, chunkIndex) => {
        if (typeof elevation !== 'number') {
          return
        }

        const originalIndex = chunkIndexes[chunkIndex]
        elevations[originalIndex] = elevation
        elevationCache.set(elevationKey(coordinates[originalIndex]), elevation)
      })
    } catch (error) {
      console.error(error)
    }
  }

  return elevations
}

async function enrichCandidateSegmentsWithElevation(candidates: LineCollection) {
  const samplesByFeature = candidates.features.map((feature) =>
    sampleFeatureCoordinates(feature.geometry.coordinates),
  )
  const allSamples = samplesByFeature.flat()
  const elevations = await fetchElevations(allSamples)
  let offset = 0

  return {
    type: 'FeatureCollection',
    features: candidates.features.flatMap((feature, index) => {
      const samples = samplesByFeature[index]
      const featureElevations = elevations.slice(offset, offset + samples.length)
      offset += samples.length

      const numericElevations = featureElevations.filter((elevation): elevation is number => typeof elevation === 'number')

      if (numericElevations.length < 2 || featureElevations.some((elevation) => typeof elevation !== 'number')) {
        return [feature]
      }

      const elevationsForFeature = featureElevations as number[]
      const elevationRange = Math.max(...elevationsForFeature) - Math.min(...elevationsForFeature)
      const lengthKm = Number(feature.properties.candidate_length_m || 0) / 1000
      const gainRate = lengthKm > 0 ? Math.round(elevationRange / lengthKm) : null
      const slopePercent = gainRate !== null ? Number((gainRate / 10).toFixed(1)) : null

      return samples.slice(1).map((sample, sampleIndex) => {
        const previousSample = samples[sampleIndex]
        const previousElevation = elevationsForFeature[sampleIndex]
        const elevation = elevationsForFeature[sampleIndex + 1]
        const segmentLengthMeters = Math.hypot(
          projectToMeters(sample)[0] - projectToMeters(previousSample)[0],
          projectToMeters(sample)[1] - projectToMeters(previousSample)[1],
        )
        const localGainRate =
          segmentLengthMeters > 0
            ? Math.round((Math.abs(elevation - previousElevation) / segmentLengthMeters) * 1000)
            : null
        const localSlopePercent =
          localGainRate !== null ? Number((localGainRate / 10).toFixed(1)) : null

        return {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [previousSample, sample],
          },
          properties: {
            ...feature.properties,
            candidate_length_m: Math.round(segmentLengthMeters),
            elevation_range_m: Math.round(elevationRange),
            gain_rate_m_per_km: gainRate,
            local_gain_rate_m_per_km: localGainRate,
            slope_percent: slopePercent,
            local_slope_percent: localSlopePercent,
          },
        } satisfies LineFeature
      })
    }),
  } satisfies LineCollection
}

function App() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const elevationRequestRef = useRef(0)
  const [activePlace, setActivePlace] = useState(places[0].name)
  const [status, setStatus] = useState<OverlayStatus>('idle')
  const [statusMessage, setStatusMessage] = useState('Choose an area or load the current view.')
  const [summary, setSummary] = useState({
    trails: 0,
    roads: 0,
    streams: 0,
    urbanAreas: 0,
    creekSegments: 0,
    accessSegments: 0,
  })
  const [nearTrailOnly, setNearTrailOnly] = useState(false)
  const [excludeUrban, setExcludeUrban] = useState(true)
  const [trailThresholdMeters, setTrailThresholdMeters] = useState(75)
  const [minimumSegmentMeters, setMinimumSegmentMeters] = useState(200)
  const [overlayData, setOverlayData] = useState<{
    trails: LineCollection
    roads: LineCollection
    streams: LineCollection
    urbanAreas: PolygonCollection
  }>({
    trails: emptyLines,
    roads: emptyLines,
    streams: emptyLines,
    urbanAreas: emptyPolygons,
  })
  const [layers, setLayers] = useState({
    trails: true,
    roads: true,
    streams: true,
    topo: true,
  })

  const setSourceData = useCallback(
    (
      sourceName: 'trails' | 'roads' | 'streams' | 'candidateStreams' | 'candidateAccess',
      data: LineCollection,
    ) => {
      const source = mapRef.current?.getSource(sourceName)
      if (source && 'setData' in source) {
        ;(source as GeoJSONSource).setData(data)
      }
    },
    [],
  )

  const setLayerVisibility = useCallback((layerId: string, visible: boolean) => {
    if (!mapRef.current?.getLayer(layerId)) {
      return
    }
    mapRef.current.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none')
  }, [])

  const applyFilterStyling = useCallback((enabled: boolean) => {
    const map = mapRef.current
    if (!map) {
      return
    }

    if (map.getLayer('osm-base')) {
      map.setPaintProperty('osm-base', 'raster-saturation', enabled ? -1 : 0)
      map.setPaintProperty('osm-base', 'raster-opacity', enabled ? 0.72 : 1)
    }

    if (map.getLayer('topo-base')) {
      map.setPaintProperty('topo-base', 'raster-saturation', enabled ? -1 : 0)
      map.setPaintProperty('topo-base', 'raster-opacity', enabled ? 0.55 : 0.9)
    }

    if (map.getLayer('roads-line')) {
      map.setPaintProperty('roads-line', 'line-color', '#8c8e89')
      map.setPaintProperty('roads-line', 'line-opacity', enabled ? 0.36 : 0.42)
      map.setPaintProperty(
        'roads-line',
        'line-width',
        enabled
          ? ['interpolate', ['linear'], ['zoom'], 10, 0.55, 15, 1.5]
          : ['interpolate', ['linear'], ['zoom'], 10, 0.7, 15, 2.2],
      )
    }

    if (map.getLayer('streams-line')) {
      map.setPaintProperty('streams-line', 'line-color', enabled ? '#989b95' : '#2f8fb8')
      map.setPaintProperty('streams-line', 'line-opacity', enabled ? 0.34 : 0.5)
      map.setPaintProperty(
        'streams-line',
        'line-width',
        enabled
          ? ['interpolate', ['linear'], ['zoom'], 10, 0.65, 15, 1.4]
          : ['interpolate', ['linear'], ['zoom'], 10, 0.9, 15, 2.4],
      )
    }

    if (map.getLayer('trails-line')) {
      map.setPaintProperty('trails-line', 'line-color', enabled ? '#8c8e89' : '#f27d1d')
      map.setPaintProperty('trails-line', 'line-opacity', enabled ? 0.44 : 0.92)
      map.setPaintProperty(
        'trails-line',
        'line-width',
        enabled
          ? ['interpolate', ['linear'], ['zoom'], 10, 0.85, 15, 1.7]
          : ['interpolate', ['linear'], ['zoom'], 10, 1.1, 15, 3],
      )
    }

    if (map.getLayer('streams-near-halo')) {
      map.setPaintProperty('streams-near-halo', 'line-opacity', enabled ? 0.88 : 0.72)
      map.setPaintProperty(
        'streams-near-halo',
        'line-width',
        enabled
          ? ['interpolate', ['linear'], ['zoom'], 10, 7.5, 15, 12]
          : ['interpolate', ['linear'], ['zoom'], 10, 5.5, 15, 9],
      )
    }

    if (map.getLayer('streams-near-line')) {
      map.setPaintProperty('streams-near-line', 'line-color', [
        'case',
        ['has', 'local_slope_percent'],
        [
          'interpolate',
          ['linear'],
          ['get', 'local_slope_percent'],
          0,
          '#ffffb2',
          2,
          '#fed976',
          6,
          '#78c679',
          12,
          '#fd8d3c',
          20,
          '#e31a1c',
          20.1,
          '#000000',
        ],
        '#00d061',
      ])
      map.setPaintProperty('streams-near-line', 'line-opacity', enabled ? 1 : 0.96)
      map.setPaintProperty(
        'streams-near-line',
        'line-width',
        enabled
          ? ['interpolate', ['linear'], ['zoom'], 10, 3.8, 15, 6.6]
          : ['interpolate', ['linear'], ['zoom'], 10, 2.8, 15, 5.2],
      )
    }

    if (map.getLayer('access-near-line')) {
      map.setPaintProperty('access-near-line', 'line-color', enabled ? '#ff9b21' : '#f27d1d')
      map.setPaintProperty('access-near-line', 'line-opacity', enabled ? 0.98 : 0.82)
      map.setPaintProperty(
        'access-near-line',
        'line-width',
        enabled
          ? ['interpolate', ['linear'], ['zoom'], 10, 2.2, 15, 4.2]
          : ['interpolate', ['linear'], ['zoom'], 10, 1.6, 15, 3.2],
      )
    }
  }, [])

  const loadOverlays = useCallback(async () => {
    const map = mapRef.current
    if (!map) {
      return
    }

    const bounds = map.getBounds()
    const south = bounds.getSouth().toFixed(6)
    const west = bounds.getWest().toFixed(6)
    const north = bounds.getNorth().toFixed(6)
    const east = bounds.getEast().toFixed(6)
    const bbox = `${south},${west},${north},${east}`

    const query = `
      [out:json][timeout:25];
      (
        way["highway"~"^(path|footway|track|bridleway|steps|service|residential|unclassified|tertiary|secondary|primary)$"](${bbox});
        way["waterway"~"^(stream|river|canal|ditch|drain)$"](${bbox});
        way["landuse"~"^(residential|commercial|industrial|retail|construction)$"](${bbox});
      );
      out tags geom;
    `

    setStatus('loading')
    setStatusMessage('Loading OSM trails, roads, and streams for the current view...')

    try {
      const parsed = overpassToGeoJson(await fetchOverpass(query))
      setSourceData('trails', parsed.trails)
      setSourceData('roads', parsed.roads)
      setSourceData('streams', parsed.streams)
      setOverlayData({
        trails: parsed.trails,
        roads: parsed.roads,
        streams: parsed.streams,
        urbanAreas: parsed.urbanAreas,
      })
      setSummary({
        trails: parsed.trails.features.length,
        roads: parsed.roads.features.length,
        streams: parsed.streams.features.length,
        urbanAreas: parsed.urbanAreas.features.length,
        creekSegments: 0,
        accessSegments: 0,
      })
      setStatus('ready')
      setStatusMessage('Loaded. Candidate segments update from the current threshold.')
    } catch (error) {
      console.error(error)
      setStatus('error')
      setStatusMessage('Could not load OSM data. Zoom in or retry.')
    }
  }, [setSourceData])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return
    }

    const map = new maplibregl.Map({
      container: containerRef.current,
      center: places[0].center,
      zoom: places[0].zoom,
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '&copy; OpenStreetMap contributors',
          },
          topo: {
            type: 'raster',
            tiles: ['https://a.tile.opentopomap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution:
              'Map data: &copy; OpenStreetMap contributors, SRTM | Map style: &copy; OpenTopoMap',
          },
        },
        layers: [
          {
            id: 'osm-base',
            type: 'raster',
            source: 'osm',
          },
          {
            id: 'topo-base',
            type: 'raster',
            source: 'topo',
            paint: {
              'raster-opacity': 0.9,
            },
          },
        ],
      },
    })

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right')
    mapRef.current = map

    map.on('load', () => {
      map.addSource('streams', {
        type: 'geojson',
        data: emptyLines,
      })

      map.addSource('trails', {
        type: 'geojson',
        data: emptyLines,
      })

      map.addSource('roads', {
        type: 'geojson',
        data: emptyLines,
      })

      map.addSource('candidateStreams', {
        type: 'geojson',
        data: emptyLines,
      })

      map.addSource('candidateAccess', {
        type: 'geojson',
        data: emptyLines,
      })

      map.addLayer({
        id: 'roads-line',
        type: 'line',
        source: 'roads',
        paint: {
          'line-color': '#858882',
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.7, 15, 2.2],
          'line-opacity': 0.42,
        },
      })

      map.addLayer({
        id: 'streams-line',
        type: 'line',
        source: 'streams',
        paint: {
          'line-color': '#2f8fb8',
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.9, 15, 2.4],
          'line-opacity': 0.5,
        },
      })

      map.addLayer({
        id: 'streams-near-halo',
        type: 'line',
        source: 'candidateStreams',
        paint: {
          'line-color': '#f5ff7a',
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 5.5, 15, 9],
          'line-opacity': 0.72,
          'line-blur': 1.2,
        },
      })

      map.addLayer({
        id: 'streams-near-line',
        type: 'line',
        source: 'candidateStreams',
        paint: {
          'line-color': [
            'case',
            ['has', 'local_slope_percent'],
            [
              'interpolate',
              ['linear'],
              ['get', 'local_slope_percent'],
              0,
              '#ffffb2',
              2,
              '#fed976',
              6,
              '#78c679',
              12,
              '#fd8d3c',
              20,
              '#e31a1c',
              20.1,
              '#000000',
            ],
            '#00d061',
          ],
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 2.8, 15, 5.2],
          'line-opacity': 0.96,
        },
      })

      map.addLayer({
        id: 'access-near-line',
        type: 'line',
        source: 'candidateAccess',
        paint: {
          'line-color': '#f27d1d',
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.6, 15, 3.2],
          'line-dasharray': [1.2, 0.9],
          'line-opacity': 0.82,
        },
      })

      map.addLayer({
        id: 'trails-line',
        type: 'line',
        source: 'trails',
        paint: {
          'line-color': '#f27d1d',
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.1, 15, 3],
          'line-dasharray': [1.4, 1],
          'line-opacity': 0.92,
        },
      })

      map.on('mouseenter', 'streams-line', () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseenter', 'streams-near-line', () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseenter', 'trails-line', () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseenter', 'access-near-line', () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseenter', 'roads-line', () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', 'streams-line', () => {
        map.getCanvas().style.cursor = ''
      })
      map.on('mouseleave', 'streams-near-line', () => {
        map.getCanvas().style.cursor = ''
      })
      map.on('mouseleave', 'trails-line', () => {
        map.getCanvas().style.cursor = ''
      })
      map.on('mouseleave', 'access-near-line', () => {
        map.getCanvas().style.cursor = ''
      })
      map.on('mouseleave', 'roads-line', () => {
        map.getCanvas().style.cursor = ''
      })

      const showPopup = (event: MapLayerMouseEvent) => {
        const feature = event.features?.[0]
        if (!feature?.properties) {
          return
        }

        new maplibregl.Popup({ closeButton: false, maxWidth: '280px' })
          .setLngLat(event.lngLat)
          .setHTML(buildPopupHtml(featureName(feature.properties), feature.properties))
          .addTo(map)
      }

      map.on('click', 'streams-line', showPopup)
      map.on('click', 'streams-near-line', showPopup)
      map.on('click', 'access-near-line', showPopup)
      map.on('click', 'trails-line', showPopup)
      map.on('click', 'roads-line', showPopup)
      loadOverlays()
    })

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [loadOverlays])

  useEffect(() => {
    setLayerVisibility('trails-line', layers.trails)
    setLayerVisibility('roads-line', layers.roads)
    setLayerVisibility('streams-line', layers.streams)
    setLayerVisibility('streams-near-halo', layers.streams)
    setLayerVisibility('streams-near-line', layers.streams)
    setLayerVisibility('access-near-line', layers.trails || layers.roads)
    setLayerVisibility('topo-base', layers.topo)
  }, [layers, setLayerVisibility])

  useEffect(() => {
    applyFilterStyling(nearTrailOnly)
  }, [applyFilterStyling, nearTrailOnly])

  useEffect(() => {
    const accessLines: LineCollection = {
      type: 'FeatureCollection',
      features: [...overlayData.trails.features, ...overlayData.roads.features],
    }
    const candidateSegments = buildCandidateCreekSegments(
      overlayData.streams,
      accessLines,
      trailThresholdMeters,
      overlayData.urbanAreas,
      excludeUrban,
      minimumSegmentMeters,
    )
    const candidateAccessSegments = buildCandidateAccessSegments(
      accessLines,
      candidateSegments,
      trailThresholdMeters,
      overlayData.urbanAreas,
      excludeUrban,
      minimumSegmentMeters,
    )

    setSourceData('trails', overlayData.trails)
    setSourceData('streams', overlayData.streams)
    setSourceData('candidateStreams', candidateSegments)
    setSourceData('candidateAccess', candidateAccessSegments)
    setSummary({
      trails: overlayData.trails.features.length,
      roads: overlayData.roads.features.length,
      streams: overlayData.streams.features.length,
      urbanAreas: overlayData.urbanAreas.features.length,
      creekSegments: candidateSegments.features.length,
      accessSegments: candidateAccessSegments.features.length,
    })

    if (status === 'ready') {
      setStatusMessage(
        candidateSegments.features.length > 0
          ? `Found ${candidateSegments.features.length} creek segments and ${candidateAccessSegments.features.length} access segments.`
          : 'No candidate segments found in this loaded view. Try 150m or reload a smaller area.',
      )
    }

    const requestId = elevationRequestRef.current + 1
    elevationRequestRef.current = requestId

    if (candidateSegments.features.length > 0) {
      setStatusMessage(
        `Found ${candidateSegments.features.length} creek segments. Loading elevation colors...`,
      )
      void enrichCandidateSegmentsWithElevation(candidateSegments)
        .then((enrichedCandidates) => {
          if (elevationRequestRef.current !== requestId) {
            return
          }

          setSourceData('candidateStreams', enrichedCandidates)
          setStatusMessage(
            `Found ${enrichedCandidates.features.length} creek segments. Colors show local slope percent.`,
          )
        })
        .catch((error) => {
          console.error(error)
          if (elevationRequestRef.current === requestId) {
            setStatusMessage(
              `Found ${candidateSegments.features.length} creek segments. Elevation color lookup failed.`,
            )
          }
        })
    }
  }, [
    excludeUrban,
    minimumSegmentMeters,
    nearTrailOnly,
    overlayData,
    setSourceData,
    status,
    trailThresholdMeters,
  ])

  const jumpToPlace = (place: Place) => {
    setActivePlace(place.name)
    const map = mapRef.current
    if (!map) {
      return
    }

    map.once('moveend', () => {
      void loadOverlays()
    })
    map.flyTo({
      center: place.center,
      zoom: place.zoom,
      speed: 1.1,
    })
  }

  return (
    <main className="app-shell">
      <aside className="control-panel" aria-label="Map controls">
        <div className="brand-block">
          <p className="eyebrow">River Trekking Map</p>
          <h1>Bay Area base map</h1>
          <p>
            First-pass exploration map for checking trail, creek, and terrain alignment before
            candidate scoring.
          </p>
        </div>

        <section className="panel-section">
          <h2>Layers</h2>
          <label>
            <input
              type="checkbox"
              checked={layers.trails}
              onChange={(event) => setLayers((value) => ({ ...value, trails: event.target.checked }))}
            />
            <span className="trail-swatch"></span>
            Trails / paths
          </label>
          <label>
            <input
              type="checkbox"
              checked={layers.roads}
              onChange={(event) => setLayers((value) => ({ ...value, roads: event.target.checked }))}
            />
            <span className="road-swatch"></span>
            Roads
          </label>
          <label>
            <input
              type="checkbox"
              checked={layers.streams}
              onChange={(event) =>
                setLayers((value) => ({ ...value, streams: event.target.checked }))
              }
            />
            <span className="stream-swatch"></span>
            Streams / creeks
          </label>
          <div className="legend-row">
            <span className="candidate-swatch"></span>
            Candidate creek slope
          </div>
          <div className="legend-row">
            <span className="access-candidate-swatch"></span>
            Access near creeks
          </div>
          <label>
            <input
              type="checkbox"
              checked={layers.topo}
              onChange={(event) => setLayers((value) => ({ ...value, topo: event.target.checked }))}
            />
            Topographic basemap
          </label>
        </section>

        <section className="panel-section">
          <h2>Test areas</h2>
          <div className="place-list">
            {places.map((place) => (
              <button
                className={place.name === activePlace ? 'active' : ''}
                key={place.name}
                type="button"
                onClick={() => jumpToPlace(place)}
              >
                <strong>{place.name}</strong>
                <span>{place.note}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="panel-section">
          <h2>OSM overlay</h2>
          <button className="load-button" type="button" onClick={loadOverlays} disabled={status === 'loading'}>
            {status === 'loading' ? 'Loading current view' : 'Load current view'}
          </button>
          <dl className="summary-grid">
            <div>
              <dt>Trails</dt>
              <dd>{summary.trails}</dd>
            </div>
            <div>
              <dt>Roads</dt>
              <dd>{summary.roads}</dd>
            </div>
            <div>
              <dt>Streams</dt>
              <dd>{summary.streams}</dd>
            </div>
            <div>
              <dt>Urban</dt>
              <dd>{summary.urbanAreas}</dd>
            </div>
            <div>
              <dt>Creek segs</dt>
              <dd>{summary.creekSegments}</dd>
            </div>
            <div>
              <dt>Access segs</dt>
              <dd>{summary.accessSegments}</dd>
            </div>
          </dl>
          {status === 'error' && (
            <p className="error-text">Overpass is unavailable or the view is too large. Zoom in and retry.</p>
          )}
          {status !== 'error' && <p className="helper-text">{statusMessage}</p>}
        </section>

        <section className="panel-section">
          <h2>Creek filter</h2>
          <label>
            <input
              type="checkbox"
              checked={nearTrailOnly}
              onChange={(event) => setNearTrailOnly(event.target.checked)}
            />
            Only show creek-access pairs
          </label>
          <label>
            <input
              type="checkbox"
              checked={excludeUrban}
              onChange={(event) => setExcludeUrban(event.target.checked)}
            />
            Exclude urban areas
          </label>
          <label className="stacked-control">
            <span>Access distance threshold</span>
            <select
              value={trailThresholdMeters}
              onChange={(event) => setTrailThresholdMeters(Number(event.target.value))}
            >
              <option value={10}>10 m</option>
              <option value={30}>30 m</option>
              <option value={75}>75 m</option>
              <option value={150}>150 m</option>
              <option value={250}>250 m</option>
            </select>
          </label>
          <label className="stacked-control">
            <span>Minimum continuous segment</span>
            <select
              value={minimumSegmentMeters}
              onChange={(event) => setMinimumSegmentMeters(Number(event.target.value))}
            >
              <option value={200}>200 m</option>
              <option value={500}>500 m</option>
              <option value={1000}>1 km</option>
              <option value={2000}>2 km</option>
            </select>
          </label>
          <p className="helper-text">
            Current-view estimate using OSM geometry. Candidate creek colors use sampled local slope percent:
            pale is flatter, orange/red is steeper, black is over 20%. Urban landuse is excluded by default.
          </p>
        </section>

        <p className="disclaimer">
          OSM overlays are planning references only. They do not verify access, safety, passability,
          closures, or water conditions.
        </p>
      </aside>

      <div className="map-wrap">
        <div ref={containerRef} className="map-container" />
      </div>
    </main>
  )
}

export default App

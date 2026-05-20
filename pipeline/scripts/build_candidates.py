#!/usr/bin/env python3
"""Build creek-trail candidate GeoJSON from OSM data.

This is a dependency-free V0 pipeline. It mirrors the current frontend prototype
logic so we can start validating generated data before introducing GeoPandas,
PostGIS, DEM processing, and vector tiles.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

Coordinate = Tuple[float, float]
Point = Tuple[float, float]
BBox = Tuple[float, float, float, float]

TRAIL_HIGHWAY_TYPES = {"path", "footway", "track", "bridleway", "steps"}
URBAN_LANDUSE_TYPES = {"residential", "commercial", "industrial", "retail", "construction"}
OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]

AREA_PRESETS: Dict[str, BBox] = {
    # south, west, north, east
    "uvas": (37.060, -121.825, 37.105, -121.765),
    "fall_creek": (37.055, -122.115, 37.085, -122.075),
    "purisima": (37.420, -122.390, 37.465, -122.325),
    "little_yosemite": (37.495, -121.855, 37.535, -121.790),
    "big_basin": (37.145, -122.260, 37.195, -122.185),
    "mt_tam": (37.885, -122.635, 37.945, -122.555),
}


def project_to_meters(coord: Coordinate) -> Point:
    lon, lat = coord
    radius = 6378137.0
    x = lon * math.pi * radius / 180.0
    y = math.log(math.tan(math.pi / 4.0 + lat * math.pi / 360.0)) * radius
    return x, y


def point_to_segment_distance(point: Point, a: Point, b: Point) -> float:
    dx = b[0] - a[0]
    dy = b[1] - a[1]
    if dx == 0 and dy == 0:
        return math.hypot(point[0] - a[0], point[1] - a[1])

    t = max(0.0, min(1.0, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / (dx * dx + dy * dy)))
    return math.hypot(point[0] - (a[0] + t * dx), point[1] - (a[1] + t * dy))


def bbox_for_points(points: Sequence[Point]) -> BBox:
    xs = [point[0] for point in points]
    ys = [point[1] for point in points]
    return min(xs), min(ys), max(xs), max(ys)


def expanded_bbox_for_coordinates(coordinates: Sequence[Coordinate], padding_m: float) -> BBox:
    min_x, min_y, max_x, max_y = bbox_for_points([project_to_meters(coord) for coord in coordinates])
    return min_x - padding_m, min_y - padding_m, max_x + padding_m, max_y + padding_m


def bbox_intersects(a: BBox, b: BBox) -> bool:
    return a[0] <= b[2] and a[2] >= b[0] and a[1] <= b[3] and a[3] >= b[1]


def sample_line(coordinates: Sequence[Coordinate], interval_m: float = 25.0) -> List[Dict[str, Any]]:
    samples: List[Dict[str, Any]] = []

    for index in range(1, len(coordinates)):
        start_coord = coordinates[index - 1]
        end_coord = coordinates[index]
        start = project_to_meters(start_coord)
        end = project_to_meters(end_coord)
        dx = end[0] - start[0]
        dy = end[1] - start[1]
        length = math.hypot(dx, dy)
        steps = max(1, math.ceil(length / interval_m))

        for step in range(steps):
            t = step / steps
            samples.append(
                {
                    "coordinate": (
                        start_coord[0] + (end_coord[0] - start_coord[0]) * t,
                        start_coord[1] + (end_coord[1] - start_coord[1]) * t,
                    ),
                    "point": (start[0] + dx * t, start[1] + dy * t),
                }
            )

    if coordinates:
        samples.append({"coordinate": coordinates[-1], "point": project_to_meters(coordinates[-1])})

    return samples


def project_lines(features: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    projected = []
    for feature in features:
        points = [project_to_meters(tuple(coord)) for coord in feature["geometry"]["coordinates"]]
        projected.append({"points": points, "bbox": bbox_for_points(points)})
    return projected


def point_near_segment_line(point: Point, target_line: Sequence[Point], threshold_m: float) -> bool:
    for index in range(1, len(target_line)):
        if point_to_segment_distance(point, target_line[index - 1], target_line[index]) <= threshold_m:
            return True
    return False


def point_near_any_line(point: Point, target_lines: Sequence[Dict[str, Any]], threshold_m: float) -> bool:
    for target_line in target_lines:
        bbox = target_line["bbox"]
        if point[0] < bbox[0] - threshold_m or point[0] > bbox[2] + threshold_m:
            continue
        if point[1] < bbox[1] - threshold_m or point[1] > bbox[3] + threshold_m:
            continue
        if point_near_segment_line(point, target_line["points"], threshold_m):
            return True
    return False


def point_in_ring(point: Point, ring: Sequence[Point]) -> bool:
    inside = False
    previous = len(ring) - 1
    for index in range(len(ring)):
        current_point = ring[index]
        previous_point = ring[previous]
        intersects = (current_point[1] > point[1]) != (previous_point[1] > point[1]) and point[0] < (
            (previous_point[0] - current_point[0])
            * (point[1] - current_point[1])
            / (previous_point[1] - current_point[1])
            + current_point[0]
        )
        if intersects:
            inside = not inside
        previous = index
    return inside


def project_polygons(features: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    polygons = []
    for feature in features:
        rings = [[project_to_meters(tuple(coord)) for coord in ring] for ring in feature["geometry"]["coordinates"]]
        polygons.append({"rings": rings, "bbox": bbox_for_points([point for ring in rings for point in ring])})
    return polygons


def point_in_polygon(point: Point, polygon: Dict[str, Any]) -> bool:
    bbox = polygon["bbox"]
    if point[0] < bbox[0] or point[0] > bbox[2] or point[1] < bbox[1] or point[1] > bbox[3]:
        return False
    rings = polygon["rings"]
    if not rings or not point_in_ring(point, rings[0]):
        return False
    return not any(point_in_ring(point, ring) for ring in rings[1:])


def point_in_any_polygon(point: Point, polygons: Sequence[Dict[str, Any]]) -> bool:
    return any(point_in_polygon(point, polygon) for polygon in polygons)


def build_overpass_query(bbox: BBox) -> str:
    south, west, north, east = bbox
    bbox_text = f"{south},{west},{north},{east}"
    return f"""
      [out:json][timeout:60];
      (
        way["highway"~"^(path|footway|track|bridleway|steps|service|residential|unclassified|tertiary|secondary|primary)$"]({bbox_text});
        way["waterway"~"^(stream|river|canal|ditch|drain)$"]({bbox_text});
        way["landuse"~"^(residential|commercial|industrial|retail|construction)$"]({bbox_text});
      );
      out tags geom;
    """


def fetch_overpass(query: str) -> Dict[str, Any]:
    payload = urllib.parse.urlencode({"data": query}).encode("utf-8")
    last_error: Optional[BaseException] = None

    for endpoint in OVERPASS_ENDPOINTS:
        request = urllib.request.Request(
            endpoint,
            data=payload,
            headers={
                "User-Agent": "RiverTrekkingMapPipeline/0.1",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=90) as response:
                return json.loads(response.read().decode("utf-8"))
        except BaseException as error:  # urllib raises several concrete exception types.
            last_error = error
            time.sleep(1)

    raise RuntimeError(f"All Overpass endpoints failed: {last_error}")


def feature_collection(features: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
    return {"type": "FeatureCollection", "features": list(features)}


def overpass_to_layers(data: Dict[str, Any]) -> Dict[str, List[Dict[str, Any]]]:
    trails: List[Dict[str, Any]] = []
    roads: List[Dict[str, Any]] = []
    streams: List[Dict[str, Any]] = []
    urban_areas: List[Dict[str, Any]] = []

    for element in data.get("elements", []):
        geometry = element.get("geometry")
        tags = element.get("tags", {})
        if element.get("type") != "way" or not geometry or len(geometry) < 2:
            continue

        coordinates: List[Coordinate] = [(point["lon"], point["lat"]) for point in geometry]
        is_closed = coordinates[0] == coordinates[-1]

        if is_closed and tags.get("landuse") in URBAN_LANDUSE_TYPES:
            urban_areas.append(
                {
                    "type": "Feature",
                    "geometry": {"type": "Polygon", "coordinates": [coordinates]},
                    "properties": tags,
                }
            )
            continue

        feature = {
            "type": "Feature",
            "geometry": {"type": "LineString", "coordinates": coordinates},
            "properties": tags,
        }

        if tags.get("waterway"):
            streams.append(feature)
        elif tags.get("highway") in TRAIL_HIGHWAY_TYPES:
            trails.append(feature)
        elif tags.get("highway"):
            roads.append(feature)

    return {"trails": trails, "roads": roads, "streams": streams, "urban_areas": urban_areas}


def build_candidate_segments(
    source_lines: Sequence[Dict[str, Any]],
    target_lines: Sequence[Dict[str, Any]],
    threshold_m: float,
    min_segment_m: float,
    max_gap_m: float,
    urban_areas: Sequence[Dict[str, Any]],
    exclude_urban: bool,
    source_kind: str,
) -> List[Dict[str, Any]]:
    projected_targets = project_lines(target_lines)
    projected_urban = project_polygons(urban_areas) if exclude_urban else []
    features: List[Dict[str, Any]] = []

    for source_line in source_lines:
        source_coordinates = source_line["geometry"]["coordinates"]
        candidate_targets = [
            line
            for line in projected_targets
            if bbox_intersects(expanded_bbox_for_coordinates(source_coordinates, threshold_m + max_gap_m), line["bbox"])
        ]
        if not candidate_targets:
            continue

        samples = sample_line(source_coordinates)
        run_coordinates: List[Coordinate] = []
        run_length = 0.0
        near_length = 0.0
        gap_length = 0.0
        previous_sample: Optional[Dict[str, Any]] = None

        def flush_run() -> None:
            nonlocal run_coordinates, run_length, near_length, gap_length, previous_sample
            if len(run_coordinates) >= 2 and near_length >= min_segment_m:
                properties = dict(source_line.get("properties", {}))
                properties.update(
                    {
                        "candidate_kind": source_kind,
                        "candidate_length_m": round(run_length),
                        "qualifying_length_m": round(near_length),
                        "threshold_m": threshold_m,
                        "min_segment_m": min_segment_m,
                        "max_gap_m": max_gap_m,
                    }
                )
                features.append(
                    {
                        "type": "Feature",
                        "geometry": {"type": "LineString", "coordinates": run_coordinates},
                        "properties": properties,
                    }
                )

            run_coordinates = []
            run_length = 0.0
            near_length = 0.0
            gap_length = 0.0
            previous_sample = None

        for sample in samples:
            point = sample["point"]
            in_urban = exclude_urban and point_in_any_polygon(point, projected_urban)
            near_target = point_near_any_line(point, candidate_targets, threshold_m)
            step_length = (
                math.hypot(point[0] - previous_sample["point"][0], point[1] - previous_sample["point"][1])
                if previous_sample
                else 0.0
            )

            if (in_urban or not near_target) and not run_coordinates:
                flush_run()
                continue

            if in_urban or (not near_target and gap_length + step_length > max_gap_m):
                flush_run()
                continue

            run_length += step_length
            near_length += step_length if near_target else 0.0
            gap_length = 0.0 if near_target else gap_length + step_length
            run_coordinates.append(sample["coordinate"])
            previous_sample = sample

        flush_run()

    return features


def write_geojson(path: Path, features: Sequence[Dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(feature_collection(features), indent=2), encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build creek-trail candidate GeoJSON.")
    parser.add_argument("--area", choices=sorted(AREA_PRESETS), default="uvas")
    parser.add_argument("--bbox", help="Custom bbox as south,west,north,east")
    parser.add_argument("--out", default="data/processed/candidates")
    parser.add_argument("--trail-distance-m", type=float, default=75)
    parser.add_argument("--min-segment-m", type=float, default=200)
    parser.add_argument("--max-gap-m", type=float, default=125)
    parser.add_argument("--include-urban", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    bbox = AREA_PRESETS[args.area]
    if args.bbox:
        parts = [float(part.strip()) for part in args.bbox.split(",")]
        if len(parts) != 4:
            raise ValueError("--bbox must be south,west,north,east")
        bbox = tuple(parts)  # type: ignore[assignment]

    output_dir = Path(args.out)
    query = build_overpass_query(bbox)
    print(f"Fetching OSM data for {args.area}...")
    layers = overpass_to_layers(fetch_overpass(query))

    candidate_creeks = build_candidate_segments(
        layers["streams"],
        layers["trails"],
        args.trail_distance_m,
        args.min_segment_m,
        args.max_gap_m,
        layers["urban_areas"],
        not args.include_urban,
        "creek",
    )
    candidate_trails = build_candidate_segments(
        layers["trails"],
        candidate_creeks,
        args.trail_distance_m,
        args.min_segment_m,
        args.max_gap_m,
        layers["urban_areas"],
        not args.include_urban,
        "trail",
    )

    write_geojson(output_dir / "candidate_creeks.geojson", candidate_creeks)
    write_geojson(output_dir / "candidate_trails.geojson", candidate_trails)
    write_geojson(output_dir / "trails.geojson", layers["trails"])
    write_geojson(output_dir / "streams.geojson", layers["streams"])
    write_geojson(output_dir / "roads.geojson", layers["roads"])
    write_geojson(output_dir / "urban_areas.geojson", layers["urban_areas"])

    summary = {
        "area": args.area,
        "bbox": bbox,
        "trail_distance_m": args.trail_distance_m,
        "min_segment_m": args.min_segment_m,
        "max_gap_m": args.max_gap_m,
        "exclude_urban": not args.include_urban,
        "counts": {
            "trails": len(layers["trails"]),
            "roads": len(layers["roads"]),
            "streams": len(layers["streams"]),
            "urban_areas": len(layers["urban_areas"]),
            "candidate_creeks": len(candidate_creeks),
            "candidate_trails": len(candidate_trails),
        },
    }
    (output_dir / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))

    return 0 if candidate_creeks else 2


if __name__ == "__main__":
    sys.exit(main())

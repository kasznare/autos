# Map Schema v3

`TrackMap` now includes map-owned geometry and world-object layers in addition to terrain/material/spawn rules.

## New Fields
- `laneCount`: logical number of lanes spanning `roadWidth`.
- `laneWidth`: explicit lane width used for lane marker and traffic offset alignment.
- `detailDensity`: multiplier for roadside detail density.
- `interactables: MapInteractable[]`: map-owned world geometry objects with collider behavior.
- `environmentObjects: MapEnvironmentObject[]`: map-owned sky/environment objects.

## MapInteractable
- `id`
- `kind`: `block | crate | ramp | tower | barrier`
- `position`, `size`, optional `rotation`
- `material`: `soft | medium | hard` (collision severity category)
- `collider`: `fixed | dynamic | none`
- `color`

## MapEnvironmentObject
- `id`
- `kind`: `sun | cloud | bird`
- `position`, `scale`, `color`
- optional `speed` for animated objects

## Lane Helpers
- `getRingLaneGuideHalfSizes(map)` for ring-lane divider rendering.
- `getLaneOffset(map, laneIndex)` for lane-aware geometry and traffic alignment.
- `getRoadDetailCount(map)` for map-driven roadside density.

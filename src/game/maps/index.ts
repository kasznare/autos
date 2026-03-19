export { MAP_LABELS, MAP_ORDER } from './data'
export {
  createInitialDestructibles,
  getLaneOffset,
  getMaterialTuningAt,
  getRingLaneGuideHalfSizes,
  getRoadDetailCount,
  isPointNearRoad,
  getSurfaceMaterialAt,
  getTrackMap,
  isPointOnRoad,
  sampleTerrainHeight,
} from './logic'
export { MAP_SCHEMA_VERSION } from './schema'
export type { MapEnvironmentObject, MapId, MapInteractable, TrackMap } from './schema'

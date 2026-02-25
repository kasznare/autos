import type { Pickup, WorldObstacle } from './types'

export const STATIC_OBSTACLES: WorldObstacle[] = [
  { id: 'wall-north', position: [0, 1, -29], size: [29, 2, 1], hard: true, color: '#5f6067' },
  { id: 'wall-south', position: [0, 1, 29], size: [29, 2, 1], hard: true, color: '#5f6067' },
  { id: 'wall-east', position: [29, 1, 0], size: [1, 2, 29], hard: true, color: '#5f6067' },
  { id: 'wall-west', position: [-29, 1, 0], size: [1, 2, 29], hard: true, color: '#5f6067' },
  { id: 'truck-1', position: [10, 1, 5], size: [2, 2, 4], hard: true, color: '#2f3348' },
  { id: 'truck-2', position: [-8, 1, -11], size: [2, 2, 4], hard: true, color: '#2f3348' },
]

export const MOVABLE_OBSTACLES: WorldObstacle[] = [
  { id: 'cone-1', position: [5, 0.45, 2], size: [0.7, 0.9, 0.7], hard: false, movable: true, color: '#f2871b' },
  { id: 'cone-2', position: [-3, 0.45, 7], size: [0.7, 0.9, 0.7], hard: false, movable: true, color: '#f2871b' },
  { id: 'crate-1', position: [4, 0.6, -8], size: [1, 1.2, 1], hard: false, movable: true, color: '#c7904a' },
  { id: 'crate-2', position: [-13, 0.6, 12], size: [1, 1.2, 1], hard: false, movable: true, color: '#c7904a' },
  { id: 'crate-3', position: [14, 0.6, -13], size: [1, 1.2, 1], hard: false, movable: true, color: '#c7904a' },
]

export const INITIAL_PICKUPS: Pickup[] = [
  { id: 's-1', position: [0, 0.8, 0], type: 'star' },
  { id: 's-2', position: [10, 0.8, -6], type: 'star' },
  { id: 's-3', position: [-10, 0.8, 8], type: 'star' },
  { id: 's-4', position: [16, 0.8, 12], type: 'star' },
  { id: 's-5', position: [-18, 0.8, -14], type: 'star' },
  { id: 'r-1', position: [20, 0.8, -3], type: 'repair' },
  { id: 'r-2', position: [-20, 0.8, 4], type: 'repair' },
]

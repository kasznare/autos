export type WorldObstacle = {
  id: string
  position: [number, number, number]
  size: [number, number, number]
  hard: boolean
  movable?: boolean
  color: string
}

export type Pickup = {
  id: string
  position: [number, number, number]
  type: 'star' | 'repair'
}

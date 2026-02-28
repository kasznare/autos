export type CollisionMaterial = 'soft' | 'medium' | 'hard'

export type WorldObstacle = {
  id: string
  position: [number, number, number]
  size: [number, number, number]
  material: CollisionMaterial
  movable?: boolean
  color: string
}

export type Pickup = {
  id: string
  position: [number, number, number]
  type: 'star' | 'repair' | 'part'
}

export type DestructibleProp = {
  id: string
  position: [number, number, number]
  color: string
}

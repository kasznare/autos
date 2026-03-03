import { Sparkles } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, RapierRigidBody, RigidBody } from '@react-three/rapier'
import { useEffect, useMemo, useRef } from 'react'
import { Group } from 'three'
import { CarModel } from '../CarModel'
import { sampleTerrainHeight, type TrackMap } from '../maps'
import type { CarSnapshot } from '../multiplayer'
import { emitPhysicsEventV2, getMaterialResponseV2, normalizeCollisionMaterialV2 } from '../physics'
import { useRenderSettings } from '../render/useRenderSettings'
import { interpolateAngle, isPlayerOnTrafficPath, buildTrafficPath, getClosestProgressOnLoop, getLoopLength, sampleLoop, TRAFFIC_CAR_COUNT, type RuntimeCritter } from '../systems'
import { PHYSICS_API_VERSION_V2 } from '../types'
import type { DestructibleProp, Pickup, WorldObstacle } from '../types'

export type RuntimeDestructible = DestructibleProp & {
  phase: 'intact' | 'broken'
  respawnAt: number | null
  burstSeed: number
}

export type RemoteCarState = CarSnapshot & {
  updatedAtMs: number
  snapshots: Array<{ x: number; y: number; z: number; yaw: number; t: number }>
}

export const TrafficCars = ({
  map,
  lowPowerMode,
  restartToken,
  playerPositionRef,
}: {
  map: TrackMap
  lowPowerMode: boolean
  restartToken: number
  playerPositionRef: { current: [number, number, number] }
}) => {
  const render = useRenderSettings()
  const path = useMemo(() => buildTrafficPath(map), [map])
  const loopLength = useMemo(() => getLoopLength(path), [path])
  const carRefs = useRef<Array<RapierRigidBody | null>>([])
  const progressRefs = useRef<number[]>([])

  useEffect(() => {
    progressRefs.current = Array.from({ length: TRAFFIC_CAR_COUNT }, (_, idx) => idx / TRAFFIC_CAR_COUNT)
  }, [restartToken, map.id])

  useFrame((_, delta) => {
    const playerPos = playerPositionRef.current
    const playerLane = getClosestProgressOnLoop(path, playerPos[0], playerPos[2])
    const playerOnSameRoad = isPlayerOnTrafficPath(map, playerPos[0], playerPos[2], playerLane.distance)
    const stopGapMeters = 7.2
    const cautionGapMeters = 18

    for (let i = 0; i < TRAFFIC_CAR_COUNT; i += 1) {
      const body = carRefs.current[i]
      if (!body) continue
      const baseSpeedMps = 5.8 + (i % 3) * 0.8
      let speedScale = 1
      const carProgress = progressRefs.current[i] ?? i / TRAFFIC_CAR_COUNT
      if (playerOnSameRoad) {
        const gapFraction = ((playerLane.progress - carProgress) % 1 + 1) % 1
        const gapMeters = gapFraction * loopLength
        if (gapMeters < cautionGapMeters) {
          const t = Math.max(0, Math.min(1, (gapMeters - stopGapMeters) / Math.max(0.001, cautionGapMeters - stopGapMeters)))
          speedScale = t * t
        }
      }
      const speedMps = baseSpeedMps * speedScale
      const advance = (speedMps * delta) / loopLength
      progressRefs.current[i] = (carProgress + advance) % 1
      const sample = sampleLoop(path, progressRefs.current[i])
      const y = sampleTerrainHeight(map, sample.x, sample.z) + 0.62
      body.setNextKinematicTranslation({ x: sample.x, y, z: sample.z })
      body.setNextKinematicRotation({ x: 0, y: Math.sin(sample.yaw / 2), z: 0, w: Math.cos(sample.yaw / 2) })
    }
  })

  return (
    <group>
      {Array.from({ length: TRAFFIC_CAR_COUNT }).map((_, idx) => {
        const sample = sampleLoop(path, idx / TRAFFIC_CAR_COUNT)
        const y = sampleTerrainHeight(map, sample.x, sample.z) + 0.62
        const color = idx % 2 === 0 ? '#6ea9ff' : idx % 3 === 0 ? '#f2b34d' : '#92d38a'
        return (
          <RigidBody
            key={`traffic-${idx}-${restartToken}-${map.id}`}
            ref={(el) => {
              carRefs.current[idx] = el
            }}
            type="kinematicPosition"
            colliders={false}
            position={[sample.x, y, sample.z]}
            name={`medium-traffic-${idx}`}
          >
            <CarModel
              bodyColor={color}
              accentColor="#f1f5ff"
              damage={0}
              lowPowerMode={lowPowerMode}
              showTrail={false}
              renderMode={render.mode}
              wireframe={render.wireframe}
            />
            <CuboidCollider args={[0.48, 0.26, 0.9]} position={[0, 0.26, 0]} />
          </RigidBody>
        )
      })}
    </group>
  )
}

const chunkOffsets: [number, number, number][] = [
  [-0.22, 0.16, -0.22],
  [0.22, 0.16, -0.22],
  [-0.22, 0.16, 0.22],
  [0.22, 0.16, 0.22],
  [0, 0.38, 0],
]

export const BrokenDestructible = ({
  id,
  position,
  color,
  burstSeed,
}: {
  id: string
  position: [number, number, number]
  color: string
  burstSeed: number
}) => {
  const render = useRenderSettings()
  const chunkRefs = useRef<Array<RapierRigidBody | null>>([])

  useEffect(() => {
    chunkRefs.current.forEach((body, idx) => {
      if (!body) return
      const spread = 0.85 + ((burstSeed + idx) % 5) * 0.22
      const dirX = (idx % 2 === 0 ? -1 : 1) * spread
      const dirZ = idx < 2 ? -spread : spread
      body.applyImpulse({ x: dirX, y: 1.6 + idx * 0.2, z: dirZ }, true)
      body.applyTorqueImpulse({ x: spread * 0.4, y: spread * 0.6, z: -spread * 0.5 }, true)
    })
  }, [burstSeed])

  return (
    <group>
      {chunkOffsets.map((offset, idx) => (
        <RigidBody
          key={`${id}-chunk-${idx}-${burstSeed}`}
          ref={(el) => {
            chunkRefs.current[idx] = el
          }}
          colliders={false}
          position={[position[0] + offset[0], position[1] + offset[1], position[2] + offset[2]]}
          mass={0.12}
          linearDamping={1.3}
          angularDamping={1.2}
          name={`soft-${id}-chunk`}
        >
          <mesh castShadow receiveShadow>
            <boxGeometry args={[0.24, 0.24, 0.24]} />
            <meshStandardMaterial color={color} roughness={0.75} wireframe={render.wireframe} />
          </mesh>
          <CuboidCollider args={[0.12, 0.12, 0.12]} />
        </RigidBody>
      ))}
    </group>
  )
}

export const ForestCritter = ({
  critter,
  map,
  onBreak,
}: {
  critter: RuntimeCritter
  map: TrackMap
  onBreak: (id: string, position: [number, number, number]) => void
}) => {
  const render = useRenderSettings()
  const bodyRef = useRef<RapierRigidBody | null>(null)

  useFrame(({ clock }) => {
    if (critter.state !== 'alive') return
    const body = bodyRef.current
    if (!body) return
    const t = clock.elapsedTime
    const wobble = Math.sin(t * critter.speed + critter.phase)
    const sway = Math.cos(t * critter.speed * 0.8 + critter.phase + critter.headingOffset)
    const x = critter.home[0] + wobble * critter.radius
    const z = critter.home[1] + sway * critter.radius * 0.78
    const y = sampleTerrainHeight(map, x, z) + 0.38
    body.setNextKinematicTranslation({ x, y, z })
  })

  if (critter.state === 'broken') {
    return <BrokenDestructible id={critter.id} position={critter.position} color="#c07e43" burstSeed={critter.burstSeed} />
  }
  return (
    <RigidBody
      ref={bodyRef}
      type="kinematicPosition"
      colliders={false}
      position={critter.position}
      name={`medium-${critter.id}`}
      onCollisionEnter={(payload) => {
        const otherName = payload.other.rigidBodyObject?.name ?? ''
        if (!otherName.startsWith('player-car')) {
          return
        }
        const v = payload.other.rigidBody?.linvel?.()
        const speed = v ? Math.hypot(v.x, v.z) : 0
        const breakSpeedThreshold = Math.min(map.spawnRules.hazards.critters.breakSpeed, getMaterialResponseV2('wood').breakSpeedMps)
        if (speed >= breakSpeedThreshold) {
          emitPhysicsEventV2('impact', {
            apiVersion: PHYSICS_API_VERSION_V2,
            sourceId: critter.id,
            sourceMaterial: 'wood',
            zone: 'front',
            tier: speed > breakSpeedThreshold * 1.5 ? 'major' : 'moderate',
            energyJoules: speed * speed * 12,
            impulse: speed * 0.6,
            speedMps: speed,
          })
          const p = bodyRef.current?.translation?.()
          const hitPos: [number, number, number] = p
            ? [p.x, p.y, p.z]
            : [critter.position[0], critter.position[1], critter.position[2]]
          onBreak(critter.id, hitPos)
        }
      }}
    >
      <group>
        <mesh castShadow position={[0, 0.25, 0]}>
          <capsuleGeometry args={[0.23, 0.3, 4, 8]} />
          <meshStandardMaterial color="#b8864e" roughness={0.85} wireframe={render.wireframe} />
        </mesh>
        <mesh castShadow position={[0, 0.57, 0.2]}>
          <sphereGeometry args={[0.18, 8, 8]} />
          <meshStandardMaterial color="#d6b082" roughness={0.8} wireframe={render.wireframe} />
        </mesh>
        <mesh castShadow position={[-0.13, 0.58, 0.29]}>
          <sphereGeometry args={[0.06, 7, 7]} />
          <meshStandardMaterial color="#35281e" roughness={0.9} wireframe={render.wireframe} />
        </mesh>
        <mesh castShadow position={[0.13, 0.58, 0.29]}>
          <sphereGeometry args={[0.06, 7, 7]} />
          <meshStandardMaterial color="#35281e" roughness={0.9} wireframe={render.wireframe} />
        </mesh>
      </group>
      <CuboidCollider args={[0.23, 0.28, 0.28]} position={[0, 0.3, 0]} />
    </RigidBody>
  )
}

export const StaticObstacle = ({ obstacle }: { obstacle: WorldObstacle }) => {
  const render = useRenderSettings()
  const response = getMaterialResponseV2(normalizeCollisionMaterialV2(obstacle.material))
  return (
    <RigidBody
      type="fixed"
      colliders={false}
      friction={response.friction}
      restitution={response.restitution}
      name={`${obstacle.material}-${obstacle.id}`}
    >
      <mesh position={obstacle.position} castShadow receiveShadow>
        <boxGeometry args={obstacle.size} />
        <meshStandardMaterial color={obstacle.color} wireframe={render.wireframe} />
      </mesh>
      <CuboidCollider args={obstacle.size.map((v) => v / 2) as [number, number, number]} position={obstacle.position} />
    </RigidBody>
  )
}

export const MovableObstacle = ({ obstacle }: { obstacle: WorldObstacle }) => {
  const render = useRenderSettings()
  const response = getMaterialResponseV2(normalizeCollisionMaterialV2(obstacle.material))
  return (
    <RigidBody
      colliders={false}
      position={obstacle.position}
      mass={0.5}
      friction={response.friction}
      restitution={response.restitution}
      linearDamping={0.9}
      angularDamping={0.85}
      name={`${obstacle.material}-${obstacle.id}`}
    >
      <mesh castShadow receiveShadow>
        <boxGeometry args={obstacle.size} />
        <meshStandardMaterial color={obstacle.color} wireframe={render.wireframe} />
      </mesh>
      <CuboidCollider args={obstacle.size.map((v) => v / 2) as [number, number, number]} />
    </RigidBody>
  )
}

export const IntactDestructible = ({
  destructible,
  map,
  onBreak,
}: {
  destructible: DestructibleProp
  map: TrackMap
  onBreak: (id: string) => void
}) => {
  const render = useRenderSettings()
  return (
    <RigidBody
      colliders={false}
      position={destructible.position}
      mass={0.45}
      friction={0.75}
      restitution={0.08}
      linearDamping={0.9}
      angularDamping={0.85}
      name={`medium-${destructible.id}`}
      onCollisionEnter={(payload) => {
        const otherName = payload.other.rigidBodyObject?.name ?? ''
        if (!otherName.startsWith('player-car')) {
          return
        }
        const otherBody = payload.other.rigidBody
        const velocity = otherBody?.linvel?.()
        const planarSpeed = velocity ? Math.hypot(velocity.x, velocity.z) : 0
        const breakSpeedThreshold = Math.min(map.spawnRules.hazards.destructibles.breakSpeed, getMaterialResponseV2('wood').breakSpeedMps)
        if (planarSpeed >= breakSpeedThreshold) {
          emitPhysicsEventV2('impact', {
            apiVersion: PHYSICS_API_VERSION_V2,
            sourceId: destructible.id,
            sourceMaterial: 'wood',
            zone: 'front',
            tier: planarSpeed > breakSpeedThreshold * 1.5 ? 'major' : 'moderate',
            energyJoules: planarSpeed * planarSpeed * 16,
            impulse: planarSpeed * 0.7,
            speedMps: planarSpeed,
          })
          onBreak(destructible.id)
        }
      }}
    >
      <mesh castShadow receiveShadow>
        <boxGeometry args={[0.85, 0.85, 0.85]} />
        <meshStandardMaterial color={destructible.color} roughness={0.78} wireframe={render.wireframe} />
      </mesh>
      <CuboidCollider args={[0.425, 0.425, 0.425]} />
    </RigidBody>
  )
}

export const PickupItem = ({ pickup, lowPowerMode }: { pickup: Pickup; lowPowerMode: boolean }) => {
  const render = useRenderSettings()
  const sparkleDisabled = lowPowerMode || render.mode === 'flat-debug'
  if (pickup.type === 'star') {
    return (
      <group position={pickup.position}>
        {sparkleDisabled ? null : <Sparkles count={8} scale={1.1} size={4} speed={0.2} color="#fff7ac" />}
        <mesh castShadow>
          <icosahedronGeometry args={[0.5, 0]} />
          <meshStandardMaterial color="#ffd447" emissive="#b18212" emissiveIntensity={0.9} wireframe={render.wireframe} />
        </mesh>
      </group>
    )
  }

  if (pickup.type === 'part') {
    return (
      <group position={pickup.position}>
        {sparkleDisabled ? null : <Sparkles count={6} scale={1.2} size={4} speed={0.28} color="#b4d7ff" />}
        <mesh castShadow>
          <octahedronGeometry args={[0.52, 0]} />
          <meshStandardMaterial
            color="#98acc7"
            metalness={0.58}
            roughness={0.34}
            emissive="#2c3f5f"
            emissiveIntensity={0.38}
            wireframe={render.wireframe}
          />
        </mesh>
      </group>
    )
  }

  return (
    <group position={pickup.position}>
      {sparkleDisabled ? null : <Sparkles count={6} scale={1.1} size={4} speed={0.3} color="#9fffbf" />}
      <mesh castShadow>
        <boxGeometry args={[0.8, 0.8, 0.8]} />
        <meshStandardMaterial color="#58d47e" emissive="#1d5a32" emissiveIntensity={0.6} wireframe={render.wireframe} />
      </mesh>
    </group>
  )
}

export const RemoteCar = ({ car, lowPowerMode }: { car: RemoteCarState; lowPowerMode: boolean }) => {
  const render = useRenderSettings()
  const groupRef = useRef<Group>(null)
  const yawRef = useRef(car.yaw)
  useFrame(() => {
    const group = groupRef.current
    if (!group) {
      return
    }
    const snapshots = car.snapshots
    if (snapshots.length === 0) {
      return
    }

    const renderT = performance.now() - 120
    let prev = snapshots[0]
    let next = snapshots[snapshots.length - 1]
    for (let i = snapshots.length - 1; i >= 0; i -= 1) {
      if (snapshots[i].t <= renderT) {
        prev = snapshots[i]
        next = snapshots[Math.min(snapshots.length - 1, i + 1)]
        break
      }
    }
    const span = Math.max(1, next.t - prev.t)
    const alpha = Math.max(0, Math.min(1, (renderT - prev.t) / span))
    const tx = prev.x + (next.x - prev.x) * alpha
    const ty = prev.y + (next.y - prev.y) * alpha
    const tz = prev.z + (next.z - prev.z) * alpha
    const targetYaw = interpolateAngle(prev.yaw, next.yaw, alpha)
    const follow = 0.28
    group.position.x += (tx - group.position.x) * follow
    group.position.y += (ty - group.position.y) * follow
    group.position.z += (tz - group.position.z) * follow
    yawRef.current = interpolateAngle(yawRef.current, targetYaw, 0.3)
    group.rotation.y = yawRef.current
  })

  return (
    <group ref={groupRef} position={[car.x, car.y, car.z]} rotation={[0, car.yaw, 0]}>
      <CarModel
        bodyColor={car.color}
        accentColor="#d9e6ff"
        damage={0}
        lowPowerMode={lowPowerMode}
        showTrail={false}
        renderMode={render.mode}
        wireframe={render.wireframe}
      />
    </group>
  )
}

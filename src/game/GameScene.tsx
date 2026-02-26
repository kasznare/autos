import { ContactShadows, Environment, Sparkles } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, RapierRigidBody, RigidBody } from '@react-three/rapier'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CanvasTexture, RepeatWrapping } from 'three'
import { ROAD_INNER_HALF, ROAD_OUTER_HALF, TRACK_SIZE } from './config'
import { PlayerCar } from './PlayerCar'
import { useGameStore } from './store'
import type { DestructibleProp, Pickup, WorldObstacle } from './types'
import { DESTRUCTIBLE_COLORS, DESTRUCTIBLE_SPAWN_POINTS, INITIAL_DESTRUCTIBLES, INITIAL_PICKUPS, MOVABLE_OBSTACLES, STATIC_OBSTACLES } from './world'

const MIN_STARS = 5
const MIN_REPAIRS = 2
const SPAWN_CHECK_SECONDS = 1.2
const SPAWN_MARGIN = 4
const MIN_DISTANCE_FROM_PLAYER = 9
const MIN_DISTANCE_FROM_PICKUP = 3.2
const DESTRUCTIBLE_RESPAWN_SECONDS = 3.2
const DESTRUCTIBLE_BREAK_SPEED = 6.5
const Ground = () => {
  const groundTexture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 256
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return null
    }

    ctx.fillStyle = '#4ba95d'
    ctx.fillRect(0, 0, 256, 256)
    ctx.fillStyle = '#58b869'
    for (let y = 0; y < 256; y += 32) {
      for (let x = 0; x < 256; x += 32) {
        if ((x + y) % 64 === 0) {
          ctx.fillRect(x, y, 32, 32)
        }
      }
    }
    ctx.strokeStyle = 'rgba(33, 94, 46, 0.35)'
    ctx.lineWidth = 2
    for (let y = 0; y < 256; y += 16) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(256, y)
      ctx.stroke()
    }

    const texture = new CanvasTexture(canvas)
    texture.wrapS = RepeatWrapping
    texture.wrapT = RepeatWrapping
    texture.repeat.set(10, 10)
    return texture
  }, [])

  return (
    <RigidBody type="fixed" colliders={false}>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[TRACK_SIZE, TRACK_SIZE]} />
        <meshStandardMaterial color="#4cb35f" map={groundTexture} roughness={0.95} />
      </mesh>
      <CuboidCollider args={[TRACK_SIZE / 2, 0.2, TRACK_SIZE / 2]} position={[0, -0.2, 0]} />
    </RigidBody>
  )
}

const RoadLoop = () => {
  const roadTexture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = 1024
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return null
    }

    const toCanvas = (v: number) => ((v / TRACK_SIZE) + 0.5) * canvas.width

    const outerMin = toCanvas(-ROAD_OUTER_HALF)
    const outerMax = toCanvas(ROAD_OUTER_HALF)
    const innerMin = toCanvas(-ROAD_INNER_HALF)
    const innerMax = toCanvas(ROAD_INNER_HALF)
    const midHalf = (ROAD_OUTER_HALF + ROAD_INNER_HALF) / 2
    const midMin = toCanvas(-midHalf)
    const midMax = toCanvas(midHalf)

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    ctx.fillStyle = '#2f3338'
    ctx.fillRect(outerMin, outerMin, outerMax - outerMin, outerMax - outerMin)
    ctx.clearRect(innerMin, innerMin, innerMax - innerMin, innerMax - innerMin)

    ctx.strokeStyle = '#4f545d'
    ctx.lineWidth = 14
    ctx.strokeRect(outerMin + 4, outerMin + 4, outerMax - outerMin - 8, outerMax - outerMin - 8)

    ctx.strokeStyle = '#f7f7f0'
    ctx.lineWidth = 6
    ctx.setLineDash([24, 18])
    ctx.strokeRect(midMin, midMin, midMax - midMin, midMax - midMin)
    ctx.setLineDash([])

    const texture = new CanvasTexture(canvas)
    texture.wrapS = RepeatWrapping
    texture.wrapT = RepeatWrapping
    return texture
  }, [])

  return (
    <mesh receiveShadow position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[TRACK_SIZE, TRACK_SIZE]} />
      <meshStandardMaterial map={roadTexture} transparent roughness={0.92} metalness={0.12} />
    </mesh>
  )
}

const CurbStrip = ({ length = 1, position, rotation = [0, 0, 0] as [number, number, number] }: { length?: number; position: [number, number, number]; rotation?: [number, number, number] }) => (
  <group position={position} rotation={rotation}>
    <mesh receiveShadow castShadow>
      <boxGeometry args={[length, 0.26, 0.72]} />
      <meshStandardMaterial color="#f1efe7" roughness={0.75} />
    </mesh>
    <mesh position={[0, 0.1, 0]}>
      <boxGeometry args={[length, 0.05, 0.46]} />
      <meshStandardMaterial color="#d2463a" roughness={0.65} />
    </mesh>
  </group>
)

const Curbs = () => {
  const outerLength = ROAD_OUTER_HALF * 2
  const innerLength = ROAD_INNER_HALF * 2

  return (
    <group>
      <CurbStrip length={outerLength} position={[0, 0.13, ROAD_OUTER_HALF]} />
      <CurbStrip length={outerLength} position={[0, 0.13, -ROAD_OUTER_HALF]} />
      <CurbStrip length={outerLength} position={[ROAD_OUTER_HALF, 0.13, 0]} rotation={[0, Math.PI / 2, 0]} />
      <CurbStrip length={outerLength} position={[-ROAD_OUTER_HALF, 0.13, 0]} rotation={[0, Math.PI / 2, 0]} />

      <CurbStrip length={innerLength} position={[0, 0.13, ROAD_INNER_HALF]} />
      <CurbStrip length={innerLength} position={[0, 0.13, -ROAD_INNER_HALF]} />
      <CurbStrip length={innerLength} position={[ROAD_INNER_HALF, 0.13, 0]} rotation={[0, Math.PI / 2, 0]} />
      <CurbStrip length={innerLength} position={[-ROAD_INNER_HALF, 0.13, 0]} rotation={[0, Math.PI / 2, 0]} />
    </group>
  )
}

const CheckpointGate = ({
  position,
  rotation = [0, 0, 0] as [number, number, number],
}: {
  position: [number, number, number]
  rotation?: [number, number, number]
}) => (
  <group position={position} rotation={rotation}>
    <mesh castShadow position={[-2.8, 1.2, 0]}>
      <boxGeometry args={[0.38, 2.4, 0.38]} />
      <meshStandardMaterial color="#f4f2e8" roughness={0.55} />
    </mesh>
    <mesh castShadow position={[2.8, 1.2, 0]}>
      <boxGeometry args={[0.38, 2.4, 0.38]} />
      <meshStandardMaterial color="#f4f2e8" roughness={0.55} />
    </mesh>
    <mesh castShadow position={[0, 2.3, 0]}>
      <boxGeometry args={[5.95, 0.28, 0.45]} />
      <meshStandardMaterial color="#32b0ff" emissive="#0f5f95" emissiveIntensity={0.8} roughness={0.35} />
    </mesh>
    <mesh position={[0, 2.05, 0.24]}>
      <planeGeometry args={[4.8, 0.6]} />
      <meshStandardMaterial color="#fff1a6" emissive="#986f15" emissiveIntensity={0.8} />
    </mesh>
  </group>
)

const CheckpointGates = () => (
  <group>
    <CheckpointGate position={[0, 0, -17]} rotation={[0, Math.PI / 2, 0]} />
    <CheckpointGate position={[0, 0, 17]} rotation={[0, Math.PI / 2, 0]} />
    <CheckpointGate position={[-17, 0, 0]} />
    <CheckpointGate position={[17, 0, 0]} />
  </group>
)

const StaticObstacle = ({ obstacle }: { obstacle: WorldObstacle }) => (
  <RigidBody type="fixed" colliders={false} name={`${obstacle.material}-${obstacle.id}`}>
    <mesh position={obstacle.position} castShadow receiveShadow>
      <boxGeometry args={obstacle.size} />
      <meshStandardMaterial color={obstacle.color} />
    </mesh>
    <CuboidCollider args={obstacle.size.map((v) => v / 2) as [number, number, number]} position={obstacle.position} />
  </RigidBody>
)

const MovableObstacle = ({ obstacle }: { obstacle: WorldObstacle }) => (
  <RigidBody
    colliders={false}
    position={obstacle.position}
    mass={0.5}
    friction={0.8}
    restitution={0.1}
    linearDamping={0.9}
    angularDamping={0.85}
    name={`${obstacle.material}-${obstacle.id}`}
  >
    <mesh castShadow receiveShadow>
      <boxGeometry args={obstacle.size} />
      <meshStandardMaterial color={obstacle.color} />
    </mesh>
    <CuboidCollider args={obstacle.size.map((v) => v / 2) as [number, number, number]} />
  </RigidBody>
)

const chunkOffsets: [number, number, number][] = [
  [-0.22, 0.16, -0.22],
  [0.22, 0.16, -0.22],
  [-0.22, 0.16, 0.22],
  [0.22, 0.16, 0.22],
  [0, 0.38, 0],
]

const BrokenDestructible = ({
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
            <meshStandardMaterial color={color} roughness={0.75} />
          </mesh>
          <CuboidCollider args={[0.12, 0.12, 0.12]} />
        </RigidBody>
      ))}
    </group>
  )
}

const IntactDestructible = ({
  destructible,
  onBreak,
}: {
  destructible: DestructibleProp
  onBreak: (id: string) => void
}) => (
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
      if (planarSpeed >= DESTRUCTIBLE_BREAK_SPEED) {
        onBreak(destructible.id)
      }
    }}
  >
    <mesh castShadow receiveShadow>
      <boxGeometry args={[0.85, 0.85, 0.85]} />
      <meshStandardMaterial color={destructible.color} roughness={0.78} />
    </mesh>
    <CuboidCollider args={[0.425, 0.425, 0.425]} />
  </RigidBody>
)

const PickupItem = ({ pickup }: { pickup: Pickup }) => {
  if (pickup.type === 'star') {
    return (
      <group position={pickup.position}>
        <Sparkles count={8} scale={1.1} size={4} speed={0.2} color="#fff7ac" />
        <mesh castShadow>
          <icosahedronGeometry args={[0.5, 0]} />
          <meshStandardMaterial color="#ffd447" emissive="#b18212" emissiveIntensity={0.9} />
        </mesh>
      </group>
    )
  }

  return (
    <group position={pickup.position}>
      <Sparkles count={6} scale={1.1} size={4} speed={0.3} color="#9fffbf" />
      <mesh castShadow>
        <boxGeometry args={[0.8, 0.8, 0.8]} />
        <meshStandardMaterial color="#58d47e" emissive="#1d5a32" emissiveIntensity={0.6} />
      </mesh>
    </group>
  )
}

const OBSTACLES_FOR_SPAWN = [...STATIC_OBSTACLES, ...MOVABLE_OBSTACLES]

type RuntimeDestructible = DestructibleProp & {
  phase: 'intact' | 'broken'
  respawnAt: number | null
  burstSeed: number
}

const isSpawnBlocked = (x: number, z: number, playerPosition: [number, number, number], existingPickups: Pickup[]) => {
  const px = playerPosition[0]
  const pz = playerPosition[2]
  const playerDistance = Math.hypot(x - px, z - pz)
  if (playerDistance < MIN_DISTANCE_FROM_PLAYER) {
    return true
  }

  for (const pickup of existingPickups) {
    const dist = Math.hypot(x - pickup.position[0], z - pickup.position[2])
    if (dist < MIN_DISTANCE_FROM_PICKUP) {
      return true
    }
  }

  for (const obstacle of OBSTACLES_FOR_SPAWN) {
    const halfX = obstacle.size[0] / 2 + 1.2
    const halfZ = obstacle.size[2] / 2 + 1.2
    if (Math.abs(x - obstacle.position[0]) < halfX && Math.abs(z - obstacle.position[2]) < halfZ) {
      return true
    }
  }

  return false
}

const generateSpawnPosition = (existingPickups: Pickup[], playerPosition: [number, number, number]) => {
  const half = TRACK_SIZE / 2 - SPAWN_MARGIN
  for (let i = 0; i < 36; i += 1) {
    const x = (Math.random() * 2 - 1) * half
    const z = (Math.random() * 2 - 1) * half
    if (!isSpawnBlocked(x, z, playerPosition, existingPickups)) {
      return [x, 0.8, z] as [number, number, number]
    }
  }
  return null
}

const pickRespawnPoint = (usedIds: Set<string>) => {
  const available = DESTRUCTIBLE_SPAWN_POINTS.filter((_, idx) => !usedIds.has(`p-${idx}`))
  if (available.length === 0) {
    return null
  }
  const point = available[Math.floor(Math.random() * available.length)]
  return point
}

export const GameScene = () => {
  const damage = useGameStore((state) => state.damage)
  const status = useGameStore((state) => state.status)
  const restartToken = useGameStore((state) => state.restartToken)
  const [pickups, setPickups] = useState<Pickup[]>(() => [...INITIAL_PICKUPS])
  const [destructibles, setDestructibles] = useState<RuntimeDestructible[]>(() =>
    INITIAL_DESTRUCTIBLES.map((item, index) => ({
      ...item,
      phase: 'intact',
      respawnAt: null,
      burstSeed: index,
    })),
  )

  const playerPositionRef = useRef<[number, number, number]>([0, 0.38, 20])
  const spawnTimerRef = useRef(0)
  const spawnIdRef = useRef(0)
  const destructibleSeedRef = useRef(0)
  const seenRestartTokenRef = useRef(restartToken)

  const collectPickup = useCallback((pickupId: string) => {
    setPickups((state) => state.filter((pickup) => pickup.id !== pickupId))
  }, [])

  const updatePlayerPosition = useCallback((position: [number, number, number]) => {
    playerPositionRef.current = position
  }, [])

  const breakDestructible = useCallback((id: string) => {
    setDestructibles((state) =>
      state.map((item) =>
        item.id === id && item.phase === 'intact'
          ? {
              ...item,
              phase: 'broken',
              respawnAt: performance.now() / 1000 + DESTRUCTIBLE_RESPAWN_SECONDS,
              burstSeed: destructibleSeedRef.current++,
            }
          : item,
      ),
    )
  }, [])

  useFrame((_, delta) => {
    if (seenRestartTokenRef.current !== restartToken) {
      seenRestartTokenRef.current = restartToken
      spawnTimerRef.current = 0
      spawnIdRef.current = 0
      playerPositionRef.current = [0, 0.38, 20]
      setPickups([...INITIAL_PICKUPS])
      destructibleSeedRef.current = 0
      setDestructibles(
        INITIAL_DESTRUCTIBLES.map((item, index) => ({
          ...item,
          phase: 'intact',
          respawnAt: null,
          burstSeed: index,
        })),
      )
      return
    }

    if (status !== 'running') {
      return
    }

    spawnTimerRef.current += delta
    if (spawnTimerRef.current < SPAWN_CHECK_SECONDS) {
      return
    }
    spawnTimerRef.current = 0

    setPickups((current) => {
      const starCount = current.filter((pickup) => pickup.type === 'star').length
      const repairCount = current.filter((pickup) => pickup.type === 'repair').length

      const missingStars = Math.max(0, MIN_STARS - starCount)
      const missingRepairs = Math.max(0, MIN_REPAIRS - repairCount)

      if (missingStars === 0 && missingRepairs === 0) {
        return current
      }

      const next = [...current]
      const spawnTypes: Pickup['type'][] = []

      for (let i = 0; i < missingStars; i += 1) {
        spawnTypes.push('star')
      }
      for (let i = 0; i < missingRepairs; i += 1) {
        spawnTypes.push('repair')
      }

      if (damage > 65 && missingRepairs === 0 && Math.random() < 0.35) {
        spawnTypes.push('repair')
      }

      for (const type of spawnTypes) {
        const position = generateSpawnPosition(next, playerPositionRef.current)
        if (!position) {
          continue
        }

        const id = `${type}-spawn-${restartToken}-${spawnIdRef.current}`
        spawnIdRef.current += 1
        next.push({ id, position, type })
      }

      return next
    })

    const nowSec = performance.now() / 1000
    setDestructibles((state) => {
      let changed = false
      const usedPoints = new Set<string>()
      for (const item of state) {
        if (item.phase === 'intact') {
          const found = DESTRUCTIBLE_SPAWN_POINTS.findIndex(
            (point) => point[0] === item.position[0] && point[2] === item.position[2],
          )
          if (found >= 0) usedPoints.add(`p-${found}`)
        }
      }

      const updated = state.map((item) => {
        if (item.phase === 'broken' && item.respawnAt !== null && item.respawnAt <= nowSec) {
          changed = true
          const point = pickRespawnPoint(usedPoints) ?? item.position
          const pointIndex = DESTRUCTIBLE_SPAWN_POINTS.findIndex((p) => p[0] === point[0] && p[2] === point[2])
          if (pointIndex >= 0) usedPoints.add(`p-${pointIndex}`)
          const respawned: RuntimeDestructible = {
            ...item,
            phase: 'intact',
            respawnAt: null,
            position: [point[0], 0.7, point[2]] as [number, number, number],
            color: DESTRUCTIBLE_COLORS[(destructibleSeedRef.current + pointIndex + 1) % DESTRUCTIBLE_COLORS.length],
          }
          return respawned
        }
        return item
      })

      if (!changed) {
        return state
      }
      return updated
    })
  })

  return (
    <>
      <ambientLight intensity={0.42} />
      <directionalLight
        position={[12, 24, 10]}
        intensity={1.35}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.00018}
        shadow-camera-near={1}
        shadow-camera-far={80}
        shadow-camera-left={-36}
        shadow-camera-right={36}
        shadow-camera-top={36}
        shadow-camera-bottom={-36}
      />
      <Environment preset="sunset" />
      <ContactShadows position={[0, 0.03, 0]} opacity={0.35} scale={58} blur={2.2} far={42} resolution={1024} color="#2a4f3b" />
      <Ground />
      <RoadLoop />
      <Curbs />
      <CheckpointGates />
      {STATIC_OBSTACLES.map((obstacle) => (
        <StaticObstacle obstacle={obstacle} key={obstacle.id} />
      ))}
      {MOVABLE_OBSTACLES.map((obstacle) => (
        <MovableObstacle obstacle={obstacle} key={`${obstacle.id}-${restartToken}`} />
      ))}
      {destructibles.map((item) =>
        item.phase === 'intact' ? (
          <IntactDestructible key={`${item.id}-intact`} destructible={item} onBreak={breakDestructible} />
        ) : (
          <BrokenDestructible key={`${item.id}-broken-${item.burstSeed}`} id={item.id} position={item.position} color={item.color} burstSeed={item.burstSeed} />
        ),
      )}
      {pickups.map((pickup) => (
        <PickupItem pickup={pickup} key={pickup.id} />
      ))}
      <PlayerCar pickups={pickups} onCollectPickup={collectPickup} onPlayerPosition={updatePlayerPosition} />
    </>
  )
}

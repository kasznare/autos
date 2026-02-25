import { ContactShadows, Environment, Sparkles } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { useCallback, useMemo, useRef, useState } from 'react'
import { CanvasTexture, RepeatWrapping } from 'three'
import { TRACK_SIZE } from './config'
import { PlayerCar } from './PlayerCar'
import { useGameStore } from './store'
import type { Pickup, WorldObstacle } from './types'
import { INITIAL_PICKUPS, MOVABLE_OBSTACLES, STATIC_OBSTACLES } from './world'

const MIN_STARS = 5
const MIN_REPAIRS = 2
const SPAWN_CHECK_SECONDS = 1.2
const SPAWN_MARGIN = 4
const MIN_DISTANCE_FROM_PLAYER = 9
const MIN_DISTANCE_FROM_PICKUP = 3.2

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

const StaticObstacle = ({ obstacle }: { obstacle: WorldObstacle }) => (
  <RigidBody type="fixed" colliders={false} name={`${obstacle.hard ? 'hard' : 'soft'}-${obstacle.id}`}>
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
    name={`soft-${obstacle.id}`}
  >
    <mesh castShadow receiveShadow>
      <boxGeometry args={obstacle.size} />
      <meshStandardMaterial color={obstacle.color} />
    </mesh>
    <CuboidCollider args={obstacle.size.map((v) => v / 2) as [number, number, number]} />
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

export const GameScene = () => {
  const damage = useGameStore((state) => state.damage)
  const status = useGameStore((state) => state.status)
  const restartToken = useGameStore((state) => state.restartToken)
  const [pickups, setPickups] = useState<Pickup[]>(() => [...INITIAL_PICKUPS])

  const playerPositionRef = useRef<[number, number, number]>([0, 0.38, 20])
  const spawnTimerRef = useRef(0)
  const spawnIdRef = useRef(0)
  const seenRestartTokenRef = useRef(restartToken)

  const collectPickup = useCallback((pickupId: string) => {
    setPickups((state) => state.filter((pickup) => pickup.id !== pickupId))
  }, [])

  const updatePlayerPosition = useCallback((position: [number, number, number]) => {
    playerPositionRef.current = position
  }, [])

  useFrame((_, delta) => {
    if (seenRestartTokenRef.current !== restartToken) {
      seenRestartTokenRef.current = restartToken
      spawnTimerRef.current = 0
      spawnIdRef.current = 0
      playerPositionRef.current = [0, 0.38, 20]
      setPickups([...INITIAL_PICKUPS])
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
      {STATIC_OBSTACLES.map((obstacle) => (
        <StaticObstacle obstacle={obstacle} key={obstacle.id} />
      ))}
      {MOVABLE_OBSTACLES.map((obstacle) => (
        <MovableObstacle obstacle={obstacle} key={`${obstacle.id}-${restartToken}`} />
      ))}
      {pickups.map((pickup) => (
        <PickupItem pickup={pickup} key={pickup.id} />
      ))}
      <PlayerCar pickups={pickups} onCollectPickup={collectPickup} onPlayerPosition={updatePlayerPosition} />
    </>
  )
}

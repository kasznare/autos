import { ContactShadows, Environment, Sparkles } from '@react-three/drei'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { useCallback, useMemo, useState } from 'react'
import { CanvasTexture, RepeatWrapping } from 'three'
import { TRACK_SIZE } from './config'
import { PlayerCar } from './PlayerCar'
import { useGameStore } from './store'
import type { Pickup, WorldObstacle } from './types'
import { INITIAL_PICKUPS, MOVABLE_OBSTACLES, STATIC_OBSTACLES } from './world'

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

const PickupItem = ({ pickup, active }: { pickup: Pickup; active: boolean }) => {
  if (!active) {
    return null
  }

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

export const GameScene = () => {
  const restartToken = useGameStore((state) => state.restartToken)
  const [activePickups, setActivePickups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(INITIAL_PICKUPS.map((pickup) => [pickup.id, true])),
  )

  const pickupMap = useMemo(() => new Map(INITIAL_PICKUPS.map((pickup) => [pickup.id, pickup])), [])

  const collectPickup = useCallback((pickupId: string) => {
    setActivePickups((state) => {
      if (!state[pickupId]) {
        return state
      }
      return { ...state, [pickupId]: false }
    })
  }, [])

  const resetPickups = useCallback(() => {
    setActivePickups(Object.fromEntries(INITIAL_PICKUPS.map((pickup) => [pickup.id, true])))
  }, [])

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
      {INITIAL_PICKUPS.map((pickup) => (
        <PickupItem pickup={pickup} key={pickup.id} active={activePickups[pickup.id]} />
      ))}
      <PlayerCar activePickups={activePickups} pickupMap={pickupMap} onCollectPickup={collectPickup} onResetPickups={resetPickups} />
    </>
  )
}

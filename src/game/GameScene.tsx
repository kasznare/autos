import { ContactShadows, Environment, Sparkles } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, RapierRigidBody, RigidBody, TrimeshCollider } from '@react-three/rapier'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CanvasTexture, Group, PlaneGeometry, RepeatWrapping } from 'three'
import { CarModel } from './CarModel'
import { TRACK_SIZE } from './config'
import { createInitialDestructibles, getTrackMap, isPointOnRoad, sampleTerrainHeight, type TrackMap } from './maps'
import { createRoomChannel, isMultiplayerConfigured, makeClientId, type CarSnapshot, type RoomChannelHandle } from './multiplayer'
import { PlayerCar } from './PlayerCar'
import { emitPhysicsEventV2, getMaterialResponseV2, normalizeCollisionMaterialV2 } from './physics'
import { useGameStore } from './store'
import { PHYSICS_API_VERSION_V2 } from './types'
import type { DestructibleProp, Pickup, WorldObstacle } from './types'

const TRAFFIC_CAR_COUNT = 4
const SPAWN_CHECK_SECONDS = 1.2
const SPAWN_MARGIN = 4
const MIN_DISTANCE_FROM_PLAYER = 9
const MIN_DISTANCE_FROM_PICKUP = 3.2
const TERRAIN_MESH_SEGMENTS = 280
const pseudoNoise = (index: number, salt: number) => {
  const x = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453
  return x - Math.floor(x)
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

const buildTrafficPath = (map: TrackMap): [number, number][] => {
  if (map.shape === 'path' && map.roadPath.length >= 3) {
    return map.roadPath
  }
  const mid = (map.outerHalf + map.innerHalf) * 0.5
  return [
    [-mid, -mid],
    [mid, -mid],
    [mid, mid],
    [-mid, mid],
  ]
}

const getLoopLength = (points: [number, number][]) => {
  if (points.length < 2) return 1
  let length = 0
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    length += Math.hypot(b[0] - a[0], b[1] - a[1])
  }
  return Math.max(1, length)
}

const sampleLoop = (points: [number, number][], tRaw: number) => {
  if (points.length < 2) {
    return { x: 0, z: 0, yaw: 0 }
  }
  const t = ((tRaw % 1) + 1) % 1
  const total = getLoopLength(points)
  let target = t * total
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    const segLen = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (target <= segLen) {
      const alpha = clamp01(target / Math.max(0.0001, segLen))
      const x = a[0] + (b[0] - a[0]) * alpha
      const z = a[1] + (b[1] - a[1]) * alpha
      const yaw = Math.atan2(b[0] - a[0], b[1] - a[1])
      return { x, z, yaw }
    }
    target -= segLen
  }
  const a = points[points.length - 1]
  const b = points[0]
  return { x: a[0], z: a[1], yaw: Math.atan2(b[0] - a[0], b[1] - a[1]) }
}

const getClosestProgressOnLoop = (points: [number, number][], x: number, z: number) => {
  if (points.length < 2) {
    return { progress: 0, distance: Infinity }
  }
  const total = getLoopLength(points)
  let walked = 0
  let bestDistance = Infinity
  let bestProgress = 0
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    const abx = b[0] - a[0]
    const abz = b[1] - a[1]
    const apx = x - a[0]
    const apz = z - a[1]
    const segLenSq = abx * abx + abz * abz
    const segLen = Math.sqrt(segLenSq)
    if (segLen <= 0.0001) {
      continue
    }
    const t = clamp01((apx * abx + apz * abz) / segLenSq)
    const cx = a[0] + abx * t
    const cz = a[1] + abz * t
    const dist = Math.hypot(x - cx, z - cz)
    if (dist < bestDistance) {
      bestDistance = dist
      bestProgress = (walked + segLen * t) / total
    }
    walked += segLen
  }
  return { progress: ((bestProgress % 1) + 1) % 1, distance: bestDistance }
}

const Ground = ({ worldHalf = TRACK_SIZE / 2 }: { worldHalf?: number }) => {
  const groundTexture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 256
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return null
    }

    ctx.fillStyle = '#4aab5e'
    ctx.fillRect(0, 0, 256, 256)
    ctx.fillStyle = '#5cbe6d'
    for (let y = 0; y < 256; y += 32) {
      for (let x = 0; x < 256; x += 32) {
        if ((x + y) % 64 === 0) {
          ctx.fillRect(x, y, 32, 32)
        }
      }
    }
    for (let i = 0; i < 520; i += 1) {
      const x = pseudoNoise(i, 1) * 256
      const y = pseudoNoise(i, 2) * 256
      const len = 2 + pseudoNoise(i, 3) * 4
      ctx.strokeStyle = pseudoNoise(i, 4) > 0.5 ? 'rgba(38, 110, 52, 0.22)' : 'rgba(126, 191, 106, 0.2)'
      ctx.lineWidth = 0.8 + pseudoNoise(i, 5) * 0.8
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + len * 0.4, y - len)
      ctx.stroke()
    }
    for (let i = 0; i < 320; i += 1) {
      const x = pseudoNoise(i, 21) * 256
      const y = pseudoNoise(i, 22) * 256
      const r = 0.8 + pseudoNoise(i, 23) * 2.2
      ctx.fillStyle = pseudoNoise(i, 24) > 0.5 ? 'rgba(39, 98, 45, 0.15)' : 'rgba(148, 203, 118, 0.12)'
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
    }

    const texture = new CanvasTexture(canvas)
    texture.wrapS = RepeatWrapping
    texture.wrapT = RepeatWrapping
    texture.repeat.set(Math.max(10, worldHalf / 3), Math.max(10, worldHalf / 3))
    return texture
  }, [worldHalf])

  return (
    <RigidBody type="fixed" colliders={false} name="terrain-ground-ring">
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[worldHalf * 2, worldHalf * 2]} />
        <meshStandardMaterial color="#4cb35f" map={groundTexture} roughness={0.95} />
      </mesh>
      <CuboidCollider args={[worldHalf, 0.2, worldHalf]} position={[0, -0.2, 0]} />
    </RigidBody>
  )
}

const RoadLoop = ({ outerHalf, innerHalf }: { outerHalf: number; innerHalf: number }) => {
  const roadTexture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = 1024
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return null
    }

    const toCanvas = (v: number) => ((v / TRACK_SIZE) + 0.5) * canvas.width

    const outerMin = toCanvas(-outerHalf)
    const outerMax = toCanvas(outerHalf)
    const innerMin = toCanvas(-innerHalf)
    const innerMax = toCanvas(innerHalf)
    const midHalf = (outerHalf + innerHalf) / 2
    const midMin = toCanvas(-midHalf)
    const midMax = toCanvas(midHalf)

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    ctx.fillStyle = '#2f3338'
    ctx.fillRect(outerMin, outerMin, outerMax - outerMin, outerMax - outerMin)
    ctx.clearRect(innerMin, innerMin, innerMax - innerMin, innerMax - innerMin)

    ctx.strokeStyle = 'rgba(183, 151, 98, 0.55)'
    ctx.lineWidth = 18
    ctx.strokeRect(outerMin + 4, outerMin + 4, outerMax - outerMin - 8, outerMax - outerMin - 8)
    ctx.strokeStyle = '#4f545d'
    ctx.lineWidth = 10
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
  }, [outerHalf, innerHalf])

  return (
    <mesh receiveShadow position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[TRACK_SIZE, TRACK_SIZE]} />
      <meshStandardMaterial map={roadTexture} transparent roughness={0.92} metalness={0.12} />
    </mesh>
  )
}

const RoadPath = ({ map }: { map: TrackMap }) => {
  const roadTexture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = 1024
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return null
    }
    const worldSize = map.worldHalf * 2
    const toCanvas = (v: number) => ((v / worldSize) + 0.5) * canvas.width
    const lineWidth = (map.roadWidth / worldSize) * canvas.width

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.strokeStyle = 'rgba(176, 148, 100, 0.5)'
    ctx.lineWidth = lineWidth + Math.max(6, lineWidth * 0.25)
    ctx.beginPath()
    map.roadPath.forEach((point, idx) => {
      const x = toCanvas(point[0])
      const y = toCanvas(point[1])
      if (idx === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    if (map.roadPath.length > 0) {
      ctx.lineTo(toCanvas(map.roadPath[0][0]), toCanvas(map.roadPath[0][1]))
    }
    ctx.stroke()

    ctx.strokeStyle = '#2f3338'
    ctx.lineWidth = lineWidth
    ctx.beginPath()
    map.roadPath.forEach((point, idx) => {
      const x = toCanvas(point[0])
      const y = toCanvas(point[1])
      if (idx === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    if (map.roadPath.length > 0) {
      ctx.lineTo(toCanvas(map.roadPath[0][0]), toCanvas(map.roadPath[0][1]))
    }
    ctx.stroke()

    ctx.strokeStyle = '#4f545d'
    ctx.lineWidth = Math.max(8, lineWidth * 0.18)
    ctx.stroke()

    ctx.strokeStyle = '#f7f7f0'
    ctx.setLineDash([26, 18])
    ctx.lineWidth = Math.max(4, lineWidth * 0.14)
    ctx.stroke()
    ctx.setLineDash([])

    const texture = new CanvasTexture(canvas)
    texture.wrapS = RepeatWrapping
    texture.wrapT = RepeatWrapping
    return texture
  }, [map.roadPath, map.roadWidth, map.worldHalf])

  const roadGeometry = useMemo(() => {
    const size = map.worldHalf * 2
    const segments = TERRAIN_MESH_SEGMENTS
    const geometry = new PlaneGeometry(size, size, segments, segments)
    geometry.rotateX(-Math.PI / 2)
    const pos = geometry.attributes.position
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i)
      const z = pos.getZ(i)
      pos.setY(i, sampleTerrainHeight(map, x, z) + 0.03)
    }
    pos.needsUpdate = true
    geometry.computeVertexNormals()
    return geometry
  }, [map])

  return (
    <mesh receiveShadow geometry={roadGeometry}>
      <meshStandardMaterial map={roadTexture} transparent roughness={0.92} metalness={0.12} />
    </mesh>
  )
}

const ProceduralGround = ({ map }: { map: TrackMap }) => {
  const terrainTexture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = 1024
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return null
    }
    const worldSize = map.worldHalf * 2
    const toCanvas = (v: number) => ((v / worldSize) + 0.5) * canvas.width
    const drawClosedPath = () => {
      map.roadPath.forEach((point, idx) => {
        const x = toCanvas(point[0])
        const y = toCanvas(point[1])
        if (idx === 0) {
          ctx.moveTo(x, y)
          return
        }
        ctx.lineTo(x, y)
      })
      if (map.roadPath.length > 0) {
        ctx.lineTo(toCanvas(map.roadPath[0][0]), toCanvas(map.roadPath[0][1]))
      }
    }

    ctx.fillStyle = '#4a9f57'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    const baseGradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
    baseGradient.addColorStop(0, 'rgba(89, 164, 98, 0.42)')
    baseGradient.addColorStop(0.5, 'rgba(70, 140, 78, 0.22)')
    baseGradient.addColorStop(1, 'rgba(101, 180, 112, 0.38)')
    ctx.fillStyle = baseGradient
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    ctx.fillStyle = 'rgba(115, 186, 111, 0.14)'
    for (let y = 0; y < canvas.height; y += 56) {
      for (let x = 0; x < canvas.width; x += 56) {
        if (((x + y) / 56) % 2 === 0) {
          ctx.fillRect(x, y, 56, 56)
        }
      }
    }

    for (let i = 0; i < 2000; i += 1) {
      const x = pseudoNoise(i, 101) * canvas.width
      const y = pseudoNoise(i, 102) * canvas.height
      const r = 8 + pseudoNoise(i, 103) * 24
      ctx.fillStyle = pseudoNoise(i, 104) > 0.5 ? 'rgba(49, 117, 56, 0.07)' : 'rgba(130, 197, 118, 0.06)'
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
    }

    for (let i = 0; i < 5200; i += 1) {
      const x = pseudoNoise(i, 11) * canvas.width
      const y = pseudoNoise(i, 12) * canvas.height
      const len = 3 + pseudoNoise(i, 13) * 7
      ctx.strokeStyle = pseudoNoise(i, 14) > 0.5 ? 'rgba(40, 108, 49, 0.2)' : 'rgba(137, 200, 114, 0.17)'
      ctx.lineWidth = 0.7 + pseudoNoise(i, 15) * 1.1
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + len * 0.35, y - len)
      ctx.stroke()
    }
    for (let i = 0; i < 2600; i += 1) {
      const x = pseudoNoise(i, 31) * canvas.width
      const y = pseudoNoise(i, 32) * canvas.height
      const r = 1 + pseudoNoise(i, 33) * 4
      ctx.fillStyle = pseudoNoise(i, 34) > 0.52 ? 'rgba(37, 96, 43, 0.14)' : 'rgba(141, 197, 113, 0.12)'
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
    }
    for (let i = 0; i < 1200; i += 1) {
      const x = pseudoNoise(i, 121) * canvas.width
      const y = pseudoNoise(i, 122) * canvas.height
      const r = 0.6 + pseudoNoise(i, 123) * 1.8
      ctx.fillStyle = pseudoNoise(i, 124) > 0.5 ? 'rgba(176, 168, 143, 0.1)' : 'rgba(94, 89, 74, 0.08)'
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
    }

    const shoulderWidth = ((map.roadWidth * 1.8) / worldSize) * canvas.width
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.strokeStyle = 'rgba(139, 120, 84, 0.24)'
    ctx.lineWidth = shoulderWidth
    ctx.beginPath()
    drawClosedPath()
    ctx.stroke()

    ctx.strokeStyle = 'rgba(108, 141, 87, 0.26)'
    ctx.lineWidth = shoulderWidth * 0.6
    ctx.beginPath()
    drawClosedPath()
    ctx.stroke()

    const texture = new CanvasTexture(canvas)
    texture.wrapS = RepeatWrapping
    texture.wrapT = RepeatWrapping
    return texture
  }, [map.roadPath, map.roadWidth, map.worldHalf])

  const terrainGeometry = useMemo(() => {
    const size = map.worldHalf * 2
    const segments = TERRAIN_MESH_SEGMENTS
    const geometry = new PlaneGeometry(size, size, segments, segments)
    geometry.rotateX(-Math.PI / 2)
    const pos = geometry.attributes.position
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i)
      const z = pos.getZ(i)
      pos.setY(i, sampleTerrainHeight(map, x, z))
    }
    pos.needsUpdate = true
    geometry.computeVertexNormals()
    return geometry
  }, [map])

  const terrainColliderArgs = useMemo(() => {
    const posAttr = terrainGeometry.getAttribute('position')
    const indexAttr = terrainGeometry.getIndex()
    if (!indexAttr) {
      return null
    }
    const vertices = Array.from(posAttr.array as Iterable<number>)
    const indices = Array.from(indexAttr.array as Iterable<number>)
    return [vertices, indices] as [number[], number[]]
  }, [terrainGeometry])

  return (
    <RigidBody type="fixed" colliders={false} name="terrain-ground-procedural">
      <mesh receiveShadow geometry={terrainGeometry}>
        <meshStandardMaterial map={terrainTexture} roughness={0.9} metalness={0.04} />
      </mesh>
      {terrainColliderArgs ? <TrimeshCollider args={terrainColliderArgs} /> : null}
    </RigidBody>
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

const Curbs = ({ outerHalf, innerHalf }: { outerHalf: number; innerHalf: number }) => {
  const outerLength = outerHalf * 2
  const innerLength = innerHalf * 2

  return (
    <group>
      <CurbStrip length={outerLength} position={[0, 0.13, outerHalf]} />
      <CurbStrip length={outerLength} position={[0, 0.13, -outerHalf]} />
      <CurbStrip length={outerLength} position={[outerHalf, 0.13, 0]} rotation={[0, Math.PI / 2, 0]} />
      <CurbStrip length={outerLength} position={[-outerHalf, 0.13, 0]} rotation={[0, Math.PI / 2, 0]} />

      <CurbStrip length={innerLength} position={[0, 0.13, innerHalf]} />
      <CurbStrip length={innerLength} position={[0, 0.13, -innerHalf]} />
      <CurbStrip length={innerLength} position={[innerHalf, 0.13, 0]} rotation={[0, Math.PI / 2, 0]} />
      <CurbStrip length={innerLength} position={[-innerHalf, 0.13, 0]} rotation={[0, Math.PI / 2, 0]} />
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

const CheckpointGates = ({ gates }: { gates: { position: [number, number, number]; rotation?: [number, number, number] }[] }) => (
  <group>
    {gates.map((gate, idx) => (
      <CheckpointGate key={`gate-${idx}`} position={gate.position} rotation={gate.rotation} />
    ))}
  </group>
)

const Trees = ({
  trees,
  map,
}: {
  trees: { id: string; position: [number, number, number]; scale: number; variant: 'round' | 'cone' }[]
  map: TrackMap
}) => (
  <group>
    {trees.map((tree) => (
      <RigidBody
        key={tree.id}
        type="fixed"
        colliders={false}
        name={`hard-tree-${tree.id}`}
        position={[tree.position[0], sampleTerrainHeight(map, tree.position[0], tree.position[2]), tree.position[2]]}
      >
        <group scale={tree.scale}>
          <mesh castShadow position={[0, 0.7, 0]}>
            <cylinderGeometry args={[0.12, 0.17, 1.4, 8]} />
            <meshStandardMaterial color="#6f4a25" roughness={0.9} />
          </mesh>
          {tree.variant === 'round' ? (
            <mesh castShadow position={[0, 1.75, 0]}>
              <sphereGeometry args={[0.7, 12, 12]} />
              <meshStandardMaterial color="#3d8f49" roughness={0.85} />
            </mesh>
          ) : (
            <mesh castShadow position={[0, 1.8, 0]}>
              <coneGeometry args={[0.74, 1.35, 12]} />
              <meshStandardMaterial color="#3f944d" roughness={0.85} />
            </mesh>
          )}
        </group>
        <CuboidCollider args={[0.12 * tree.scale, 0.7 * tree.scale, 0.12 * tree.scale]} position={[0, 0.7 * tree.scale, 0]} />
      </RigidBody>
    ))}
  </group>
)

const RoadsideDetails = ({ map, seed }: { map: TrackMap; seed: number }) => {
  const details = useMemo(() => {
    const out: Array<{ id: string; type: 'rock' | 'bush'; position: [number, number, number]; scale: number }> = []
    const maxItems = map.shape === 'path' ? 180 : 70
    const half = map.worldHalf - 4
    for (let i = 0; i < 900 && out.length < maxItems; i += 1) {
      const nx = pseudoNoise(seed + i, 201) * 2 - 1
      const nz = pseudoNoise(seed + i, 202) * 2 - 1
      const x = nx * half
      const z = nz * half
      if (isPointOnRoad(map, x, z)) {
        continue
      }
      const type = pseudoNoise(seed + i, 203) > 0.62 ? 'rock' : 'bush'
      const scale = type === 'rock' ? 0.45 + pseudoNoise(seed + i, 204) * 0.95 : 0.4 + pseudoNoise(seed + i, 205) * 1.05
      const y = sampleTerrainHeight(map, x, z)
      out.push({
        id: `detail-${seed}-${out.length}`,
        type,
        position: [x, y + 0.05, z],
        scale,
      })
    }
    return out
  }, [map, seed])

  return (
    <group>
      {details.map((item) =>
        item.type === 'rock' ? (
          <mesh key={item.id} position={item.position} scale={item.scale} castShadow receiveShadow>
            <dodecahedronGeometry args={[0.35, 0]} />
            <meshStandardMaterial color="#7c8374" roughness={0.93} />
          </mesh>
        ) : (
          <mesh key={item.id} position={item.position} scale={item.scale} castShadow>
            <sphereGeometry args={[0.42, 8, 7]} />
            <meshStandardMaterial color="#4d9f58" roughness={0.88} />
          </mesh>
        ),
      )}
    </group>
  )
}

const TrafficCars = ({
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
    const playerOnSameRoad = isPointOnRoad(map, playerPos[0], playerPos[2]) && playerLane.distance <= map.roadWidth * 0.6
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
          const t = clamp01((gapMeters - stopGapMeters) / Math.max(0.001, cautionGapMeters - stopGapMeters))
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
            <CarModel bodyColor={color} accentColor="#f1f5ff" damage={0} lowPowerMode={lowPowerMode} showTrail={false} />
            <CuboidCollider args={[0.48, 0.26, 0.9]} position={[0, 0.26, 0]} />
          </RigidBody>
        )
      })}
    </group>
  )
}

type RuntimeCritter = {
  id: string
  home: [number, number]
  speed: number
  radius: number
  phase: number
  headingOffset: number
  state: 'alive' | 'broken'
  position: [number, number, number]
  respawnAt: number | null
  burstSeed: number
}

const createCritters = (map: TrackMap, seed: number): RuntimeCritter[] => {
  const result: RuntimeCritter[] = []
  const critterCount = map.spawnRules.hazards.critters.count
  const half = map.worldHalf - 7
  for (let i = 0; i < 1200 && result.length < critterCount; i += 1) {
    const x = (pseudoNoise(seed + i, 301) * 2 - 1) * half
    const z = (pseudoNoise(seed + i, 302) * 2 - 1) * half
    if (isPointOnRoad(map, x, z)) {
      continue
    }
    const y = sampleTerrainHeight(map, x, z) + 0.38
    result.push({
      id: `critter-${seed}-${result.length}`,
      home: [x, z],
      speed: 0.7 + pseudoNoise(seed + i, 303) * 0.8,
      radius: 1 + pseudoNoise(seed + i, 304) * 2.6,
      phase: pseudoNoise(seed + i, 305) * Math.PI * 2,
      headingOffset: pseudoNoise(seed + i, 306) * 1.6,
      state: 'alive',
      position: [x, y, z],
      respawnAt: null,
      burstSeed: i,
    })
  }
  return result
}

const ForestCritter = ({
  critter,
  map,
  onBreak,
}: {
  critter: RuntimeCritter
  map: TrackMap
  onBreak: (id: string, position: [number, number, number]) => void
}) => {
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
          <meshStandardMaterial color="#b8864e" roughness={0.85} />
        </mesh>
        <mesh castShadow position={[0, 0.57, 0.2]}>
          <sphereGeometry args={[0.18, 8, 8]} />
          <meshStandardMaterial color="#d6b082" roughness={0.8} />
        </mesh>
        <mesh castShadow position={[-0.13, 0.58, 0.29]}>
          <sphereGeometry args={[0.06, 7, 7]} />
          <meshStandardMaterial color="#35281e" roughness={0.9} />
        </mesh>
        <mesh castShadow position={[0.13, 0.58, 0.29]}>
          <sphereGeometry args={[0.06, 7, 7]} />
          <meshStandardMaterial color="#35281e" roughness={0.9} />
        </mesh>
      </group>
      <CuboidCollider args={[0.23, 0.28, 0.28]} position={[0, 0.3, 0]} />
    </RigidBody>
  )
}

const StaticObstacle = ({ obstacle }: { obstacle: WorldObstacle }) => {
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
        <meshStandardMaterial color={obstacle.color} />
      </mesh>
      <CuboidCollider args={obstacle.size.map((v) => v / 2) as [number, number, number]} position={obstacle.position} />
    </RigidBody>
  )
}

const MovableObstacle = ({ obstacle }: { obstacle: WorldObstacle }) => {
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
        <meshStandardMaterial color={obstacle.color} />
      </mesh>
      <CuboidCollider args={obstacle.size.map((v) => v / 2) as [number, number, number]} />
    </RigidBody>
  )
}

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
  map,
  onBreak,
}: {
  destructible: DestructibleProp
  map: TrackMap
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
      <meshStandardMaterial color={destructible.color} roughness={0.78} />
    </mesh>
    <CuboidCollider args={[0.425, 0.425, 0.425]} />
  </RigidBody>
)

const PickupItem = ({ pickup, lowPowerMode }: { pickup: Pickup; lowPowerMode: boolean }) => {
  if (pickup.type === 'star') {
    return (
      <group position={pickup.position}>
        {lowPowerMode ? null : <Sparkles count={8} scale={1.1} size={4} speed={0.2} color="#fff7ac" />}
        <mesh castShadow>
          <icosahedronGeometry args={[0.5, 0]} />
          <meshStandardMaterial color="#ffd447" emissive="#b18212" emissiveIntensity={0.9} />
        </mesh>
      </group>
    )
  }

  if (pickup.type === 'part') {
    return (
      <group position={pickup.position}>
        {lowPowerMode ? null : <Sparkles count={6} scale={1.2} size={4} speed={0.28} color="#b4d7ff" />}
        <mesh castShadow>
          <octahedronGeometry args={[0.52, 0]} />
          <meshStandardMaterial color="#98acc7" metalness={0.58} roughness={0.34} emissive="#2c3f5f" emissiveIntensity={0.38} />
        </mesh>
      </group>
    )
  }

  return (
    <group position={pickup.position}>
      {lowPowerMode ? null : <Sparkles count={6} scale={1.1} size={4} speed={0.3} color="#9fffbf" />}
      <mesh castShadow>
        <boxGeometry args={[0.8, 0.8, 0.8]} />
        <meshStandardMaterial color="#58d47e" emissive="#1d5a32" emissiveIntensity={0.6} />
      </mesh>
    </group>
  )
}

type RuntimeDestructible = DestructibleProp & {
  phase: 'intact' | 'broken'
  respawnAt: number | null
  burstSeed: number
}

type RemoteCarState = CarSnapshot & {
  updatedAtMs: number
  snapshots: Array<{ x: number; y: number; z: number; yaw: number; t: number }>
}

const isSpawnBlocked = (
  x: number,
  z: number,
  playerPosition: [number, number, number],
  existingPickups: Pickup[],
  obstaclesForSpawn: WorldObstacle[],
) => {
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

  for (const obstacle of obstaclesForSpawn) {
    const halfX = obstacle.size[0] / 2 + 1.2
    const halfZ = obstacle.size[2] / 2 + 1.2
    if (Math.abs(x - obstacle.position[0]) < halfX && Math.abs(z - obstacle.position[2]) < halfZ) {
      return true
    }
  }

  return false
}

const generateSpawnPosition = (
  existingPickups: Pickup[],
  playerPosition: [number, number, number],
  worldHalf: number,
  obstaclesForSpawn: WorldObstacle[],
) => {
  const half = worldHalf - SPAWN_MARGIN
  for (let i = 0; i < 36; i += 1) {
    const x = (Math.random() * 2 - 1) * half
    const z = (Math.random() * 2 - 1) * half
    if (!isSpawnBlocked(x, z, playerPosition, existingPickups, obstaclesForSpawn)) {
      return [x, 0.8, z] as [number, number, number]
    }
  }
  return null
}

const interpolateAngle = (a: number, b: number, t: number) => {
  let delta = (b - a) % (Math.PI * 2)
  if (delta > Math.PI) delta -= Math.PI * 2
  if (delta < -Math.PI) delta += Math.PI * 2
  return a + delta * t
}

const RemoteCar = ({ car, lowPowerMode }: { car: RemoteCarState; lowPowerMode: boolean }) => {
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
      <CarModel bodyColor={car.color} accentColor="#d9e6ff" damage={0} lowPowerMode={lowPowerMode} showTrail={false} />
    </group>
  )
}

const pickRespawnPoint = (map: TrackMap, usedIds: Set<string>) => {
  const available = map.spawnRules.hazards.destructibles.spawnPoints.filter((_, idx) => !usedIds.has(`p-${idx}`))
  if (available.length === 0) {
    return null
  }
  const point = available[Math.floor(Math.random() * available.length)]
  return point
}

export const GameScene = ({
  lowPowerMode = false,
  roomId = null,
  isRoomHost = false,
}: {
  lowPowerMode?: boolean
  roomId?: string | null
  isRoomHost?: boolean
}) => {
  const damage = useGameStore((state) => state.damage)
  const speedKph = useGameStore((state) => state.speedKph)
  const status = useGameStore((state) => state.status)
  const restartToken = useGameStore((state) => state.restartToken)
  const selectedMapId = useGameStore((state) => state.selectedMapId)
  const proceduralMapSeed = useGameStore((state) => state.proceduralMapSeed)
  const vehicleSpec = useGameStore((state) => state.vehicleSpec)
  const advanceMission = useGameStore((state) => state.advanceMission)
  const setMissionProgress = useGameStore((state) => state.setMissionProgress)
  const map = useMemo(() => getTrackMap(selectedMapId, proceduralMapSeed), [selectedMapId, proceduralMapSeed])
  const activeStaticObstacles = useMemo(() => map.spawnRules.obstacles.static, [map])
  const activeMovableObstacles = useMemo(() => map.spawnRules.obstacles.movable, [map])
  const spawnObstacles = useMemo(() => [...activeStaticObstacles, ...activeMovableObstacles], [activeStaticObstacles, activeMovableObstacles])
  const initialPickups = useMemo(() => map.spawnRules.pickups.initial, [map])
  const initialDestructibles = useMemo(() => createInitialDestructibles(map), [map])
  const [pickups, setPickups] = useState<Pickup[]>(() => [...initialPickups])
  const [remoteCars, setRemoteCars] = useState<Record<string, RemoteCarState>>({})
  const [destructibles, setDestructibles] = useState<RuntimeDestructible[]>(() =>
    initialDestructibles.map((item, index) => ({
      ...item,
      phase: 'intact',
      respawnAt: null,
      burstSeed: index,
    })),
  )
  const [critters, setCritters] = useState<RuntimeCritter[]>(() => createCritters(map, proceduralMapSeed))

  const playerPositionRef = useRef<[number, number, number]>(map.startPosition)
  const spawnTimerRef = useRef(0)
  const spawnIdRef = useRef(0)
  const destructibleSeedRef = useRef(0)
  const seenRestartTokenRef = useRef(restartToken)
  const localPlayerIdRef = useRef(makeClientId())
  const channelRef = useRef<RoomChannelHandle | null>(null)
  const sendTimerRef = useRef(0)
  const staleTimerRef = useRef(0)
  const worldSyncTimerRef = useRef(0)
  const critterRespawnTimerRef = useRef(0)
  const critterHitCheckTimerRef = useRef(0)
  const critterResetKeyRef = useRef(`${map.id}-${proceduralMapSeed}-${restartToken}`)
  const pickupsRef = useRef<Pickup[]>(initialPickups)
  const gateInsideRef = useRef<boolean[]>(Array.from({ length: map.gates.length }, () => false))
  const prevDamageRef = useRef(damage)
  const cleanDriveSecondsRef = useRef(0)
  const missionTickTimerRef = useRef(0)
  const headingRef = useRef(map.startYaw)
  const lastHeadingPosRef = useRef<[number, number, number]>(map.startPosition)
  const multiplayerEnabled = Boolean(roomId && isMultiplayerConfigured())
  const guestMode = multiplayerEnabled && !isRoomHost

  const breakCritter = useCallback((id: string, position: [number, number, number]) => {
    setCritters((state) =>
      state.map((item) =>
        item.id === id && item.state === 'alive'
          ? {
              ...item,
              state: 'broken' as const,
              respawnAt: performance.now() / 1000 + map.spawnRules.hazards.critters.respawnSeconds,
              position,
              burstSeed: item.burstSeed + 1,
            }
          : item,
      ),
    )
  }, [map.spawnRules.hazards.critters.respawnSeconds])

  const applyPickupCollect = useCallback((pickupId: string) => {
    setPickups((state) => state.filter((pickup) => pickup.id !== pickupId))
  }, [])

  const collectPickup = useCallback(
    (pickupId: string) => {
      const picked = pickupsRef.current.find((pickup) => pickup.id === pickupId)
      applyPickupCollect(pickupId)
      if (picked?.type === 'star') {
        advanceMission('collect_stars', 1)
      }
      if (picked?.type === 'part') {
        advanceMission('collect_parts', 1)
      }
      if (channelRef.current) {
        channelRef.current.sendPickupCollect({ pickupId })
      }
    },
    [advanceMission, applyPickupCollect],
  )

  const updatePlayerPosition = useCallback((position: [number, number, number]) => {
    const prev = lastHeadingPosRef.current
    const dx = position[0] - prev[0]
    const dz = position[2] - prev[2]
    const moved = Math.hypot(dx, dz)
    if (moved > 0.04) {
      headingRef.current = Math.atan2(dx, dz)
      lastHeadingPosRef.current = position
    }
    playerPositionRef.current = position
  }, [])

  const applyBreakDestructible = useCallback((id: string, burstSeed?: number) => {
    setDestructibles((state) =>
      state.map((item) =>
        item.id === id && item.phase === 'intact'
          ? {
              ...item,
              phase: 'broken',
              respawnAt: performance.now() / 1000 + map.spawnRules.hazards.destructibles.respawnSeconds,
              burstSeed: burstSeed ?? destructibleSeedRef.current++,
            }
          : item,
      ),
    )
  }, [map.spawnRules.hazards.destructibles.respawnSeconds])

  const breakDestructible = useCallback(
    (id: string) => {
      const seed = destructibleSeedRef.current++
      applyBreakDestructible(id, seed)
      if (channelRef.current) {
        channelRef.current.sendBreakDestructible({ id, burstSeed: seed })
      }
    },
    [applyBreakDestructible],
  )

  useEffect(() => {
    pickupsRef.current = pickups
  }, [pickups])

  useEffect(() => {
    if (!roomId || !isMultiplayerConfigured()) {
      channelRef.current?.destroy()
      channelRef.current = null
      queueMicrotask(() => setRemoteCars({}))
      return
    }

    channelRef.current?.destroy()
    queueMicrotask(() => setRemoteCars({}))
    const handle = createRoomChannel(roomId, {
      onSnapshot: (snapshot) => {
        if (snapshot.id === localPlayerIdRef.current) {
          return
        }
        setRemoteCars((state) => ({
          ...state,
          [snapshot.id]: {
            ...snapshot,
            updatedAtMs: performance.now(),
            snapshots: [
              ...((state[snapshot.id]?.snapshots ?? []).slice(-19)),
              { x: snapshot.x, y: snapshot.y, z: snapshot.z, yaw: snapshot.yaw, t: performance.now() },
            ],
          },
        }))
      },
      onPickupCollect: ({ pickupId }) => {
        applyPickupCollect(pickupId)
      },
      onBreakDestructible: ({ id, burstSeed }) => {
        applyBreakDestructible(id, burstSeed)
      },
      onWorldSync: (payload) => {
        if (!guestMode) {
          return
        }
        setPickups(payload.pickups)
        setDestructibles(payload.destructibles)
      },
    })
    channelRef.current = handle

    return () => {
      handle?.destroy()
      if (channelRef.current === handle) {
        channelRef.current = null
      }
    }
  }, [applyBreakDestructible, applyPickupCollect, guestMode, roomId])

  useFrame((_, delta) => {
    const critterResetKey = `${map.id}-${proceduralMapSeed}-${restartToken}`
    if (critterResetKeyRef.current !== critterResetKey) {
      critterResetKeyRef.current = critterResetKey
      setCritters(createCritters(map, proceduralMapSeed))
      critterRespawnTimerRef.current = 0
    }
    if (seenRestartTokenRef.current !== restartToken) {
      seenRestartTokenRef.current = restartToken
      spawnTimerRef.current = 0
      spawnIdRef.current = 0
      sendTimerRef.current = 0
      staleTimerRef.current = 0
      worldSyncTimerRef.current = 0
      critterRespawnTimerRef.current = 0
      critterHitCheckTimerRef.current = 0
      missionTickTimerRef.current = 0
      cleanDriveSecondsRef.current = 0
      prevDamageRef.current = 0
      gateInsideRef.current = Array.from({ length: map.gates.length }, () => false)
      playerPositionRef.current = map.startPosition
      lastHeadingPosRef.current = map.startPosition
      headingRef.current = map.startYaw
      setPickups([...initialPickups])
      pickupsRef.current = initialPickups
      destructibleSeedRef.current = 0
      setDestructibles(
        initialDestructibles.map((item, index) => ({
          ...item,
          phase: 'intact',
          respawnAt: null,
          burstSeed: index,
        })),
      )
      setCritters(createCritters(map, proceduralMapSeed))
      return
    }

    if (status !== 'running') {
      return
    }

    if (damage > prevDamageRef.current) {
      cleanDriveSecondsRef.current = 0
      setMissionProgress('clean_drive', 0)
    }
    prevDamageRef.current = damage

    missionTickTimerRef.current += delta
    if (missionTickTimerRef.current >= 0.15) {
      missionTickTimerRef.current = 0
      if (speedKph > 4) {
        cleanDriveSecondsRef.current += 0.15
        setMissionProgress('clean_drive', cleanDriveSecondsRef.current)
      }
    }

    for (let i = 0; i < map.gates.length; i += 1) {
      const gate = map.gates[i]
      const dx = playerPositionRef.current[0] - gate.position[0]
      const dz = playerPositionRef.current[2] - gate.position[2]
      const inside = Math.hypot(dx, dz) <= 3
      if (inside && !gateInsideRef.current[i]) {
        advanceMission('pass_gates', 1)
      }
      gateInsideRef.current[i] = inside
    }

    if (channelRef.current) {
      sendTimerRef.current += delta
      if (sendTimerRef.current >= 1 / 15) {
        sendTimerRef.current = 0
        const p = playerPositionRef.current
        channelRef.current.sendSnapshot({
          id: localPlayerIdRef.current,
          x: p[0],
          y: p[1],
          z: p[2],
          yaw: headingRef.current,
          color: vehicleSpec.cosmetics.bodyColor,
          buildName: vehicleSpec.name,
          massClass: vehicleSpec.massClass,
          sentAt: performance.now(),
        })
      }

      staleTimerRef.current += delta
      if (staleTimerRef.current >= 1) {
        staleTimerRef.current = 0
        const nowMs = performance.now()
        setRemoteCars((state) => {
          const next: Record<string, RemoteCarState> = {}
          for (const [id, car] of Object.entries(state)) {
            if (nowMs - car.updatedAtMs <= 5000) {
              next[id] = car
            }
          }
          return next
        })
      }
    }

    if (channelRef.current && isRoomHost) {
      worldSyncTimerRef.current += delta
      if (worldSyncTimerRef.current >= 0.25) {
        worldSyncTimerRef.current = 0
        channelRef.current.sendWorldSync({
          pickups,
          destructibles,
        })
      }
    }

    if (guestMode) {
      return
    }

    const critterRules = map.spawnRules.hazards.critters
    critterHitCheckTimerRef.current += delta
    if (critterRules.enabled && critterHitCheckTimerRef.current >= critterRules.hitCheckInterval) {
      critterHitCheckTimerRef.current = 0
      const impactSpeedThresholdKph = critterRules.breakSpeed * 3.6 * 0.75
      if (speedKph >= impactSpeedThresholdKph) {
        const px = playerPositionRef.current[0]
        const py = playerPositionRef.current[1]
        const pz = playerPositionRef.current[2]
        const hitRadiusSq = critterRules.hitRadius * critterRules.hitRadius
        const hitIds: string[] = []
        const hitPositions: Record<string, [number, number, number]> = {}
        for (const critter of critters) {
          if (critter.state !== 'alive') {
            continue
          }
          const dx = px - critter.position[0]
          const dz = pz - critter.position[2]
          const distSq = dx * dx + dz * dz
          if (distSq > hitRadiusSq) {
            continue
          }
          if (Math.abs(py - critter.position[1]) > 1) {
            continue
          }
          hitIds.push(critter.id)
          hitPositions[critter.id] = [critter.position[0], critter.position[1], critter.position[2]]
        }
        if (hitIds.length > 0) {
          setCritters((state) =>
            state.map((item) =>
              hitIds.includes(item.id) && item.state === 'alive'
                ? {
                    ...item,
                    state: 'broken' as const,
                    respawnAt: performance.now() / 1000 + critterRules.respawnSeconds,
                    position: hitPositions[item.id] ?? item.position,
                    burstSeed: item.burstSeed + 1,
                  }
                : item,
            ),
          )
        }
      }
    }

    critterRespawnTimerRef.current += delta
    if (critterRespawnTimerRef.current >= 0.2) {
      critterRespawnTimerRef.current = 0
      setCritters((state) => {
        const nowSec = performance.now() / 1000
        let changed = false
        const next = state.map((item) => {
          if (item.state === 'broken' && item.respawnAt !== null && item.respawnAt <= nowSec) {
            changed = true
            const y = sampleTerrainHeight(map, item.home[0], item.home[1]) + 0.38
            return {
              ...item,
              state: 'alive' as const,
              respawnAt: null,
              position: [item.home[0], y, item.home[1]] as [number, number, number],
            }
          }
          return item
        })
        return changed ? next : state
      })
    }

    spawnTimerRef.current += delta
    if (spawnTimerRef.current < SPAWN_CHECK_SECONDS) {
      return
    }
    spawnTimerRef.current = 0

    setPickups((current) => {
      const starCount = current.filter((pickup) => pickup.type === 'star').length
      const repairCount = current.filter((pickup) => pickup.type === 'repair').length
      const partCount = current.filter((pickup) => pickup.type === 'part').length

      const minCounts = map.spawnRules.pickups.minCounts
      const missingStars = Math.max(0, minCounts.star - starCount)
      const missingRepairs = Math.max(0, minCounts.repair - repairCount)
      const missingParts = Math.max(0, minCounts.part - partCount)

      if (missingStars === 0 && missingRepairs === 0 && missingParts === 0) {
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
      for (let i = 0; i < missingParts; i += 1) {
        spawnTypes.push('part')
      }

      if (damage > 50 && missingRepairs === 0 && Math.random() < map.spawnRules.pickups.bonusRepairChance) {
        spawnTypes.push('repair')
      }
      if (damage > 68 && missingParts === 0 && Math.random() < map.spawnRules.pickups.bonusPartChance) {
        spawnTypes.push('part')
      }

      for (const type of spawnTypes) {
        const position = generateSpawnPosition(next, playerPositionRef.current, map.worldHalf, spawnObstacles)
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
      const destructibleRules = map.spawnRules.hazards.destructibles
      for (const item of state) {
        if (item.phase === 'intact') {
          const found = destructibleRules.spawnPoints.findIndex(
            (point) => point[0] === item.position[0] && point[2] === item.position[2],
          )
          if (found >= 0) usedPoints.add(`p-${found}`)
        }
      }

      const updated = state.map((item) => {
        if (item.phase === 'broken' && item.respawnAt !== null && item.respawnAt <= nowSec) {
          changed = true
          const point = pickRespawnPoint(map, usedPoints) ?? item.position
          const pointIndex = destructibleRules.spawnPoints.findIndex((p) => p[0] === point[0] && p[2] === point[2])
          if (pointIndex >= 0) usedPoints.add(`p-${pointIndex}`)
          const respawned: RuntimeDestructible = {
            ...item,
            phase: 'intact',
            respawnAt: null,
            position: [point[0], 0.7, point[2]] as [number, number, number],
            color: destructibleRules.palette[(destructibleSeedRef.current + pointIndex + 1) % destructibleRules.palette.length],
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
      <ambientLight intensity={lowPowerMode ? 0.54 : 0.42} />
      {lowPowerMode ? <hemisphereLight intensity={0.28} color="#d8f2ff" groundColor="#6f916a" /> : null}
      <directionalLight
        position={[12, 24, 10]}
        intensity={1.35}
        castShadow={!lowPowerMode}
        shadow-mapSize={lowPowerMode ? [512, 512] : [1024, 1024]}
        shadow-bias={-0.00018}
        shadow-camera-near={1}
        shadow-camera-far={80}
        shadow-camera-left={-36}
        shadow-camera-right={36}
        shadow-camera-top={36}
        shadow-camera-bottom={-36}
      />
      {!lowPowerMode ? <Environment preset="sunset" /> : null}
      {!lowPowerMode ? <ContactShadows position={[0, 0.03, 0]} opacity={0.35} scale={58} blur={2.2} far={42} resolution={512} color="#2a4f3b" /> : null}
      {map.shape === 'ring' ? (
        <>
          <Ground worldHalf={map.worldHalf} />
          <RoadLoop outerHalf={map.outerHalf} innerHalf={map.innerHalf} />
          <Curbs outerHalf={map.outerHalf} innerHalf={map.innerHalf} />
        </>
      ) : (
        <ProceduralGround map={map} />
      )}
      <CheckpointGates gates={map.gates} />
      {map.shape === 'path' ? <RoadPath map={map} /> : null}
      <RoadsideDetails map={map} seed={proceduralMapSeed * 97 + restartToken * 31} />
      <Trees trees={map.trees} map={map} />
      {map.shape === 'path' ? (
        <TrafficCars map={map} lowPowerMode={lowPowerMode} restartToken={restartToken} playerPositionRef={playerPositionRef} />
      ) : null}
      {activeStaticObstacles.map((obstacle) => (
        <StaticObstacle obstacle={obstacle} key={obstacle.id} />
      ))}
      {activeMovableObstacles.map((obstacle) => (
        <MovableObstacle obstacle={obstacle} key={`${obstacle.id}-${restartToken}`} />
      ))}
      {destructibles.map((item) =>
        item.phase === 'intact' ? (
          <IntactDestructible key={`${item.id}-intact`} destructible={item} map={map} onBreak={breakDestructible} />
        ) : (
          <BrokenDestructible key={`${item.id}-broken-${item.burstSeed}`} id={item.id} position={item.position} color={item.color} burstSeed={item.burstSeed} />
        ),
      )}
      {pickups.map((pickup) => (
        <PickupItem pickup={pickup} lowPowerMode={lowPowerMode} key={pickup.id} />
      ))}
      {map.shape === 'path' && map.spawnRules.hazards.critters.enabled
        ? critters.map((critter) => (
            <ForestCritter key={`${critter.id}-${critter.state}-${critter.burstSeed}`} critter={critter} map={map} onBreak={breakCritter} />
          ))
        : null}
      {Object.values(remoteCars).map((car) => (
        <RemoteCar key={car.id} car={car} lowPowerMode={lowPowerMode} />
      ))}
      <PlayerCar pickups={pickups} onCollectPickup={collectPickup} onPlayerPosition={updatePlayerPosition} lowPowerMode={lowPowerMode} />
    </>
  )
}

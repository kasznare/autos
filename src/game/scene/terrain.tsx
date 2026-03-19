import { useFrame, useThree } from '@react-three/fiber'
import { CuboidCollider, RigidBody, TrimeshCollider } from '@react-three/rapier'
import { useEffect, useMemo, useRef } from 'react'
import { BackSide, CanvasTexture, MeshStandardMaterial, PlaneGeometry, RepeatWrapping, Vector3 } from 'three'
import { Wireframe } from '@react-three/drei'
import { TRACK_SIZE } from '../config'
import { isPointNearRoad, sampleTerrainHeight, type TrackMap } from '../maps'
import { TERRAIN_COLLISION_MASK } from '../physics/interactionGroups'
import { useRenderSettings } from '../render/useRenderSettings'

const tempDistanceVec = new Vector3()
const TERRAIN_LOD_HYSTERESIS = 8
const ROAD_LOD_HYSTERESIS = 8
const DISABLE_TEXTURE_SWITCHING = true

const resolveNearLod = (distance: number, threshold: number, hysteresis: number, previous: boolean | null) => {
  if (DISABLE_TEXTURE_SWITCHING) {
    return true
  }
  if (previous === null) {
    return distance < threshold
  }
  if (previous) {
    return distance < threshold + hysteresis
  }
  return distance < threshold - hysteresis
}

const pseudoNoise = (index: number, salt: number) => {
  const x = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453
  return x - Math.floor(x)
}

export const Ground = ({ worldHalf = TRACK_SIZE / 2 }: { worldHalf?: number }) => {
  const render = useRenderSettings()
  const { camera } = useThree()
  const materialRef = useRef<MeshStandardMaterial | null>(null)
  const nearModeRef = useRef<boolean | null>(null)
  const [nearTexture, farTexture] = useMemo(() => {
    const createTexture = (near: boolean) => {
      const canvas = document.createElement('canvas')
      const resolution = Math.max(192, Math.round(render.roadTextureResolution * 0.6))
      canvas.width = resolution
      canvas.height = resolution
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        return null
      }

      const tile = near ? 28 : 44
      ctx.fillStyle = near ? '#4cae61' : '#509a5c'
      ctx.fillRect(0, 0, resolution, resolution)
      ctx.fillStyle = near ? '#63c975' : '#5bab66'
      for (let y = 0; y < resolution; y += tile) {
        for (let x = 0; x < resolution; x += tile) {
          if (((x + y) / tile) % 2 === 0) {
            ctx.fillRect(x, y, tile, tile)
          }
        }
      }

      const blades = Math.floor((near ? 2100 : 850) * render.detailDensity)
      for (let i = 0; i < blades; i += 1) {
        const x = pseudoNoise(i, near ? 1 : 61) * resolution
        const y = pseudoNoise(i, near ? 2 : 62) * resolution
        const len = (near ? 5 : 2.6) * (0.5 + pseudoNoise(i, near ? 3 : 63))
        ctx.strokeStyle = near ? 'rgba(38, 110, 52, 0.22)' : 'rgba(62, 124, 72, 0.11)'
        ctx.lineWidth = near ? 0.9 : 0.6
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x + len * 0.4, y - len)
        ctx.stroke()
      }

      const texture = new CanvasTexture(canvas)
      texture.wrapS = RepeatWrapping
      texture.wrapT = RepeatWrapping
      texture.repeat.set(Math.max(10, worldHalf / 3), Math.max(10, worldHalf / 3))
      return texture
    }
    return [createTexture(true), createTexture(false)] as const
  }, [render.detailDensity, render.roadTextureResolution, worldHalf])

  useEffect(() => {
    nearModeRef.current = null
    const material = materialRef.current
    if (!material || render.mode !== 'pretty') {
      return
    }
    material.map = nearTexture
    material.needsUpdate = true
  }, [farTexture, nearTexture, render.mode])

  useFrame(() => {
    const material = materialRef.current
    if (!material || render.mode !== 'pretty') {
      return
    }
    const distance = camera.position.distanceTo(tempDistanceVec.set(0, 0, 0))
    const isNear = resolveNearLod(distance, render.terrainNearDistance, TERRAIN_LOD_HYSTERESIS, nearModeRef.current)
    if (nearModeRef.current === isNear) {
      return
    }
    nearModeRef.current = isNear
    material.map = isNear ? nearTexture : farTexture
    material.roughness = isNear ? 0.88 : 0.96
    material.needsUpdate = true
  })

  return (
    <RigidBody type="fixed" colliders={false} name="terrain-ground-ring">
      <mesh receiveShadow={render.mode === 'pretty'} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[worldHalf * 2, worldHalf * 2]} />
        {render.mode === 'flat-debug' ? (
          <meshStandardMaterial color="#62b873" roughness={1} metalness={0} wireframe flatShading />
        ) : (
          <meshStandardMaterial ref={materialRef} color="#4cb35f" roughness={0.88} metalness={0.04} />
        )}
      </mesh>
      {render.mode === 'pretty' ? (
        <mesh scale={[220, 220, 220]}>
          <sphereGeometry args={[1, 28, 20]} />
          <meshBasicMaterial color={render.sky.horizonColor} side={BackSide} fog={false} />
        </mesh>
      ) : null}
      <CuboidCollider args={[worldHalf, 0.2, worldHalf]} position={[0, -0.2, 0]} collisionGroups={TERRAIN_COLLISION_MASK} />
    </RigidBody>
  )
}

export const RoadLoop = ({ outerHalf, innerHalf }: { outerHalf: number; innerHalf: number }) => {
  const render = useRenderSettings()
  const { camera } = useThree()
  const materialRef = useRef<MeshStandardMaterial | null>(null)
  const nearModeRef = useRef<boolean | null>(null)
  const [nearTexture, farTexture] = useMemo(() => {
    const createTexture = (near: boolean) => {
      const canvas = document.createElement('canvas')
      canvas.width = render.roadTextureResolution
      canvas.height = render.roadTextureResolution
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
      ctx.fillStyle = near ? '#2f3338' : '#343943'
      ctx.fillRect(outerMin, outerMin, outerMax - outerMin, outerMax - outerMin)
      ctx.clearRect(innerMin, innerMin, innerMax - innerMin, innerMax - innerMin)

      const gravel = Math.floor((near ? 3000 : 1150) * render.detailDensity)
      for (let i = 0; i < gravel; i += 1) {
        const x = pseudoNoise(i, near ? 201 : 251) * canvas.width
        const y = pseudoNoise(i, near ? 202 : 252) * canvas.height
        const r = near ? 0.4 + pseudoNoise(i, 203) * 1.8 : 0.2 + pseudoNoise(i, 253) * 0.8
        ctx.fillStyle = near ? 'rgba(126, 132, 140, 0.18)' : 'rgba(115, 122, 130, 0.09)'
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fill()
      }

      ctx.strokeStyle = near ? 'rgba(183, 151, 98, 0.55)' : 'rgba(157, 136, 95, 0.4)'
      ctx.lineWidth = near ? 18 : 12
      ctx.strokeRect(outerMin + 4, outerMin + 4, outerMax - outerMin - 8, outerMax - outerMin - 8)
      ctx.strokeStyle = near ? '#4f545d' : '#464d58'
      ctx.lineWidth = near ? 10 : 8
      ctx.strokeRect(outerMin + 4, outerMin + 4, outerMax - outerMin - 8, outerMax - outerMin - 8)

      ctx.strokeStyle = near ? '#f7f7f0' : '#e5e5dd'
      ctx.lineWidth = near ? 6 : 4
      ctx.setLineDash(near ? [24, 18] : [20, 20])
      ctx.strokeRect(midMin, midMin, midMax - midMin, midMax - midMin)
      ctx.setLineDash([])

      const texture = new CanvasTexture(canvas)
      texture.wrapS = RepeatWrapping
      texture.wrapT = RepeatWrapping
      return texture
    }
    return [createTexture(true), createTexture(false)] as const
  }, [innerHalf, outerHalf, render.detailDensity, render.roadTextureResolution])

  useEffect(() => {
    nearModeRef.current = null
    const material = materialRef.current
    if (!material || render.mode !== 'pretty') {
      return
    }
    material.map = nearTexture
    material.needsUpdate = true
  }, [farTexture, nearTexture, render.mode])

  useFrame(() => {
    const material = materialRef.current
    if (!material || render.mode !== 'pretty') return
    const distance = camera.position.distanceTo(tempDistanceVec.set(0, 0, 0))
    const isNear = resolveNearLod(distance, render.roadNearDistance, ROAD_LOD_HYSTERESIS, nearModeRef.current)
    if (nearModeRef.current === isNear) return
    nearModeRef.current = isNear
    material.map = isNear ? nearTexture : farTexture
    material.roughness = isNear ? 0.85 : 0.95
    material.metalness = isNear ? 0.16 : 0.08
    material.needsUpdate = true
  })

  return (
    <mesh receiveShadow={render.mode === 'pretty'} position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[TRACK_SIZE, TRACK_SIZE]} />
      {render.mode === 'flat-debug' ? (
        <meshStandardMaterial color="#60656d" roughness={0.95} metalness={0} wireframe flatShading />
      ) : (
        <meshStandardMaterial ref={materialRef} transparent roughness={0.85} metalness={0.16} />
      )}
    </mesh>
  )
}

export const RoadPath = ({ map, terrainSegments }: { map: TrackMap; terrainSegments?: number }) => {
  const render = useRenderSettings()
  const { camera } = useThree()
  const materialRef = useRef<MeshStandardMaterial | null>(null)
  const nearModeRef = useRef<boolean | null>(null)
  const [nearTexture, farTexture] = useMemo(() => {
    const createTexture = (near: boolean) => {
      const canvas = document.createElement('canvas')
      canvas.width = render.roadTextureResolution
      canvas.height = render.roadTextureResolution
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
      ctx.strokeStyle = near ? 'rgba(176, 148, 100, 0.5)' : 'rgba(159, 141, 110, 0.36)'
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

      ctx.strokeStyle = near ? '#2f3338' : '#343b46'
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

      const grain = Math.floor((near ? 3200 : 1100) * render.detailDensity)
      for (let i = 0; i < grain; i += 1) {
        const x = pseudoNoise(i, near ? 301 : 351) * canvas.width
        const y = pseudoNoise(i, near ? 302 : 352) * canvas.height
        const r = near ? 0.4 + pseudoNoise(i, 303) * 1.5 : 0.2 + pseudoNoise(i, 353) * 0.8
        ctx.fillStyle = near ? 'rgba(139, 144, 148, 0.16)' : 'rgba(126, 132, 136, 0.08)'
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fill()
      }

      ctx.strokeStyle = near ? '#4f545d' : '#474d57'
      ctx.lineWidth = Math.max(8, lineWidth * 0.18)
      ctx.stroke()

      ctx.strokeStyle = near ? '#f7f7f0' : '#e6e6df'
      ctx.setLineDash(near ? [26, 18] : [18, 20])
      ctx.lineWidth = Math.max(4, lineWidth * 0.14)
      ctx.stroke()
      ctx.setLineDash([])

      const texture = new CanvasTexture(canvas)
      texture.wrapS = RepeatWrapping
      texture.wrapT = RepeatWrapping
      return texture
    }
    return [createTexture(true), createTexture(false)] as const
  }, [map.roadPath, map.roadWidth, map.worldHalf, render.detailDensity, render.roadTextureResolution])

  useEffect(() => {
    nearModeRef.current = null
    const material = materialRef.current
    if (!material || render.mode !== 'pretty') {
      return
    }
    material.map = nearTexture
    material.needsUpdate = true
  }, [farTexture, nearTexture, render.mode])

  const roadGeometry = useMemo(() => {
    const size = map.worldHalf * 2
    const segments = terrainSegments ?? render.terrainSegments
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
  }, [map, render.terrainSegments, terrainSegments])

  useFrame(() => {
    const material = materialRef.current
    if (!material || render.mode !== 'pretty') return
    const distance = camera.position.distanceTo(tempDistanceVec.set(0, 0, 0))
    const isNear = resolveNearLod(distance, render.roadNearDistance, ROAD_LOD_HYSTERESIS, nearModeRef.current)
    if (nearModeRef.current === isNear) return
    nearModeRef.current = isNear
    material.map = isNear ? nearTexture : farTexture
    material.roughness = isNear ? 0.84 : 0.95
    material.metalness = isNear ? 0.2 : 0.08
    material.needsUpdate = true
  })

  return (
    <mesh receiveShadow={render.mode === 'pretty'} geometry={roadGeometry}>
      {render.mode === 'flat-debug' ? (
        <meshStandardMaterial color="#5f656d" roughness={1} metalness={0} wireframe flatShading />
      ) : (
        <meshStandardMaterial ref={materialRef} transparent roughness={0.84} metalness={0.2} />
      )}
    </mesh>
  )
}

export const PathLaneMarkers = ({ map }: { map: TrackMap }) => {
  const markers = useMemo(() => {
    if (map.shape !== 'path' || map.roadPath.length < 2 || map.laneCount <= 1) {
      return []
    }
    const laneWidth = map.laneWidth > 0 ? map.laneWidth : map.roadWidth / map.laneCount
    const dashLen = Math.max(2.8, laneWidth * 0.9)
    const gapLen = Math.max(2.2, laneWidth * 0.7)
    const stride = dashLen + gapLen
    const out: Array<{ id: string; position: [number, number, number]; rotation: [number, number, number]; length: number }> = []

    for (let i = 0; i < map.roadPath.length; i += 1) {
      const a = map.roadPath[i]
      const b = map.roadPath[(i + 1) % map.roadPath.length]
      const dx = b[0] - a[0]
      const dz = b[1] - a[1]
      const segLen = Math.hypot(dx, dz)
      if (segLen < 0.001) {
        continue
      }
      const dirX = dx / segLen
      const dirZ = dz / segLen
      const normalX = dirZ
      const normalZ = -dirX
      const yaw = Math.atan2(dx, dz)
      for (let lane = 1; lane < map.laneCount; lane += 1) {
        const offset = -map.roadWidth * 0.5 + laneWidth * lane
        for (let along = 0.7; along < segLen - 0.7; along += stride) {
          const x = a[0] + dirX * along + normalX * offset
          const z = a[1] + dirZ * along + normalZ * offset
          out.push({
            id: `lane-${i}-${lane}-${Math.round(along * 10)}`,
            position: [x, sampleTerrainHeight(map, x, z) + 0.05, z],
            rotation: [0, yaw, 0],
            length: Math.min(dashLen, segLen - along),
          })
        }
      }
    }
    return out
  }, [map])

  return (
    <group>
      {markers.map((marker) => (
        <mesh key={marker.id} position={marker.position} rotation={marker.rotation} receiveShadow>
          <boxGeometry args={[0.18, 0.03, marker.length]} />
          <meshStandardMaterial color="#f8f4dc" roughness={0.52} />
        </mesh>
      ))}
    </group>
  )
}

export const ProceduralGround = ({
  map,
  terrainSegments,
  showColliderDebug = false,
}: {
  map: TrackMap
  terrainSegments?: number
  showColliderDebug?: boolean
}) => {
  const render = useRenderSettings()
  const { camera } = useThree()
  const materialRef = useRef<MeshStandardMaterial | null>(null)
  const nearModeRef = useRef<boolean | null>(null)
  const [nearTexture, farTexture] = useMemo(() => {
    const createTexture = (near: boolean) => {
      const canvas = document.createElement('canvas')
      canvas.width = render.roadTextureResolution
      canvas.height = render.roadTextureResolution
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

      ctx.fillStyle = near ? '#4a9f57' : '#4d9257'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      const baseGradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
      baseGradient.addColorStop(0, near ? 'rgba(89, 164, 98, 0.42)' : 'rgba(84, 151, 92, 0.28)')
      baseGradient.addColorStop(0.5, near ? 'rgba(70, 140, 78, 0.22)' : 'rgba(69, 130, 77, 0.16)')
      baseGradient.addColorStop(1, near ? 'rgba(101, 180, 112, 0.38)' : 'rgba(95, 164, 106, 0.22)')
      ctx.fillStyle = baseGradient
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      const patchSize = near ? 56 : 72
      ctx.fillStyle = near ? 'rgba(115, 186, 111, 0.14)' : 'rgba(102, 167, 96, 0.08)'
      for (let y = 0; y < canvas.height; y += patchSize) {
        for (let x = 0; x < canvas.width; x += patchSize) {
          if (((x + y) / patchSize) % 2 === 0) {
            ctx.fillRect(x, y, patchSize, patchSize)
          }
        }
      }

      const blades = Math.floor((near ? 4300 : 1550) * render.detailDensity)
      for (let i = 0; i < blades; i += 1) {
        const x = pseudoNoise(i, near ? 401 : 451) * canvas.width
        const y = pseudoNoise(i, near ? 402 : 452) * canvas.height
        const len = (near ? 7 : 3.8) * (0.45 + pseudoNoise(i, near ? 403 : 453))
        ctx.strokeStyle = near ? 'rgba(40, 108, 49, 0.2)' : 'rgba(53, 114, 63, 0.11)'
        ctx.lineWidth = near ? 0.9 : 0.55
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x + len * 0.35, y - len)
        ctx.stroke()
      }

      const stones = Math.floor((near ? 1800 : 680) * render.detailDensity)
      for (let i = 0; i < stones; i += 1) {
        const x = pseudoNoise(i, near ? 421 : 471) * canvas.width
        const y = pseudoNoise(i, near ? 422 : 472) * canvas.height
        const r = near ? 0.6 + pseudoNoise(i, 423) * 2.2 : 0.4 + pseudoNoise(i, 473) * 1.1
        ctx.fillStyle = near ? 'rgba(170, 162, 138, 0.1)' : 'rgba(108, 105, 96, 0.06)'
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fill()
      }

      const shoulderWidth = ((map.roadWidth * 1.8) / worldSize) * canvas.width
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      ctx.strokeStyle = near ? 'rgba(139, 120, 84, 0.24)' : 'rgba(126, 112, 86, 0.18)'
      ctx.lineWidth = shoulderWidth
      ctx.beginPath()
      drawClosedPath()
      ctx.stroke()

      ctx.strokeStyle = near ? 'rgba(108, 141, 87, 0.26)' : 'rgba(94, 123, 75, 0.2)'
      ctx.lineWidth = shoulderWidth * 0.6
      ctx.beginPath()
      drawClosedPath()
      ctx.stroke()

      const texture = new CanvasTexture(canvas)
      texture.wrapS = RepeatWrapping
      texture.wrapT = RepeatWrapping
      return texture
    }
    return [createTexture(true), createTexture(false)] as const
  }, [map.roadPath, map.roadWidth, map.worldHalf, render.detailDensity, render.roadTextureResolution])

  useEffect(() => {
    nearModeRef.current = null
    const material = materialRef.current
    if (!material || render.mode !== 'pretty') {
      return
    }
    material.map = nearTexture
    material.needsUpdate = true
  }, [farTexture, nearTexture, render.mode])

  const terrainGeometry = useMemo(() => {
    const size = map.worldHalf * 2
    const segments = terrainSegments ?? render.terrainSegments
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
  }, [map, render.terrainSegments, terrainSegments])

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

  useFrame(() => {
    const material = materialRef.current
    if (!material || render.mode !== 'pretty') return
    const distance = camera.position.distanceTo(tempDistanceVec.set(0, 0, 0))
    const isNear = resolveNearLod(distance, render.terrainNearDistance, TERRAIN_LOD_HYSTERESIS, nearModeRef.current)
    if (nearModeRef.current === isNear) return
    nearModeRef.current = isNear
    material.map = isNear ? nearTexture : farTexture
    material.roughness = isNear ? 0.88 : 0.96
    material.metalness = isNear ? 0.06 : 0.02
    material.needsUpdate = true
  })

  return (
    <RigidBody type="fixed" colliders={false} name="terrain-ground-procedural">
      <mesh receiveShadow={render.mode === 'pretty'} geometry={terrainGeometry}>
        {render.mode === 'flat-debug' ? (
          <meshStandardMaterial color="#5aa267" roughness={1} metalness={0} wireframe flatShading />
        ) : (
          <meshStandardMaterial ref={materialRef} roughness={0.88} metalness={0.06} />
        )}
      </mesh>
      {showColliderDebug ? (
        <Wireframe
          geometry={terrainGeometry}
          simplify={false}
          stroke="#00e4ff"
          strokeOpacity={0.95}
          fillOpacity={0}
          thickness={0.09}
          backfaceStroke="#00e4ff"
        />
      ) : null}
      {render.mode === 'pretty' ? (
        <mesh scale={[220, 220, 220]}>
          <sphereGeometry args={[1, 28, 20]} />
          <meshBasicMaterial color={render.sky.zenithColor} side={BackSide} fog={false} />
        </mesh>
      ) : null}
      {terrainColliderArgs ? <TrimeshCollider args={terrainColliderArgs} collisionGroups={TERRAIN_COLLISION_MASK} /> : null}
    </RigidBody>
  )
}

const CurbStrip = ({
  length = 1,
  position,
  rotation = [0, 0, 0] as [number, number, number],
}: {
  length?: number
  position: [number, number, number]
  rotation?: [number, number, number]
}) => (
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

export const Curbs = ({ outerHalf, innerHalf }: { outerHalf: number; innerHalf: number }) => {
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

export const CheckpointGates = ({
  gates,
}: {
  gates: { position: [number, number, number]; rotation?: [number, number, number] }[]
}) => (
  <group>
    {gates.map((gate, idx) => (
      <CheckpointGate key={`gate-${idx}`} position={gate.position} rotation={gate.rotation} />
    ))}
  </group>
)

export const Trees = ({
  trees,
  map,
  castShadows = true,
}: {
  trees: { id: string; position: [number, number, number]; scale: number; variant: 'round' | 'cone' }[]
  map: TrackMap
  castShadows?: boolean
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
          <mesh castShadow={castShadows} position={[0, 0.7, 0]}>
            <cylinderGeometry args={[0.12, 0.17, 1.4, 8]} />
            <meshStandardMaterial color="#6f4a25" roughness={0.9} />
          </mesh>
          {tree.variant === 'round' ? (
            <mesh castShadow={castShadows} position={[0, 1.75, 0]}>
              <sphereGeometry args={[0.7, 12, 12]} />
              <meshStandardMaterial color="#3d8f49" roughness={0.85} />
            </mesh>
          ) : (
            <mesh castShadow={castShadows} position={[0, 1.8, 0]}>
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

export const RoadsideDetails = ({
  map,
  seed,
  density = 1,
  castShadows = true,
}: {
  map: TrackMap
  seed: number
  density?: number
  castShadows?: boolean
}) => {
  const details = useMemo(() => {
    const out: Array<{ id: string; type: 'rock' | 'bush'; position: [number, number, number]; scale: number }> = []
    const densityScale = Math.max(0.2, density)
    const maxItems = Math.round((map.shape === 'path' ? 180 : 70) * densityScale)
    const half = map.worldHalf - 4
    for (let i = 0; i < 900 && out.length < maxItems; i += 1) {
      const nx = pseudoNoise(seed + i, 201) * 2 - 1
      const nz = pseudoNoise(seed + i, 202) * 2 - 1
      const x = nx * half
      const z = nz * half
      if (isPointNearRoad(map, x, z, 1.8)) {
        continue
      }
      if (Math.hypot(x - map.startPosition[0], z - map.startPosition[2]) < 12) {
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
  }, [density, map, seed])

  return (
    <group>
      {details.map((item) =>
        item.type === 'rock' ? (
          <mesh key={item.id} position={item.position} scale={item.scale} castShadow={castShadows} receiveShadow={castShadows}>
            <dodecahedronGeometry args={[0.35, 0]} />
            <meshStandardMaterial color="#7c8374" roughness={0.93} />
          </mesh>
        ) : (
          <mesh key={item.id} position={item.position} scale={item.scale} castShadow={castShadows}>
            <sphereGeometry args={[0.42, 8, 7]} />
            <meshStandardMaterial color="#4d9f58" roughness={0.88} />
          </mesh>
        ),
      )}
    </group>
  )
}

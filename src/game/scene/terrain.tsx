import { CuboidCollider, RigidBody, TrimeshCollider } from '@react-three/rapier'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { CanvasTexture, InstancedMesh, Matrix4, Object3D, PlaneGeometry, RepeatWrapping } from 'three'
import { TRACK_SIZE } from '../config'
import { isPointOnRoad, sampleTerrainHeight, type TrackMap } from '../maps'

const pseudoNoise = (index: number, salt: number) => {
  const x = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453
  return x - Math.floor(x)
}

export const Ground = ({ worldHalf = TRACK_SIZE / 2 }: { worldHalf?: number }) => {
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

export const RoadLoop = ({ outerHalf, innerHalf }: { outerHalf: number; innerHalf: number }) => {
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

export const RoadPath = ({ map, terrainSegments = 280 }: { map: TrackMap; terrainSegments?: number }) => {
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
    const geometry = new PlaneGeometry(size, size, terrainSegments, terrainSegments)
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
  }, [map, terrainSegments])

  return (
    <mesh receiveShadow geometry={roadGeometry}>
      <meshStandardMaterial map={roadTexture} transparent roughness={0.92} metalness={0.12} />
    </mesh>
  )
}

export const ProceduralGround = ({ map, terrainSegments = 280 }: { map: TrackMap; terrainSegments?: number }) => {
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
    const geometry = new PlaneGeometry(size, size, terrainSegments, terrainSegments)
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
  }, [map, terrainSegments])

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
}) => {
  const treeStates = useMemo(
    () =>
      trees.map((tree) => {
        const y = sampleTerrainHeight(map, tree.position[0], tree.position[2])
        return {
          ...tree,
          y,
        }
      }),
    [map, trees],
  )

  const trunkMatrices = useMemo(() => {
    const matrices: Matrix4[] = []
    const dummy = new Object3D()
    for (const tree of treeStates) {
      dummy.position.set(tree.position[0], tree.y + 0.7 * tree.scale, tree.position[2])
      dummy.scale.set(tree.scale, tree.scale, tree.scale)
      dummy.updateMatrix()
      matrices.push(dummy.matrix.clone())
    }
    return matrices
  }, [treeStates])

  const roundCanopyMatrices = useMemo(() => {
    const matrices: Matrix4[] = []
    const dummy = new Object3D()
    for (const tree of treeStates) {
      if (tree.variant !== 'round') continue
      dummy.position.set(tree.position[0], tree.y + 1.75 * tree.scale, tree.position[2])
      dummy.scale.set(tree.scale, tree.scale, tree.scale)
      dummy.updateMatrix()
      matrices.push(dummy.matrix.clone())
    }
    return matrices
  }, [treeStates])

  const coneCanopyMatrices = useMemo(() => {
    const matrices: Matrix4[] = []
    const dummy = new Object3D()
    for (const tree of treeStates) {
      if (tree.variant !== 'cone') continue
      dummy.position.set(tree.position[0], tree.y + 1.8 * tree.scale, tree.position[2])
      dummy.scale.set(tree.scale, tree.scale, tree.scale)
      dummy.updateMatrix()
      matrices.push(dummy.matrix.clone())
    }
    return matrices
  }, [treeStates])

  const trunkRef = useRef<InstancedMesh>(null)
  const roundRef = useRef<InstancedMesh>(null)
  const coneRef = useRef<InstancedMesh>(null)

  useLayoutEffect(() => {
    const mesh = trunkRef.current
    if (!mesh) return
    trunkMatrices.forEach((matrix, idx) => mesh.setMatrixAt(idx, matrix))
    mesh.count = trunkMatrices.length
    mesh.instanceMatrix.needsUpdate = true
  }, [trunkMatrices])

  useLayoutEffect(() => {
    const mesh = roundRef.current
    if (!mesh) return
    roundCanopyMatrices.forEach((matrix, idx) => mesh.setMatrixAt(idx, matrix))
    mesh.count = roundCanopyMatrices.length
    mesh.instanceMatrix.needsUpdate = true
  }, [roundCanopyMatrices])

  useLayoutEffect(() => {
    const mesh = coneRef.current
    if (!mesh) return
    coneCanopyMatrices.forEach((matrix, idx) => mesh.setMatrixAt(idx, matrix))
    mesh.count = coneCanopyMatrices.length
    mesh.instanceMatrix.needsUpdate = true
  }, [coneCanopyMatrices])

  return (
    <group>
      {trunkMatrices.length > 0 ? (
        <instancedMesh ref={trunkRef} args={[undefined, undefined, trunkMatrices.length]} castShadow={castShadows}>
          <cylinderGeometry args={[0.12, 0.17, 1.4, 8]} />
          <meshStandardMaterial color="#6f4a25" roughness={0.9} />
        </instancedMesh>
      ) : null}
      {roundCanopyMatrices.length > 0 ? (
        <instancedMesh ref={roundRef} args={[undefined, undefined, roundCanopyMatrices.length]} castShadow={castShadows}>
          <sphereGeometry args={[0.7, 12, 12]} />
          <meshStandardMaterial color="#3d8f49" roughness={0.85} />
        </instancedMesh>
      ) : null}
      {coneCanopyMatrices.length > 0 ? (
        <instancedMesh ref={coneRef} args={[undefined, undefined, coneCanopyMatrices.length]} castShadow={castShadows}>
          <coneGeometry args={[0.74, 1.35, 12]} />
          <meshStandardMaterial color="#3f944d" roughness={0.85} />
        </instancedMesh>
      ) : null}
      {treeStates.map((tree) => (
        <RigidBody key={tree.id} type="fixed" colliders={false} name={`hard-tree-${tree.id}`} position={[tree.position[0], tree.y, tree.position[2]]}>
          <CuboidCollider args={[0.12 * tree.scale, 0.7 * tree.scale, 0.12 * tree.scale]} position={[0, 0.7 * tree.scale, 0]} />
        </RigidBody>
      ))}
    </group>
  )
}

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
    const out: Array<{ type: 'rock' | 'bush'; position: [number, number, number]; scale: number }> = []
    const maxItems = Math.max(0, Math.floor((map.shape === 'path' ? 180 : 70) * density))
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
        type,
        position: [x, y + 0.05, z],
        scale,
      })
    }
    return out
  }, [density, map, seed])

  const rockMatrices = useMemo(() => {
    const matrices: Matrix4[] = []
    const dummy = new Object3D()
    for (const item of details) {
      if (item.type !== 'rock') continue
      dummy.position.set(item.position[0], item.position[1], item.position[2])
      dummy.scale.setScalar(item.scale)
      dummy.updateMatrix()
      matrices.push(dummy.matrix.clone())
    }
    return matrices
  }, [details])

  const bushMatrices = useMemo(() => {
    const matrices: Matrix4[] = []
    const dummy = new Object3D()
    for (const item of details) {
      if (item.type !== 'bush') continue
      dummy.position.set(item.position[0], item.position[1], item.position[2])
      dummy.scale.setScalar(item.scale)
      dummy.updateMatrix()
      matrices.push(dummy.matrix.clone())
    }
    return matrices
  }, [details])

  const rockRef = useRef<InstancedMesh>(null)
  const bushRef = useRef<InstancedMesh>(null)

  useLayoutEffect(() => {
    const mesh = rockRef.current
    if (!mesh) return
    rockMatrices.forEach((matrix, idx) => mesh.setMatrixAt(idx, matrix))
    mesh.count = rockMatrices.length
    mesh.instanceMatrix.needsUpdate = true
  }, [rockMatrices])

  useLayoutEffect(() => {
    const mesh = bushRef.current
    if (!mesh) return
    bushMatrices.forEach((matrix, idx) => mesh.setMatrixAt(idx, matrix))
    mesh.count = bushMatrices.length
    mesh.instanceMatrix.needsUpdate = true
  }, [bushMatrices])

  return (
    <group>
      {rockMatrices.length > 0 ? (
        <instancedMesh ref={rockRef} args={[undefined, undefined, rockMatrices.length]} castShadow={castShadows} receiveShadow={castShadows}>
          <dodecahedronGeometry args={[0.35, 0]} />
          <meshStandardMaterial color="#7c8374" roughness={0.93} />
        </instancedMesh>
      ) : null}
      {bushMatrices.length > 0 ? (
        <instancedMesh ref={bushRef} args={[undefined, undefined, bushMatrices.length]} castShadow={castShadows}>
          <sphereGeometry args={[0.42, 8, 7]} />
          <meshStandardMaterial color="#4d9f58" roughness={0.88} />
        </instancedMesh>
      ) : null}
    </group>
  )
}

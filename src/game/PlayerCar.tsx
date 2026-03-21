import { Sparkles } from '@react-three/drei'
import { CuboidCollider, CylinderCollider, RapierRigidBody, RigidBody, useBeforePhysicsStep } from '@react-three/rapier'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Group, Quaternion, Vector3 } from 'three'
import { CarModel } from './CarModel'
import { MAX_DAMAGE, PLAYER_BODY_NAME, VEHICLE_PHYSICS } from './config'
import { createInputState, getMergedInput } from './keys'
import { getTrackMap, sampleTerrainHeight } from './maps'
import { PLAYER_COLLISION_MASK } from './physics/interactionGroups'
import { playPickupSound, setEngineMuted, stopEngineSound, updateEngineSound } from './sfx'
import { useGameStore } from './store'
import { VEHICLE_DEFINITION_BY_ID, fromLegacyVehicleSpec } from './vehicle/definitions'
import { buildDriveCommand } from './vehicle/drivetrain'
import { buildWheelTorqueTargets } from './vehicle/drivetrain'
import { applyWheelActuation, toVehicleRigDefinition } from './vehicle/integration'
import { buildVehicleRigSpawnState } from './vehicle/rig'
import {
  bindGamepadConnectionState,
  bindKeyboardControls,
  CAMERA_FOLLOW_DISTANCE,
  CAMERA_FOLLOW_HEIGHT,
  CAMERA_LOOK_AHEAD,
  DEFAULT_START_POSITION,
  NATIVE_RIG_VISUAL_WHEEL_LATERAL_LIMIT,
  NATIVE_RIG_VISUAL_WHEEL_LONGITUDINAL_LIMIT,
  NATIVE_RIG_VISUAL_WHEEL_SMOOTHING,
  ensureFinitePhysicsState,
  handlePlayerCollisionEnter,
  handlePlayerCollisionExit,
  clampExcessMotion,
  runVehicleDynamicsStep,
  updateCameraAndDamageVisuals,
  getCarPalette,
  getImpactLabel,
  processNearbyPickups,
  resetBodyPoseAndTelemetry,
  syncGamepadInput,
  getRealityLiftCorrectionM,
  measureRealityMetrics,
} from './systems/player-car'
import type { PartDamageStateV2, PartZoneIdV2, Pickup } from './types'

type PlayerCarProps = {
  pickups: Pickup[]
  onCollectPickup: (pickupId: string) => void
  onPlayerPosition: (position: [number, number, number]) => void
  lowPowerMode?: boolean
}

const tempVec = new Vector3()
const tempCamTarget = new Vector3()
const tempCamPosition = new Vector3()
const tempBodyPos = new Vector3()
const tempWorldWheel = new Vector3()
const tempLocalWheel = new Vector3()
const tempBodyPosVec = new Vector3()
const tempAnchorWorld = new Vector3()
const tempBodyQuat = new Quaternion()
const tempBodyQuatInv = new Quaternion()

const DEFAULT_DEBUG_WHEEL_POSITIONS: Array<[number, number, number]> = [
  [-0.6, 0.04, 0.8],
  [0.6, 0.04, 0.8],
  [-0.6, 0.04, -0.8],
  [0.6, 0.04, -0.8],
]

const NATIVE_RIG_SPAWN_COMPRESSION_RATIO = 0.48
const NATIVE_RIG_GRAVITY_SCALE = 1.45
const MAX_RENDER_DELTA = 1 / 20

export const PlayerCar = ({ pickups, onCollectPickup, onPlayerPosition, lowPowerMode = false }: PlayerCarProps) => {
  const bodyRef = useRef<RapierRigidBody>(null!)
  const wheelBodyRefs = useRef<Array<RapierRigidBody | null>>([])
  const lastDamageAt = useRef(0)
  const inputRef = useRef(createInputState())
  const shakeStrengthRef = useRef(0)
  const sparkStrengthRef = useRef(0)
  const sputterTimerRef = useRef(0)
  const sputterActiveRef = useRef(false)
  const steerAngleRef = useRef(0)
  const yawRateRef = useRef(0)
  const lastYawRef = useRef(0)
  const stuckSteerTimerRef = useRef(0)
  const hardContactCountRef = useRef(0)
  const scrapeDamageTimerRef = useRef(0)
  const armorTimerRef = useRef(0)
  const jumpCooldownTimerRef = useRef(0)
  const jumpGuardTimerRef = useRef(0)
  const jumpHeldRef = useRef(false)
  const lastGroundedAtRef = useRef(0)
  const zoneDamageRef = useRef<Record<PartZoneIdV2, number>>({ front: 0, rear: 0, left: 0, right: 0 })
  const zoneStateRef = useRef<Record<PartZoneIdV2, PartDamageStateV2>>({
    front: 'intact',
    rear: 'intact',
    left: 'intact',
    right: 'intact',
  })
  const disabledEmittedRef = useRef(false)
  const nanGuardTripsRef = useRef(0)
  const speedClampTripsRef = useRef(0)
  const telemetryTimerRef = useRef(0)
  const wheelDebugTimerRef = useRef(0)
  const visualFrontLeftSteerRef = useRef(0)
  const visualFrontRightSteerRef = useRef(0)
  const visualWheelSpinRef = useRef(0)
  const visualWheelPositionsRef = useRef<Array<[number, number, number]>>(DEFAULT_DEBUG_WHEEL_POSITIONS.map((pos) => [...pos] as [number, number, number]))
  const visualUpdateTimerRef = useRef(0)
  const [visualWheelState, setVisualWheelState] = useState<{
    frontLeftSteer: number
    frontRightSteer: number
    spin: number
    debugWheelPositions: Array<[number, number, number]>
  }>({
    frontLeftSteer: 0,
    frontRightSteer: 0,
    spin: 0,
    debugWheelPositions: DEFAULT_DEBUG_WHEEL_POSITIONS,
  })
  const outOfBoundsTimerRef = useRef(0)
  const hitSparkRef = useRef<Group>(null)
  const bumperRef = useRef<Group>(null)
  const loosePanelRef = useRef<Group>(null)
  const hoodRef = useRef<Group>(null)
  const roofRef = useRef<Group>(null)
  const leftDoorRef = useRef<Group>(null)
  const rightDoorRef = useRef<Group>(null)
  const activeGamepadIndexRef = useRef<number | null>(null)
  const smoothedPosRef = useRef(new Vector3(DEFAULT_START_POSITION.x, DEFAULT_START_POSITION.y, DEFAULT_START_POSITION.z))
  const smoothedForwardRef = useRef(new Vector3(0, 0, 1))
  const smoothedTargetRef = useRef(new Vector3(0, 0, 0))
  const orbitYawRef = useRef(0)
  const orbitPitchRef = useRef(0)
  const orbitDragPointerIdRef = useRef<number | null>(null)
  const orbitLastClientXRef = useRef(0)
  const orbitLastClientYRef = useRef(0)
  const { camera, gl } = useThree()

  const damage = useGameStore((state) => state.damage)
  const status = useGameStore((state) => state.status)
  const engineMuted = useGameStore((state) => state.engineMuted)
  const activeVehicleDefinitionId = useGameStore((state) => state.activeVehicleDefinitionId)
  const vehicleSpec = useGameStore((state) => state.vehicleSpec)
  const renderMode = useGameStore((state) => state.renderMode)
  const renderWireframe = useGameStore((state) => state.renderWireframe)
  const vehiclePhysicsMode = useGameStore((state) => state.vehiclePhysicsMode)
  const vehicleMotionMode = useGameStore((state) => state.vehicleMotionMode)
  const vehiclePhysicsTuning = useGameStore((state) => state.vehiclePhysicsTuning)
  const selectedMapId = useGameStore((state) => state.selectedMapId)
  const proceduralMapSeed = useGameStore((state) => state.proceduralMapSeed)
  const restartToken = useGameStore((state) => state.restartToken)
  const addDamage = useGameStore((state) => state.addDamage)
  const addScore = useGameStore((state) => state.addScore)
  const repair = useGameStore((state) => state.repair)
  const setKeyboardInput = useGameStore((state) => state.setKeyboardInput)
  const triggerHitFx = useGameStore((state) => state.triggerHitFx)
  const restartRun = useGameStore((state) => state.restartRun)
  const setTelemetry = useGameStore((state) => state.setTelemetry)
  const setGamepadConnected = useGameStore((state) => state.setGamepadConnected)
  const setPhysicsTelemetry = useGameStore((state) => state.setPhysicsTelemetry)

  const palette = useMemo(
    () => getCarPalette(vehicleSpec.cosmetics.bodyColor, vehicleSpec.cosmetics.accentColor, damage),
    [vehicleSpec.cosmetics.accentColor, vehicleSpec.cosmetics.bodyColor, damage],
  )
  const map = useMemo(() => getTrackMap(selectedMapId, proceduralMapSeed), [selectedMapId, proceduralMapSeed])
  const useNativeRigMotion = vehicleMotionMode === 'native-rig'
  const oneWheelModel = map.sourceId === 'ramp' && !useNativeRigMotion && vehiclePhysicsMode === 'one_wheel'
  const vehicleDefinition = useMemo(
    () =>
      (activeVehicleDefinitionId ? VEHICLE_DEFINITION_BY_ID[activeVehicleDefinitionId] : null) ??
      fromLegacyVehicleSpec('runtime-legacy-active', vehicleSpec),
    [activeVehicleDefinitionId, vehicleSpec],
  )
  const rigDefinition = useMemo(() => toVehicleRigDefinition(vehicleDefinition), [vehicleDefinition])
  const rigCorners = useMemo(
    () => rigDefinition.axles.flatMap((axle) => axle.corners),
    [rigDefinition.axles],
  )
  const crackOpacity = Math.min(0.72, Math.max(0, (damage - 38) / 62) * 0.72)
  const nativeRigSpawnHeight = useMemo(() => {
    const [, rawSy] = vehiclePhysicsTuning.scale
    const verticalScale = Math.max(0.7, Math.abs(rawSy) > 1e-4 ? Math.abs(rawSy) : 1)
    if (rigCorners.length === 0) {
      return VEHICLE_PHYSICS.suspensionRideHeight + 0.06
    }
    const cornerHeights = rigCorners.map((corner) => {
      const wheelRadius = corner.wheelRadius * verticalScale
      const restLength = corner.suspension.restLength * verticalScale
      const travel = corner.suspension.travel * verticalScale
      const preload = Math.min(restLength * NATIVE_RIG_SPAWN_COMPRESSION_RATIO, travel * 0.34)
      return wheelRadius + restLength - preload - corner.localAnchor[1] * verticalScale
    })
    return cornerHeights.reduce((sum, value) => sum + value, 0) / cornerHeights.length
  }, [rigCorners, vehiclePhysicsTuning.scale])
  const startPosition = useMemo(() => {
    const x = map.startPosition[0]
    const terrainBaseY = map.shape === 'ring' ? 0 : sampleTerrainHeight(map, x, map.startPosition[2])
    const y = useNativeRigMotion
      ? terrainBaseY + nativeRigSpawnHeight
      : map.shape === 'ring'
        ? map.startPosition[1]
        : terrainBaseY + VEHICLE_PHYSICS.suspensionRideHeight + 0.06
    const z = map.startPosition[2]
    return { x, y, z }
  }, [map, nativeRigSpawnHeight, useNativeRigMotion])
  const startYaw = map.startYaw
  const spawnState = useMemo(() => {
    const rotation: [number, number, number, number] = [0, Math.sin(startYaw / 2), 0, Math.cos(startYaw / 2)]
    return buildVehicleRigSpawnState(rigDefinition, {
      chassisPose: {
        translation: [startPosition.x, startPosition.y, startPosition.z],
        rotation,
      },
    })
  }, [rigDefinition, startPosition.x, startPosition.y, startPosition.z, startYaw])
  const wheelAnchors = useMemo(() => {
    const [sx, sy, sz] = vehiclePhysicsTuning.scale
    return rigCorners.map((wheel) => [wheel.localAnchor[0] * sx, wheel.localAnchor[1] * sy, wheel.localAnchor[2] * sz] as [number, number, number])
  }, [rigCorners, vehiclePhysicsTuning.scale])
  const wheelStartPositions = useMemo(() => {
    if (useNativeRigMotion) {
      const [, rawSy] = vehiclePhysicsTuning.scale
      const verticalScale = Math.max(0.7, Math.abs(rawSy) > 1e-4 ? Math.abs(rawSy) : 1)
      const sinYaw = Math.sin(startYaw)
      const cosYaw = Math.cos(startYaw)
      return rigCorners.map((corner, index) => {
        const anchor = wheelAnchors[index] ?? [0, -0.12, 0]
        const anchorWorldX = startPosition.x + anchor[0] * cosYaw + anchor[2] * sinYaw
        const anchorWorldY = startPosition.y + anchor[1]
        const anchorWorldZ = startPosition.z + anchor[2] * cosYaw - anchor[0] * sinYaw
        const terrainY = map.shape === 'ring' ? 0 : sampleTerrainHeight(map, anchorWorldX, anchorWorldZ)
        const suspensionRestLength = corner.suspension.restLength * verticalScale
        const suspensionTravel = corner.suspension.travel * verticalScale
        const wheelRadius = corner.wheelRadius * verticalScale
        const minDrop = Math.max(0, suspensionRestLength - suspensionTravel)
        const maxDrop = suspensionRestLength + suspensionTravel
        const targetDrop = Math.max(minDrop, Math.min(maxDrop, anchorWorldY - (terrainY + wheelRadius)))
        return [anchorWorldX, anchorWorldY - targetDrop, anchorWorldZ] as [number, number, number]
      })
    }
    return rigCorners.map((corner) => {
      const wheel = spawnState.corners[corner.id]?.wheel
      if (!wheel) {
        return [startPosition.x, startPosition.y, startPosition.z] as [number, number, number]
      }
      return [wheel.translation[0], wheel.translation[1], wheel.translation[2]] as [number, number, number]
    })
  }, [map, rigCorners, spawnState.corners, startPosition.x, startPosition.y, startPosition.z, startYaw, useNativeRigMotion, vehiclePhysicsTuning.scale, wheelAnchors])
  const wheelContactPoints = useMemo(
    () =>
      rigCorners.map((corner, index) => {
        const anchor = wheelAnchors[index] ?? [0, -0.12, 0]
        return {
          x: anchor[0],
          y: anchor[1],
          z: anchor[2],
          axle: anchor[2] >= 0 ? ('front' as const) : ('rear' as const),
          side: corner.side,
        }
      }),
    [rigCorners, wheelAnchors],
  )
  const activeWheelContactPoints = useMemo(() => {
    const frontContacts = wheelContactPoints.filter((point) => point.axle === 'front')
    const rearContacts = wheelContactPoints.filter((point) => point.axle === 'rear')
    const averagePoint = (points: typeof wheelContactPoints, fallbackAxle: 'front' | 'rear') => {
      if (points.length === 0) {
        return { x: 0, y: -0.12, z: fallbackAxle === 'front' ? 1 : -1, axle: fallbackAxle, side: 'left' as const }
      }
      const sum = points.reduce(
        (acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y, z: acc.z + point.z }),
        { x: 0, y: 0, z: 0 },
      )
      return {
        x: sum.x / points.length,
        y: sum.y / points.length,
        z: sum.z / points.length,
        axle: fallbackAxle,
        side: 'left' as const,
      }
    }
    const frontCenter = averagePoint(frontContacts, 'front')
    const rearCenter = averagePoint(rearContacts, 'rear')

    if (vehiclePhysicsMode === 'one_wheel') {
      return [frontCenter]
    }
    if (vehiclePhysicsMode === 'two_wheel') {
      return [frontCenter, rearCenter]
    }
    return wheelContactPoints
  }, [vehiclePhysicsMode, wheelContactPoints])
  const wheelRuntimeProps = useMemo(
    () => {
      const [rawSx, rawSy] = vehiclePhysicsTuning.scale
      const lateralScale = Math.max(0.7, Math.abs(rawSx) > 1e-4 ? Math.abs(rawSx) : 1)
      const verticalScale = Math.max(0.7, Math.abs(rawSy) > 1e-4 ? Math.abs(rawSy) : 1)
      return rigCorners.map((corner) => ({
        mass: corner.wheelMass,
        halfHeight: Math.max(0.1, Math.min(0.24, corner.wheelWidth * lateralScale * 0.5)),
        radius: Math.max(0.18, Math.min(0.42, corner.wheelRadius * verticalScale)),
        friction: corner.wheelFriction,
        restitution: corner.wheelRestitution,
      }))
    },
    [rigCorners, vehiclePhysicsTuning.scale],
  )
  const frontLeftCornerId = useMemo(
    () =>
      rigCorners.find((corner, index) => corner.side === 'left' && (wheelAnchors[index]?.[2] ?? 0) >= 0)?.id ??
      rigCorners[0]?.id ??
      'front-left',
    [rigCorners, wheelAnchors],
  )
  const frontRightCornerId = useMemo(
    () =>
      rigCorners.find((corner, index) => corner.side === 'right' && (wheelAnchors[index]?.[2] ?? 0) >= 0)?.id ??
      rigCorners[1]?.id ??
      'front-right',
    [rigCorners, wheelAnchors],
  )
  const avgFrontWheelRadius = useMemo(() => {
    const frontRadii = wheelRuntimeProps
      .filter((_, index) => (wheelAnchors[index]?.[2] ?? 0) >= 0)
      .map((wheel) => wheel.radius)
    if (frontRadii.length === 0) {
      return wheelRuntimeProps[0]?.radius ?? 0.22
    }
    return frontRadii.reduce((sum, radius) => sum + radius, 0) / frontRadii.length
  }, [wheelAnchors, wheelRuntimeProps])
  const chassisRealityProfile = useMemo(() => {
    const [sx, sy, sz] = vehiclePhysicsTuning.scale
    return {
      halfExtents: [0.56 * Math.abs(sx), 0.28 * Math.abs(sy), 1.12 * Math.abs(sz)] as const,
      offset: [0, 0.12 * sy, 0] as const,
    }
  }, [vehiclePhysicsTuning.scale])

  useEffect(() => {
    wheelBodyRefs.current.length = rigCorners.length
  }, [rigCorners.length])

  useEffect(() => {
    const body = bodyRef.current
    if (!body) {
      return
    }
    body.setGravityScale(useNativeRigMotion ? NATIVE_RIG_GRAVITY_SCALE : 1, true)
  }, [useNativeRigMotion])

  // Emergency stabilization mode: wheel rigidbodies are decoupled from chassis physics.

  useEffect(() => {
    const body = bodyRef.current
    if (!body) {
      return
    }

    body.setTranslation(startPosition, true)
    body.setLinvel({ x: 0, y: 0, z: 0 }, true)
    body.setAngvel({ x: 0, y: 0, z: 0 }, true)
    body.setRotation({ x: 0, y: Math.sin(startYaw / 2), z: 0, w: Math.cos(startYaw / 2) }, true)
    wheelBodyRefs.current.forEach((wheel, idx) => {
      const wheelPos = wheelStartPositions[idx]
      if (!wheel || !wheelPos) {
        return
      }
      wheel.setTranslation({ x: wheelPos[0], y: wheelPos[1], z: wheelPos[2] }, true)
      wheel.setLinvel({ x: 0, y: 0, z: 0 }, true)
      wheel.setAngvel({ x: 0, y: 0, z: 0 }, true)
      wheel.setRotation({ x: 0, y: Math.sin(startYaw / 2), z: 0, w: Math.cos(startYaw / 2) }, true)
    })
    shakeStrengthRef.current = 0
    sparkStrengthRef.current = 0
    sputterTimerRef.current = 0
    sputterActiveRef.current = false
    steerAngleRef.current = 0
    yawRateRef.current = 0
    lastYawRef.current = startYaw
    stuckSteerTimerRef.current = 0
    hardContactCountRef.current = 0
    scrapeDamageTimerRef.current = 0
    armorTimerRef.current = 0
    jumpCooldownTimerRef.current = 0
    jumpGuardTimerRef.current = 0
    jumpHeldRef.current = false
    telemetryTimerRef.current = 0
    wheelDebugTimerRef.current = 0
    visualFrontLeftSteerRef.current = 0
    visualFrontRightSteerRef.current = 0
    visualWheelSpinRef.current = 0
    const resetVisualWheelPositions = rigCorners.map<[number, number, number]>((corner, index) => {
      const fallback = DEFAULT_DEBUG_WHEEL_POSITIONS[index] ?? [0, 0, 0]
      return [corner.localAnchor[0] ?? fallback[0], corner.localAnchor[1] ?? fallback[1], corner.localAnchor[2] ?? fallback[2]]
    })
    visualWheelPositionsRef.current = resetVisualWheelPositions
    visualUpdateTimerRef.current = 0
    lastGroundedAtRef.current = performance.now() / 1000
    zoneDamageRef.current = { front: 0, rear: 0, left: 0, right: 0 }
    zoneStateRef.current = { front: 'intact', rear: 'intact', left: 'intact', right: 'intact' }
    disabledEmittedRef.current = false
    nanGuardTripsRef.current = 0
    speedClampTripsRef.current = 0
    outOfBoundsTimerRef.current = 0
    setTelemetry(0, 0)
      setPhysicsTelemetry({
      motionMode: vehicleMotionMode,
      driveMode: vehicleDefinition.drivetrain.layout,
      speedKph: 0,
      steeringDeg: 0,
      slipRatio: 0,
      jumpState: 'grounded',
      jumpCooldownRemaining: 0,
      latestImpactImpulse: 0,
      latestImpactTier: 'minor',
      latestImpactMaterial: 'rubber',
      hardContactCount: 0,
      nanGuardTrips: 0,
      speedClampTrips: 0,
      wheelDebugRows: rigCorners.map((corner) => `${corner.id}: reset`),
    })
    smoothedPosRef.current.set(startPosition.x, startPosition.y, startPosition.z)
    smoothedForwardRef.current.set(Math.sin(startYaw), 0, Math.cos(startYaw))
    smoothedTargetRef.current.set(
      startPosition.x + Math.sin(startYaw) * CAMERA_LOOK_AHEAD,
      startPosition.y + 1.3,
      startPosition.z + Math.cos(startYaw) * CAMERA_LOOK_AHEAD,
    )
    orbitYawRef.current = 0
    orbitPitchRef.current = 0
    orbitDragPointerIdRef.current = null
  }, [restartToken, rigCorners, setPhysicsTelemetry, setTelemetry, startPosition, startYaw, vehicleDefinition.drivetrain.layout, vehicleMotionMode, wheelStartPositions])

  useEffect(() => {
    return bindKeyboardControls(inputRef, setKeyboardInput)
  }, [setKeyboardInput])

  useEffect(() => {
    setEngineMuted(engineMuted)
  }, [engineMuted])

  useEffect(() => {
    return bindGamepadConnectionState(activeGamepadIndexRef, setGamepadConnected)
  }, [setGamepadConnected])

  useEffect(() => {
    return () => {
      stopEngineSound()
    }
  }, [])

  useEffect(() => {
    const element = gl.domElement
    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault()
    }
    const onPointerDown = (event: PointerEvent) => {
      const isRightMouse = event.pointerType === 'mouse' && event.button === 2
      const isTouchDrag = event.pointerType === 'touch'
      if (!isRightMouse && !isTouchDrag) {
        return
      }
      if (orbitDragPointerIdRef.current !== null) {
        return
      }
      orbitDragPointerIdRef.current = event.pointerId
      orbitLastClientXRef.current = event.clientX
      orbitLastClientYRef.current = event.clientY
      if (element.setPointerCapture) {
        element.setPointerCapture(event.pointerId)
      }
      event.preventDefault()
    }
    const onPointerMove = (event: PointerEvent) => {
      if (orbitDragPointerIdRef.current !== event.pointerId) {
        return
      }
      const dx = event.clientX - orbitLastClientXRef.current
      const dy = event.clientY - orbitLastClientYRef.current
      orbitLastClientXRef.current = event.clientX
      orbitLastClientYRef.current = event.clientY
      orbitYawRef.current -= dx * 0.006
      orbitPitchRef.current = Math.max(-0.22, Math.min(0.92, orbitPitchRef.current + dy * 0.004))
      event.preventDefault()
    }
    const onPointerEnd = (event: PointerEvent) => {
      if (orbitDragPointerIdRef.current !== event.pointerId) {
        return
      }
      orbitDragPointerIdRef.current = null
      if (element.releasePointerCapture) {
        element.releasePointerCapture(event.pointerId)
      }
      event.preventDefault()
    }

    element.addEventListener('contextmenu', onContextMenu)
    element.addEventListener('pointerdown', onPointerDown)
    element.addEventListener('pointermove', onPointerMove)
    element.addEventListener('pointerup', onPointerEnd)
    element.addEventListener('pointercancel', onPointerEnd)
    return () => {
      element.removeEventListener('contextmenu', onContextMenu)
      element.removeEventListener('pointerdown', onPointerDown)
      element.removeEventListener('pointermove', onPointerMove)
      element.removeEventListener('pointerup', onPointerEnd)
      element.removeEventListener('pointercancel', onPointerEnd)
    }
  }, [gl])

  useBeforePhysicsStep((world) => {
    const body = bodyRef.current
    if (!body) {
      return
    }

    syncGamepadInput(activeGamepadIndexRef)
    const delta = Math.max(1 / 240, Math.min(world.timestep || 1 / 60, 1 / 60))
    const input = getMergedInput(inputRef.current)
    if (
      !ensureFinitePhysicsState({
        body,
        startPosition,
        startYaw,
        hardContactCountRef,
        nanGuardTripsRef,
        speedClampTripsRef,
        setTelemetry,
        setPhysicsTelemetry,
      })
    ) {
      return
    }
    clampExcessMotion(body, speedClampTripsRef)

    const pos = body.translation()
    const maxOutOfBounds = map.worldHalf * 1.08
    if (Math.abs(pos.x) > maxOutOfBounds || Math.abs(pos.z) > maxOutOfBounds) {
      outOfBoundsTimerRef.current += delta
      if (outOfBoundsTimerRef.current < 0.35) {
        return
      }
      resetBodyPoseAndTelemetry({
        body,
        startPosition,
        startYaw,
        hardContactCountRef,
        nanGuardTripsRef,
        speedClampTripsRef,
        setTelemetry,
        setPhysicsTelemetry,
        yawRateRef,
        steerAngleRef,
        lastYawRef,
        stuckSteerTimerRef,
        smoothedPosRef,
        smoothedForwardRef,
        smoothedTargetRef,
        cameraLookAhead: CAMERA_LOOK_AHEAD,
      })
      triggerHitFx(0.22, 'Back on road')
      onPlayerPosition([startPosition.x, startPosition.y, startPosition.z])
      return
    }
    outOfBoundsTimerRef.current = 0
    if (status === 'lost') {
      setTelemetry(0, 0)
      setPhysicsTelemetry({
        speedKph: 0,
        steeringDeg: 0,
        slipRatio: 0,
        jumpState: 'grounded',
        jumpCooldownRemaining: jumpCooldownTimerRef.current,
        hardContactCount: hardContactCountRef.current,
        nanGuardTrips: nanGuardTripsRef.current,
        speedClampTrips: speedClampTripsRef.current,
      })
      updateEngineSound({ speed: 0, throttle: 0, direction: 'idle', surface: 'road', tone: vehiclePhysicsTuning.engineTone })
      if (input.restart) {
        restartRun()
      }
      return
    }

    const driveCommand = buildDriveCommand(vehicleDefinition, input)
    const rot = body.rotation()
    const bodyPosNow = body.translation()
    const [, sy] = vehiclePhysicsTuning.scale
    const safeSy = Math.abs(sy) > 1e-4 ? sy : 1
    tempBodyPosVec.set(bodyPosNow.x, bodyPosNow.y, bodyPosNow.z)
    tempBodyQuat.set(rot.x, rot.y, rot.z, rot.w)
    tempVec.set(0, 1, 0).applyQuaternion(tempBodyQuat)
    const bodyUp = { x: tempVec.x, y: tempVec.y, z: tempVec.z }
    for (let i = 0; i < rigCorners.length; i += 1) {
      const wheelBody = wheelBodyRefs.current[i]
      const anchor = wheelAnchors[i]
      if (!wheelBody || !anchor) {
        continue
      }
      tempAnchorWorld.set(anchor[0], anchor[1], anchor[2]).applyQuaternion(tempBodyQuat).add(tempBodyPosVec)
      if (useNativeRigMotion) {
        const wheelRuntime = wheelRuntimeProps[i]
        const suspensionRestLength = (rigCorners[i]?.suspension.restLength ?? 0.18) * Math.max(0.7, safeSy)
        const suspensionTravel = (rigCorners[i]?.suspension.travel ?? 0.2) * Math.max(0.7, safeSy)
        const terrainY = map.shape === 'ring' ? 0 : sampleTerrainHeight(map, tempAnchorWorld.x, tempAnchorWorld.z)
        const wheelRadius = wheelRuntime?.radius ?? 0.22
        const minDrop = Math.max(0, suspensionRestLength - suspensionTravel)
        const maxDrop = suspensionRestLength + suspensionTravel
        const targetDrop = Math.max(minDrop, Math.min(maxDrop, tempAnchorWorld.y - (terrainY + wheelRadius)))
        wheelBody.setNextKinematicTranslation({
          x: tempAnchorWorld.x - bodyUp.x * targetDrop,
          y: tempAnchorWorld.y - bodyUp.y * targetDrop,
          z: tempAnchorWorld.z - bodyUp.z * targetDrop,
        })
      } else {
        wheelBody.setNextKinematicTranslation({ x: tempAnchorWorld.x, y: tempAnchorWorld.y, z: tempAnchorWorld.z })
      }
      wheelBody.setNextKinematicRotation(rot)
    }
    const localYaw = Math.atan2(2 * (rot.w * rot.y + rot.x * rot.z), 1 - 2 * (rot.y * rot.y + rot.z * rot.z))
    const rawVel = body.linvel()
    const wheelTargets = buildWheelTorqueTargets(vehicleDefinition, driveCommand)
    const frontLeftTarget = wheelTargets.find((target) => target.wheelId === frontLeftCornerId)
    const frontRightTarget = wheelTargets.find((target) => target.wheelId === frontRightCornerId)
    const targetFrontLeftSteer = Number.isFinite(frontLeftTarget?.steerAngleRad) ? (frontLeftTarget?.steerAngleRad ?? 0) : 0
    const targetFrontRightSteer = Number.isFinite(frontRightTarget?.steerAngleRad) ? (frontRightTarget?.steerAngleRad ?? 0) : 0
    const steeringVisualBlend = 1 - Math.exp(-delta * 8.4)
    visualFrontLeftSteerRef.current += (targetFrontLeftSteer - visualFrontLeftSteerRef.current) * steeringVisualBlend
    visualFrontRightSteerRef.current += (targetFrontRightSteer - visualFrontRightSteerRef.current) * steeringVisualBlend
    let wheelDebugSnapshot = applyWheelActuation({
      map,
      chassisYaw: localYaw,
      chassisLinVel: rawVel,
      wheelTargets,
      wheelActuators: rigCorners.map((corner, index) => ({
        wheelId: corner.id,
        body: wheelBodyRefs.current[index] ?? null,
        radius: wheelRuntimeProps[index]?.radius ?? corner.wheelRadius ?? 0.22,
        axle: (wheelAnchors[index]?.[2] ?? 0) >= 0 ? 'front' : 'rear',
        side: corner.side,
        suspensionRestLength: corner.suspension.restLength * Math.max(0.7, safeSy),
        suspensionTravel: corner.suspension.travel * Math.max(0.7, safeSy),
        suspensionAnchorWorld: (() => {
          const anchor = wheelAnchors[index]
          if (!anchor) {
            return { x: bodyPosNow.x, y: bodyPosNow.y, z: bodyPosNow.z }
          }
          tempAnchorWorld.set(anchor[0], anchor[1], anchor[2]).applyQuaternion(tempBodyQuat).add(tempBodyPosVec)
          return { x: tempAnchorWorld.x, y: tempAnchorWorld.y, z: tempAnchorWorld.z }
        })(),
        suspensionAxisWorld: bodyUp,
      })),
    })
    let realityMetrics = measureRealityMetrics({
      body,
      map,
      motionMode: vehicleMotionMode,
      wheelBodies: wheelBodyRefs.current,
      wheelRadii: wheelRuntimeProps.map((wheel) => wheel.radius),
      wheelSamples: wheelDebugSnapshot.runtime.wheelSamples,
      chassisHalfExtents: chassisRealityProfile.halfExtents,
      chassisOffset: chassisRealityProfile.offset,
    })
    const realityLiftCorrectionM = useNativeRigMotion ? getRealityLiftCorrectionM(realityMetrics) : 0
    if (realityLiftCorrectionM > 0.001) {
      const realityLiftBiasM = 0.004
      const liftedBodyPos = body.translation()
      body.setTranslation(
        {
          x: liftedBodyPos.x,
          y: liftedBodyPos.y + realityLiftCorrectionM + realityLiftBiasM,
          z: liftedBodyPos.z,
        },
        true,
      )
      const liftedLinVel = body.linvel()
      const correctedVerticalSpeed = liftedLinVel.y <= 0 ? 0 : Math.min(0.08, liftedLinVel.y * 0.18)
      if (correctedVerticalSpeed !== liftedLinVel.y) {
        body.setLinvel({ x: liftedLinVel.x, y: correctedVerticalSpeed, z: liftedLinVel.z }, true)
      }
      for (const wheelBody of wheelBodyRefs.current) {
        if (!wheelBody) {
          continue
        }
        const wheelPos = wheelBody.translation()
        const nextWheelPos = {
          x: wheelPos.x,
          y: wheelPos.y + realityLiftCorrectionM + realityLiftBiasM,
          z: wheelPos.z,
        }
        wheelBody.setTranslation(nextWheelPos, true)
        wheelBody.setNextKinematicTranslation(nextWheelPos)
      }
      wheelDebugSnapshot = applyWheelActuation({
        map,
        chassisYaw: localYaw,
        chassisLinVel: body.linvel(),
        wheelTargets,
        wheelActuators: rigCorners.map((corner, index) => ({
          wheelId: corner.id,
          body: wheelBodyRefs.current[index] ?? null,
          radius: wheelRuntimeProps[index]?.radius ?? corner.wheelRadius ?? 0.22,
          axle: (wheelAnchors[index]?.[2] ?? 0) >= 0 ? 'front' : 'rear',
          side: corner.side,
          suspensionRestLength: corner.suspension.restLength * Math.max(0.7, safeSy),
          suspensionTravel: corner.suspension.travel * Math.max(0.7, safeSy),
          suspensionAnchorWorld: (() => {
            const anchor = wheelAnchors[index]
            if (!anchor) {
              const liftedPos = body.translation()
              return { x: liftedPos.x, y: liftedPos.y, z: liftedPos.z }
            }
            const liftedPos = body.translation()
            tempBodyPosVec.set(liftedPos.x, liftedPos.y, liftedPos.z)
            tempAnchorWorld.set(anchor[0], anchor[1], anchor[2]).applyQuaternion(tempBodyQuat).add(tempBodyPosVec)
            return { x: tempAnchorWorld.x, y: tempAnchorWorld.y, z: tempAnchorWorld.z }
          })(),
          suspensionAxisWorld: bodyUp,
        })),
      })
      realityMetrics = measureRealityMetrics({
        body,
        map,
        motionMode: vehicleMotionMode,
        wheelBodies: wheelBodyRefs.current,
        wheelRadii: wheelRuntimeProps.map((wheel) => wheel.radius),
        wheelSamples: wheelDebugSnapshot.runtime.wheelSamples,
        chassisHalfExtents: chassisRealityProfile.halfExtents,
        chassisOffset: chassisRealityProfile.offset,
      })
    }
    wheelDebugTimerRef.current += delta
    if (wheelDebugTimerRef.current >= 0.12) {
      wheelDebugTimerRef.current = 0
      setPhysicsTelemetry({
        motionMode: vehicleMotionMode,
        driveMode: vehicleDefinition.drivetrain.layout,
        wheelDebugRows: wheelDebugSnapshot.rows,
        realityMetrics,
      })
    }
    const step = runVehicleDynamicsStep({
      body,
      delta,
      damage,
      map,
      input,
      vehiclePhysicsTuning,
      armorTimerRef,
      sputterTimerRef,
      sputterActiveRef,
      steerAngleRef,
      yawRateRef,
      lastYawRef,
      stuckSteerTimerRef,
      hardContactCountRef,
      scrapeDamageTimerRef,
      jumpCooldownTimerRef,
      jumpGuardTimerRef,
      jumpHeldRef,
      lastGroundedAtRef,
      nanGuardTripsRef,
      speedClampTripsRef,
      setTelemetry,
      setPhysicsTelemetry,
      onPlayerPosition,
      addDamage,
      triggerHitFx,
      getImpactLabel,
      driveCommand,
      wheelContactPoints: useNativeRigMotion ? wheelContactPoints : activeWheelContactPoints,
      wheelActuationRuntime: wheelDebugSnapshot.runtime,
      physicsMode: vehiclePhysicsMode,
      motionMode: vehicleMotionMode,
      telemetryTimerRef,
    })
    const stepForwardSpeed = step.nextVx * step.forwardX + step.nextVz * step.forwardZ
    visualWheelSpinRef.current += (stepForwardSpeed / Math.max(0.14, avgFrontWheelRadius)) * delta
    tempBodyPos.set(step.pos.x, step.pos.y, step.pos.z)
    processNearbyPickups({
      pickups,
      tempVec,
      tempBodyPos,
      armorTimerRef,
      addScore,
      repair,
      triggerHitFx,
      playPickupSound,
      onCollectPickup,
    })
  })

  useFrame((state, delta) => {
    const body = bodyRef.current
    if (!body) {
      return
    }

    const renderDelta = Math.min(delta, MAX_RENDER_DELTA)
    if (typeof navigator !== 'undefined' && navigator.getGamepads) {
      const activeIdx = activeGamepadIndexRef.current
      const pads = navigator.getGamepads()
      const gamepad =
        activeIdx !== null && pads[activeIdx] && pads[activeIdx]?.connected
          ? pads[activeIdx]
          : Array.from(pads).find((pad) => Boolean(pad && pad.connected)) ?? null
      if (gamepad) {
        const lookX = gamepad.axes[2] ?? 0
        const lookY = gamepad.axes[3] ?? 0
        const deadzone = 0.16
        const applyDeadzone = (value: number) => {
          const magnitude = Math.abs(value)
          if (magnitude <= deadzone) {
            return 0
          }
          const normalized = (magnitude - deadzone) / (1 - deadzone)
          return Math.sign(value) * normalized
        }
        const yawInput = applyDeadzone(lookX)
        const pitchInput = applyDeadzone(lookY)
        if (yawInput !== 0 || pitchInput !== 0) {
          orbitYawRef.current -= yawInput * renderDelta * 2.05
          orbitPitchRef.current = Math.max(-0.22, Math.min(0.92, orbitPitchRef.current + pitchInput * renderDelta * 1.45))
        }
      }
    }

    const bodyWorldPos = body.translation()
    const bodyWorldRot = body.rotation()
    const bodyLinVel = body.linvel()
    const bodyYaw = Math.atan2(
      2 * (bodyWorldRot.w * bodyWorldRot.y + bodyWorldRot.x * bodyWorldRot.z),
      1 - 2 * (bodyWorldRot.y * bodyWorldRot.y + bodyWorldRot.z * bodyWorldRot.z),
    )
    const forwardX = Math.sin(bodyYaw)
    const forwardZ = Math.cos(bodyYaw)
    const [sx, sy, sz] = vehiclePhysicsTuning.scale
    const safeSx = Math.abs(sx) > 1e-4 ? sx : 1
    const safeSy = Math.abs(sy) > 1e-4 ? sy : 1
    const safeSz = Math.abs(sz) > 1e-4 ? sz : 1
    tempBodyPosVec.set(bodyWorldPos.x, bodyWorldPos.y, bodyWorldPos.z)
    tempBodyQuat.set(bodyWorldRot.x, bodyWorldRot.y, bodyWorldRot.z, bodyWorldRot.w)
    tempBodyQuatInv.copy(tempBodyQuat).invert()
    const debugWheelPositions = rigCorners.map<[number, number, number]>((_, index) => {
      const wheelBody = wheelBodyRefs.current[index]
      if (!wheelBody) {
        return visualWheelPositionsRef.current[index] ?? visualWheelState.debugWheelPositions[index] ?? DEFAULT_DEBUG_WHEEL_POSITIONS[index] ?? [0, 0, 0]
      }
      const wp = wheelBody.translation()
      tempWorldWheel.set(wp.x, wp.y, wp.z)
      tempLocalWheel.copy(tempWorldWheel).sub(tempBodyPosVec).applyQuaternion(tempBodyQuatInv)
      const anchorLocal = rigCorners[index]?.localAnchor ?? ([0, 0, 0] as const)
      const rawPosition: [number, number, number] = [
        tempLocalWheel.x / safeSx,
        tempLocalWheel.y / safeSy,
        tempLocalWheel.z / safeSz,
      ]
      const clampedPosition: [number, number, number] = [
        Math.max(anchorLocal[0] - NATIVE_RIG_VISUAL_WHEEL_LATERAL_LIMIT, Math.min(anchorLocal[0] + NATIVE_RIG_VISUAL_WHEEL_LATERAL_LIMIT, rawPosition[0])),
        rawPosition[1],
        Math.max(
          anchorLocal[2] - NATIVE_RIG_VISUAL_WHEEL_LONGITUDINAL_LIMIT,
          Math.min(anchorLocal[2] + NATIVE_RIG_VISUAL_WHEEL_LONGITUDINAL_LIMIT, rawPosition[2]),
        ),
      ]
      const previous = visualWheelPositionsRef.current[index] ?? rawPosition
      const smoothing = 1 - Math.exp(-renderDelta * NATIVE_RIG_VISUAL_WHEEL_SMOOTHING)
      const smoothed: [number, number, number] = [
        previous[0] + (clampedPosition[0] - previous[0]) * smoothing,
        previous[1] + (clampedPosition[1] - previous[1]) * smoothing,
        previous[2] + (clampedPosition[2] - previous[2]) * smoothing,
      ]
      visualWheelPositionsRef.current[index] = smoothed
      return smoothed
    })
    visualUpdateTimerRef.current += renderDelta
    if (visualUpdateTimerRef.current >= 0.08) {
      visualUpdateTimerRef.current = 0
      setVisualWheelState({
        frontLeftSteer: visualFrontLeftSteerRef.current,
        frontRightSteer: visualFrontRightSteerRef.current,
        spin: visualWheelSpinRef.current,
        debugWheelPositions,
      })
    }

    updateCameraAndDamageVisuals({
      delta: renderDelta,
      nowSec: state.clock.elapsedTime,
      damage,
      yaw: bodyYaw,
      forwardX,
      forwardZ,
      pos: bodyWorldPos,
      nextVx: bodyLinVel.x,
      nextVz: bodyLinVel.z,
      camera,
      tempBodyPos,
      tempVec,
      tempCamTarget,
      tempCamPosition,
      smoothedPosRef,
      smoothedForwardRef,
      smoothedTargetRef,
      shakeStrengthRef,
      sparkStrengthRef,
      hitSparkRef,
      bumperRef,
      loosePanelRef,
      hoodRef,
      roofRef,
      leftDoorRef,
      rightDoorRef,
      cameraFollowDistance: CAMERA_FOLLOW_DISTANCE,
      cameraFollowHeight: CAMERA_FOLLOW_HEIGHT,
      cameraLookAhead: CAMERA_LOOK_AHEAD,
      orbitYawRad: orbitYawRef.current,
      orbitPitchRad: orbitPitchRef.current,
    })
  })

  return (
    <>
    <RigidBody
      ref={bodyRef}
      name={PLAYER_BODY_NAME}
      colliders={false}
      position={[startPosition.x, startPosition.y, startPosition.z]}
      enabledRotations={[true, true, true]}
      ccd
      angularDamping={3.2}
      linearDamping={0.28}
      mass={vehiclePhysicsTuning.mass}
      onCollisionEnter={(payload) => {
        if (status === 'lost') {
          return
        }

        const now = performance.now()
        if (now - lastDamageAt.current < 350) {
          return
        }

        const body = bodyRef.current
        if (!body) {
          return
        }

        const otherBodyName = payload.other.rigidBodyObject?.name ?? ''
        if (otherBodyName.startsWith('terrain-')) {
          return
        }
        const hitAt = handlePlayerCollisionEnter({
          body,
          otherBody: payload.other.rigidBody,
          otherBodyName,
          otherPosition: payload.other.rigidBody?.translation?.(),
          now,
          damage,
          armorTimerRef,
          vehicleDamageTakenMult: vehiclePhysicsTuning.damageTakenMult,
          zoneDamageRef,
          zoneStateRef,
          disabledEmittedRef,
          hardContactCountRef,
          nanGuardTripsRef,
          speedClampTripsRef,
          shakeStrengthRef,
          sparkStrengthRef,
          addDamage,
          triggerHitFx,
          setPhysicsTelemetry,
        })
        if (hitAt !== undefined) {
          lastDamageAt.current = hitAt
        }
      }}
      onCollisionExit={(payload) => {
        handlePlayerCollisionExit({
          otherName: payload.other.rigidBodyObject?.name ?? '',
          hardContactCountRef,
          nanGuardTripsRef,
          speedClampTripsRef,
          setPhysicsTelemetry,
        })
      }}
    >
      <group scale={vehiclePhysicsTuning.scale}>
        <CuboidCollider args={[0.56, 0.28, 1.12]} position={[0, 0.12, 0]} collisionGroups={PLAYER_COLLISION_MASK} />
        <CarModel
          bodyColor={palette.body}
          accentColor={palette.accent}
          damage={damage}
          lowPowerMode={lowPowerMode}
          showTrail
          crackOpacity={crackOpacity}
          renderMode={renderMode}
          wireframe={renderWireframe}
          physicsDebugView
          oneWheelDebugView={oneWheelModel}
          frontLeftSteerRad={visualWheelState.frontLeftSteer}
          frontRightSteerRad={visualWheelState.frontRightSteer}
          wheelSpinRad={visualWheelState.spin}
          debugWheelPositions={visualWheelState.debugWheelPositions}
          bumperRef={bumperRef}
          loosePanelRef={loosePanelRef}
          hoodRef={hoodRef}
          roofRef={roofRef}
          leftDoorRef={leftDoorRef}
          rightDoorRef={rightDoorRef}
        />
      </group>
      {damage >= 70 && damage < MAX_DAMAGE ? (
        <group position={[0, 1.05, -0.8]}>
          <mesh>
            <sphereGeometry args={[0.35, 10, 10]} />
            <meshStandardMaterial color="#4f4f4f" transparent opacity={0.5} />
          </mesh>
          <mesh position={[0.25, 0.35, -0.05]}>
            <sphereGeometry args={[0.22, 10, 10]} />
            <meshStandardMaterial color="#6a6a6a" transparent opacity={0.35} />
          </mesh>
        </group>
      ) : null}
      {lowPowerMode ? null : (
        <group ref={hitSparkRef} position={[0, 0.55, -0.05]} visible={false}>
          <Sparkles count={12} scale={1.8} size={8} speed={2.4} color="#ffe29f" />
        </group>
      )}
    </RigidBody>
    {rigCorners.map((corner, index) => {
      const wheelStartPosition = wheelStartPositions[index] ?? [startPosition.x, startPosition.y, startPosition.z]
      const wheelRuntime = wheelRuntimeProps[index]
      return (
        <RigidBody
          key={`wheel-${corner.id}`}
          ref={(el) => {
            wheelBodyRefs.current[index] = el
          }}
          type="kinematicPosition"
          colliders={false}
          position={wheelStartPosition}
          mass={wheelRuntime?.mass ?? Math.max(0.04, vehiclePhysicsTuning.mass * 0.03)}
          enabledRotations={[true, false, false]}
          linearDamping={1.8}
          angularDamping={6.1}
          ccd
          canSleep={false}
        >
          <CylinderCollider
            args={[wheelRuntime?.halfHeight ?? 0.14, wheelRuntime?.radius ?? 0.22]}
            rotation={[0, 0, Math.PI / 2]}
            sensor
            friction={wheelRuntime?.friction ?? 2.1}
            restitution={0}
          />
          <mesh castShadow receiveShadow rotation={[0, 0, Math.PI / 2]} visible={false}>
            <cylinderGeometry
              args={[
                wheelRuntime?.radius ?? 0.22,
                wheelRuntime?.radius ?? 0.22,
                (wheelRuntime?.halfHeight ?? 0.14) * 2,
                18,
              ]}
            />
            <meshStandardMaterial color="#1d2127" roughness={0.85} metalness={0.05} />
          </mesh>
        </RigidBody>
      )
    })}
    </>
  )
}

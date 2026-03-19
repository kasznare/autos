import { Sparkles } from '@react-three/drei'
import { CuboidCollider, CylinderCollider, RapierRigidBody, RigidBody } from '@react-three/rapier'
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
import { fromLegacyVehicleSpec } from './vehicle/definitions'
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

type DebugWheelPositions = [[number, number, number], [number, number, number], [number, number, number], [number, number, number]]

export const PlayerCar = ({ pickups, onCollectPickup, onPlayerPosition, lowPowerMode = false }: PlayerCarProps) => {
  const bodyRef = useRef<RapierRigidBody>(null!)
  const wheelFlRef = useRef<RapierRigidBody>(null!)
  const wheelFrRef = useRef<RapierRigidBody>(null!)
  const wheelRlRef = useRef<RapierRigidBody>(null!)
  const wheelRrRef = useRef<RapierRigidBody>(null!)
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
  const visualUpdateTimerRef = useRef(0)
  const [visualWheelState, setVisualWheelState] = useState<{
    frontLeftSteer: number
    frontRightSteer: number
    spin: number
    debugWheelPositions: DebugWheelPositions
  }>({
    frontLeftSteer: 0,
    frontRightSteer: 0,
    spin: 0,
    debugWheelPositions: [
      [-0.6, 0.04, 0.8],
      [0.6, 0.04, 0.8],
      [-0.6, 0.04, -0.8],
      [0.6, 0.04, -0.8],
    ],
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
  const vehicleSpec = useGameStore((state) => state.vehicleSpec)
  const renderMode = useGameStore((state) => state.renderMode)
  const renderWireframe = useGameStore((state) => state.renderWireframe)
  const vehiclePhysicsMode = useGameStore((state) => state.vehiclePhysicsMode)
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
  const oneWheelModel = map.sourceId === 'ramp' && vehiclePhysicsMode === 'one_wheel'
  const vehicleDefinition = useMemo(() => fromLegacyVehicleSpec('runtime-legacy-active', vehicleSpec), [vehicleSpec])
  const rigDefinition = useMemo(() => toVehicleRigDefinition(vehicleDefinition), [vehicleDefinition])
  const rigCorners = useMemo(
    () => rigDefinition.axles.flatMap((axle) => axle.corners),
    [rigDefinition.axles],
  )
  const crackOpacity = Math.min(0.72, Math.max(0, (damage - 38) / 62) * 0.72)
  const startPosition = useMemo(() => {
    const x = map.startPosition[0]
    const y =
      map.shape === 'ring'
        ? map.startPosition[1]
        : sampleTerrainHeight(map, x, map.startPosition[2]) + VEHICLE_PHYSICS.suspensionRideHeight + 0.06
    const z = map.startPosition[2]
    return { x, y, z }
  }, [map])
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
    return rigCorners.map((corner) => {
      const wheel = spawnState.corners[corner.id]?.wheel
      if (!wheel) {
        return [startPosition.x, startPosition.y, startPosition.z] as [number, number, number]
      }
      return [wheel.translation[0], wheel.translation[1], wheel.translation[2]] as [number, number, number]
    })
  }, [rigCorners, spawnState.corners, startPosition.x, startPosition.y, startPosition.z])
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
    () =>
      rigCorners.map((corner) => ({
        mass: corner.wheelMass,
        halfHeight: Math.max(0.1, Math.min(0.2, corner.wheelWidth * 0.58)),
        radius: Math.max(0.18, Math.min(0.3, corner.wheelRadius * 0.67)),
        friction: corner.wheelFriction,
        restitution: corner.wheelRestitution,
      })),
    [rigCorners],
  )

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
    const wheelRefs = [wheelFlRef, wheelFrRef, wheelRlRef, wheelRrRef]
    wheelRefs.forEach((wheelRef, idx) => {
      const wheel = wheelRef.current
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
  }, [restartToken, setPhysicsTelemetry, setTelemetry, startPosition, startYaw, wheelStartPositions])

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

  useFrame((state, delta) => {
    const body = bodyRef.current
    if (!body) {
      return
    }

    syncGamepadInput(activeGamepadIndexRef)
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
          orbitYawRef.current -= yawInput * delta * 2.05
          orbitPitchRef.current = Math.max(-0.22, Math.min(0.92, orbitPitchRef.current + pitchInput * delta * 1.45))
        }
      }
    }
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
      if (inputRef.current.restart) {
        restartRun()
      }
      return
    }

    const input = getMergedInput(inputRef.current)
    const driveCommand = buildDriveCommand(vehicleDefinition, input)
    const rot = body.rotation()
    const bodyPosNow = body.translation()
    tempBodyPosVec.set(bodyPosNow.x, bodyPosNow.y, bodyPosNow.z)
    tempBodyQuat.set(rot.x, rot.y, rot.z, rot.w)
    const wheelBodiesForFollow = [wheelFlRef.current, wheelFrRef.current, wheelRlRef.current, wheelRrRef.current]
    for (let i = 0; i < wheelBodiesForFollow.length; i += 1) {
      const wheelBody = wheelBodiesForFollow[i]
      const anchor = wheelAnchors[i]
      if (!wheelBody || !anchor) {
        continue
      }
      tempAnchorWorld.set(anchor[0], anchor[1], anchor[2]).applyQuaternion(tempBodyQuat).add(tempBodyPosVec)
      wheelBody.setNextKinematicTranslation({ x: tempAnchorWorld.x, y: tempAnchorWorld.y, z: tempAnchorWorld.z })
      wheelBody.setNextKinematicRotation(rot)
    }
    const localYaw = Math.atan2(2 * (rot.w * rot.y + rot.x * rot.z), 1 - 2 * (rot.y * rot.y + rot.z * rot.z))
    const rawVel = body.linvel()
    const wheelTargets = buildWheelTorqueTargets(vehicleDefinition, driveCommand)
    const frontLeftTarget = wheelTargets.find((target) => target.wheelId === (rigCorners[0]?.id ?? 'front-left'))
    const frontRightTarget = wheelTargets.find((target) => target.wheelId === (rigCorners[1]?.id ?? 'front-right'))
    const targetFrontLeftSteer = Number.isFinite(frontLeftTarget?.steerAngleRad) ? (frontLeftTarget?.steerAngleRad ?? 0) : 0
    const targetFrontRightSteer = Number.isFinite(frontRightTarget?.steerAngleRad) ? (frontRightTarget?.steerAngleRad ?? 0) : 0
    const steeringVisualBlend = 1 - Math.exp(-delta * 8.4)
    visualFrontLeftSteerRef.current += (targetFrontLeftSteer - visualFrontLeftSteerRef.current) * steeringVisualBlend
    visualFrontRightSteerRef.current += (targetFrontRightSteer - visualFrontRightSteerRef.current) * steeringVisualBlend
    const wheelDebugSnapshot = applyWheelActuation({
      map,
      chassisYaw: localYaw,
      chassisLinVel: rawVel,
      wheelTargets,
      wheelActuators: [
        {
          wheelId: rigCorners[0]?.id ?? 'front-left',
          body: wheelFlRef.current,
          radius: rigCorners[0]?.wheelRadius ?? 0.22,
          axle: (wheelAnchors[0]?.[2] ?? 0) >= 0 ? 'front' : 'rear',
          side: rigCorners[0]?.side ?? 'left',
        },
        {
          wheelId: rigCorners[1]?.id ?? 'front-right',
          body: wheelFrRef.current,
          radius: rigCorners[1]?.wheelRadius ?? 0.22,
          axle: (wheelAnchors[1]?.[2] ?? 0) >= 0 ? 'front' : 'rear',
          side: rigCorners[1]?.side ?? 'right',
        },
        {
          wheelId: rigCorners[2]?.id ?? 'rear-left',
          body: wheelRlRef.current,
          radius: rigCorners[2]?.wheelRadius ?? 0.22,
          axle: (wheelAnchors[2]?.[2] ?? 0) >= 0 ? 'front' : 'rear',
          side: rigCorners[2]?.side ?? 'left',
        },
        {
          wheelId: rigCorners[3]?.id ?? 'rear-right',
          body: wheelRrRef.current,
          radius: rigCorners[3]?.wheelRadius ?? 0.22,
          axle: (wheelAnchors[3]?.[2] ?? 0) >= 0 ? 'front' : 'rear',
          side: rigCorners[3]?.side ?? 'right',
        },
      ],
      delta,
    })
    wheelDebugTimerRef.current += delta
    if (wheelDebugTimerRef.current >= 0.12) {
      wheelDebugTimerRef.current = 0
      setPhysicsTelemetry({
        driveMode: '2wd-rwd',
        wheelDebugRows: wheelDebugSnapshot.rows,
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
      wheelContactPoints: activeWheelContactPoints,
      physicsMode: vehiclePhysicsMode,
      telemetryTimerRef,
    })
    const stepForwardSpeed = step.nextVx * step.forwardX + step.nextVz * step.forwardZ
    const avgFrontRadius =
      ((wheelRuntimeProps[0]?.radius ?? 0.22) + (wheelRuntimeProps[1]?.radius ?? 0.22)) * 0.5
    visualWheelSpinRef.current += (stepForwardSpeed / Math.max(0.14, avgFrontRadius)) * delta
    const bodyWorldPos = body.translation()
    const bodyWorldRot = body.rotation()
    tempBodyPosVec.set(bodyWorldPos.x, bodyWorldPos.y, bodyWorldPos.z)
    tempBodyQuat.set(bodyWorldRot.x, bodyWorldRot.y, bodyWorldRot.z, bodyWorldRot.w)
    tempBodyQuatInv.copy(tempBodyQuat).invert()
    const [sx, sy, sz] = vehiclePhysicsTuning.scale
    const safeSx = Math.abs(sx) > 1e-4 ? sx : 1
    const safeSy = Math.abs(sy) > 1e-4 ? sy : 1
    const safeSz = Math.abs(sz) > 1e-4 ? sz : 1
    const wheelBodies = [wheelFlRef.current, wheelFrRef.current, wheelRlRef.current, wheelRrRef.current]
    const debugWheelPositions: DebugWheelPositions = wheelBodies.map((wheelBody, index) => {
      if (!wheelBody) {
        return visualWheelState.debugWheelPositions[index] ?? [0, 0, 0]
      }
      const wp = wheelBody.translation()
      tempWorldWheel.set(wp.x, wp.y, wp.z)
      tempLocalWheel.copy(tempWorldWheel).sub(tempBodyPosVec).applyQuaternion(tempBodyQuatInv)
      return [
        tempLocalWheel.x / safeSx,
        tempLocalWheel.y / safeSy,
        tempLocalWheel.z / safeSz,
      ]
    }) as DebugWheelPositions
    visualUpdateTimerRef.current += delta
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
      delta,
      nowSec: state.clock.elapsedTime,
      damage,
      yaw: step.yaw,
      forwardX: step.forwardX,
      forwardZ: step.forwardZ,
      pos: step.pos,
      nextVx: step.nextVx,
      nextVz: step.nextVz,
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
    <RigidBody
      ref={wheelFlRef}
      type="kinematicPosition"
      colliders={false}
      position={wheelStartPositions[0]}
      mass={wheelRuntimeProps[0]?.mass ?? Math.max(0.04, vehiclePhysicsTuning.mass * 0.03)}
      enabledRotations={[true, false, false]}
      linearDamping={1.8}
      angularDamping={6.1}
      ccd
      canSleep={false}
    >
      <CylinderCollider
        args={[wheelRuntimeProps[0]?.halfHeight ?? 0.14, wheelRuntimeProps[0]?.radius ?? 0.22]}
        rotation={[0, 0, Math.PI / 2]}
        sensor
        friction={wheelRuntimeProps[0]?.friction ?? 2.1}
        restitution={0}
      />
      <mesh castShadow receiveShadow rotation={[0, 0, Math.PI / 2]} visible={false}>
        <cylinderGeometry
          args={[
            wheelRuntimeProps[0]?.radius ?? 0.22,
            wheelRuntimeProps[0]?.radius ?? 0.22,
            (wheelRuntimeProps[0]?.halfHeight ?? 0.14) * 2,
            18,
          ]}
        />
        <meshStandardMaterial color="#1d2127" roughness={0.85} metalness={0.05} />
      </mesh>
    </RigidBody>
    <RigidBody
      ref={wheelFrRef}
      type="kinematicPosition"
      colliders={false}
      position={wheelStartPositions[1]}
      mass={wheelRuntimeProps[1]?.mass ?? Math.max(0.04, vehiclePhysicsTuning.mass * 0.03)}
      enabledRotations={[true, false, false]}
      linearDamping={1.8}
      angularDamping={6.1}
      ccd
      canSleep={false}
    >
      <CylinderCollider
        args={[wheelRuntimeProps[1]?.halfHeight ?? 0.14, wheelRuntimeProps[1]?.radius ?? 0.22]}
        rotation={[0, 0, Math.PI / 2]}
        sensor
        friction={wheelRuntimeProps[1]?.friction ?? 2.1}
        restitution={0}
      />
      <mesh castShadow receiveShadow rotation={[0, 0, Math.PI / 2]} visible={false}>
        <cylinderGeometry
          args={[
            wheelRuntimeProps[1]?.radius ?? 0.22,
            wheelRuntimeProps[1]?.radius ?? 0.22,
            (wheelRuntimeProps[1]?.halfHeight ?? 0.14) * 2,
            18,
          ]}
        />
        <meshStandardMaterial color="#1d2127" roughness={0.85} metalness={0.05} />
      </mesh>
    </RigidBody>
    <RigidBody
      ref={wheelRlRef}
      type="kinematicPosition"
      colliders={false}
      position={wheelStartPositions[2]}
      mass={wheelRuntimeProps[2]?.mass ?? Math.max(0.04, vehiclePhysicsTuning.mass * 0.03)}
      enabledRotations={[true, false, false]}
      linearDamping={1.8}
      angularDamping={6.1}
      ccd
      canSleep={false}
    >
      <CylinderCollider
        args={[wheelRuntimeProps[2]?.halfHeight ?? 0.14, wheelRuntimeProps[2]?.radius ?? 0.22]}
        rotation={[0, 0, Math.PI / 2]}
        sensor
        friction={wheelRuntimeProps[2]?.friction ?? 2.1}
        restitution={0}
      />
      <mesh castShadow receiveShadow rotation={[0, 0, Math.PI / 2]} visible={false}>
        <cylinderGeometry
          args={[
            wheelRuntimeProps[2]?.radius ?? 0.22,
            wheelRuntimeProps[2]?.radius ?? 0.22,
            (wheelRuntimeProps[2]?.halfHeight ?? 0.14) * 2,
            18,
          ]}
        />
        <meshStandardMaterial color="#1d2127" roughness={0.85} metalness={0.05} />
      </mesh>
    </RigidBody>
    <RigidBody
      ref={wheelRrRef}
      type="kinematicPosition"
      colliders={false}
      position={wheelStartPositions[3]}
      mass={wheelRuntimeProps[3]?.mass ?? Math.max(0.04, vehiclePhysicsTuning.mass * 0.03)}
      enabledRotations={[true, false, false]}
      linearDamping={1.8}
      angularDamping={6.1}
      ccd
      canSleep={false}
    >
      <CylinderCollider
        args={[wheelRuntimeProps[3]?.halfHeight ?? 0.14, wheelRuntimeProps[3]?.radius ?? 0.22]}
        rotation={[0, 0, Math.PI / 2]}
        sensor
        friction={wheelRuntimeProps[3]?.friction ?? 2.1}
        restitution={0}
      />
      <mesh castShadow receiveShadow rotation={[0, 0, Math.PI / 2]} visible={false}>
        <cylinderGeometry
          args={[
            wheelRuntimeProps[3]?.radius ?? 0.22,
            wheelRuntimeProps[3]?.radius ?? 0.22,
            (wheelRuntimeProps[3]?.halfHeight ?? 0.14) * 2,
            18,
          ]}
        />
        <meshStandardMaterial color="#1d2127" roughness={0.85} metalness={0.05} />
      </mesh>
    </RigidBody>
    </>
  )
}

import { Sparkles } from '@react-three/drei'
import { CuboidCollider, RapierRigidBody, RigidBody } from '@react-three/rapier'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Group, Vector3 } from 'three'
import { CarModel } from './CarModel'
import { MAX_DAMAGE, PLAYER_BODY_NAME, VEHICLE_PHYSICS } from './config'
import { createInputState, getMergedInput } from './keys'
import { getTrackMap, sampleTerrainHeight } from './maps'
import { playPickupSound, setEngineMuted, stopEngineSound, updateEngineSound } from './sfx'
import { useGameStore } from './store'
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
export const PlayerCar = ({ pickups, onCollectPickup, onPlayerPosition, lowPowerMode = false }: PlayerCarProps) => {
  const bodyRef = useRef<RapierRigidBody | null>(null)
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
  const { camera } = useThree()

  const damage = useGameStore((state) => state.damage)
  const status = useGameStore((state) => state.status)
  const engineMuted = useGameStore((state) => state.engineMuted)
  const vehicleSpec = useGameStore((state) => state.vehicleSpec)
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

  useEffect(() => {
    const body = bodyRef.current
    if (!body) {
      return
    }

    body.setTranslation(startPosition, true)
    body.setLinvel({ x: 0, y: 0, z: 0 }, true)
    body.setAngvel({ x: 0, y: 0, z: 0 }, true)
    body.setRotation({ x: 0, y: Math.sin(startYaw / 2), z: 0, w: Math.cos(startYaw / 2) }, true)
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
    lastGroundedAtRef.current = performance.now() / 1000
    zoneDamageRef.current = { front: 0, rear: 0, left: 0, right: 0 }
    zoneStateRef.current = { front: 'intact', rear: 'intact', left: 'intact', right: 'intact' }
    disabledEmittedRef.current = false
    nanGuardTripsRef.current = 0
    speedClampTripsRef.current = 0
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
    smoothedForwardRef.current.set(0, 0, 1)
    smoothedTargetRef.current.set(startPosition.x, startPosition.y + 1.3, startPosition.z + CAMERA_LOOK_AHEAD)
  }, [restartToken, setPhysicsTelemetry, setTelemetry, startPosition, startYaw])

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

  useFrame((state, delta) => {
    const body = bodyRef.current
    if (!body) {
      return
    }

    syncGamepadInput(activeGamepadIndexRef)
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
    })

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
    <RigidBody
      ref={bodyRef}
      name={PLAYER_BODY_NAME}
      colliders={false}
      position={[startPosition.x, startPosition.y, startPosition.z]}
      enabledRotations={[true, true, true]}
      ccd
      angularDamping={1.8}
      linearDamping={0.18}
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
        <CuboidCollider args={[0.7, 0.33, 1.18]} position={[0, 0.06, 0]} />
        <CarModel
          bodyColor={palette.body}
          accentColor={palette.accent}
          damage={damage}
          lowPowerMode={lowPowerMode}
          showTrail
          crackOpacity={crackOpacity}
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
  )
}

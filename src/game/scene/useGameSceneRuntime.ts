import { useFrame } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { sampleTerrainHeight, type TrackMap } from '../maps'
import { createRoomChannel, isMultiplayerConfigured, makeClientId, type RoomChannelHandle } from '../multiplayer'
import { createCritters, generateSpawnPosition, pickRespawnPoint, SPAWN_CHECK_SECONDS, type RuntimeCritter } from '../systems'
import type { Pickup, WorldObstacle } from '../types'
import type { RemoteCarState, RuntimeDestructible } from './entities'

type UseGameSceneRuntimeParams = {
  map: TrackMap
  roomId: string | null
  isRoomHost: boolean
  initialPickups: Pickup[]
  initialDestructibles: RuntimeDestructible[]
  spawnObstacles: WorldObstacle[]
  damage: number
  speedKph: number
  status: 'running' | 'lost'
  restartToken: number
  proceduralMapSeed: number
  vehicleSpec: { cosmetics: { bodyColor: string }; name: string; massClass: 'light' | 'balanced' | 'heavy' }
  advanceMission: (event: 'collect_stars' | 'collect_parts' | 'pass_gates' | 'clean_drive', amount?: number) => void
  setMissionProgress: (event: 'collect_stars' | 'collect_parts' | 'pass_gates' | 'clean_drive', progress: number) => void
}

export const useGameSceneRuntime = ({
  map,
  roomId,
  isRoomHost,
  initialPickups,
  initialDestructibles,
  spawnObstacles,
  damage,
  speedKph,
  status,
  restartToken,
  proceduralMapSeed,
  vehicleSpec,
  advanceMission,
  setMissionProgress,
}: UseGameSceneRuntimeParams) => {
  const [pickups, setPickups] = useState<Pickup[]>(() => [...initialPickups])
  const [remoteCars, setRemoteCars] = useState<Record<string, RemoteCarState>>({})
  const [destructibles, setDestructibles] = useState<RuntimeDestructible[]>(() =>
    initialDestructibles.map((item) => ({ ...item })),
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
      setDestructibles(initialDestructibles.map((item) => ({ ...item })))
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
        const hitIds = new Set<string>()
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
          hitIds.add(critter.id)
          hitPositions[critter.id] = [critter.position[0], critter.position[1], critter.position[2]]
        }
        if (hitIds.size > 0) {
          setCritters((state) =>
            state.map((item) =>
              hitIds.has(item.id) && item.state === 'alive'
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

  return useMemo(
    () => ({
      pickups,
      remoteCars,
      destructibles,
      critters,
      playerPositionRef,
      collectPickup,
      updatePlayerPosition,
      breakDestructible,
      breakCritter,
      guestMode,
    }),
    [
      pickups,
      remoteCars,
      destructibles,
      critters,
      collectPickup,
      updatePlayerPosition,
      breakDestructible,
      breakCritter,
      guestMode,
    ],
  )
}

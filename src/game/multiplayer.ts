import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js'

export type CarSnapshot = {
  id: string
  x: number
  y: number
  z: number
  yaw: number
  color: string
  profile: string
  sentAt: number
}

export type PickupCollectEvent = {
  pickupId: string
}

export type BreakDestructibleEvent = {
  id: string
  burstSeed: number
}

export type WorldSyncEvent = {
  pickups: Array<{ id: string; position: [number, number, number]; type: 'star' | 'repair' | 'part' }>
  destructibles: Array<{
    id: string
    phase: 'intact' | 'broken'
    respawnAt: number | null
    burstSeed: number
    position: [number, number, number]
    color: string
  }>
}

let client: SupabaseClient | null = null

const getClient = () => {
  if (client) {
    return client
  }
  const url = import.meta.env.VITE_SUPABASE_URL
  const publicKey =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
    import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!url || !publicKey) {
    return null
  }

  client = createClient(url, publicKey, {
    realtime: {
      params: {
        eventsPerSecond: 20,
      },
    },
  })
  return client
}

export const isMultiplayerConfigured = () =>
  Boolean(
    import.meta.env.VITE_SUPABASE_URL &&
      (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
        import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
        import.meta.env.VITE_SUPABASE_ANON_KEY),
  )

export const createRoomChannel = (
  roomId: string,
  handlers: {
    onSnapshot?: (snapshot: CarSnapshot) => void
    onPickupCollect?: (payload: PickupCollectEvent) => void
    onBreakDestructible?: (payload: BreakDestructibleEvent) => void
    onWorldSync?: (payload: WorldSyncEvent) => void
    onStatus?: (status: string) => void
  },
) => {
  const supabase = getClient()
  if (!supabase) {
    return null
  }

  const channel = supabase.channel(`room:${roomId}`, {
    config: {
      broadcast: { self: false, ack: false },
    },
  })

  channel.on('broadcast', { event: 'car_snapshot' }, (message) => {
    const payload = message.payload as CarSnapshot
    if (!payload || typeof payload.id !== 'string') {
      return
    }
    handlers.onSnapshot?.(payload)
  })

  channel.on('broadcast', { event: 'pickup_collect' }, (message) => {
    const payload = message.payload as PickupCollectEvent
    if (!payload || typeof payload.pickupId !== 'string') {
      return
    }
    handlers.onPickupCollect?.(payload)
  })

  channel.on('broadcast', { event: 'break_destructible' }, (message) => {
    const payload = message.payload as BreakDestructibleEvent
    if (!payload || typeof payload.id !== 'string') {
      return
    }
    handlers.onBreakDestructible?.(payload)
  })

  channel.on('broadcast', { event: 'world_sync' }, (message) => {
    const payload = message.payload as WorldSyncEvent
    if (!payload || !Array.isArray(payload.pickups) || !Array.isArray(payload.destructibles)) {
      return
    }
    handlers.onWorldSync?.(payload)
  })

  channel.subscribe((status) => {
    handlers.onStatus?.(status)
  })

  const sendSnapshot = (snapshot: CarSnapshot) => {
    void channel.send({
      type: 'broadcast',
      event: 'car_snapshot',
      payload: snapshot,
    })
  }

  const sendPickupCollect = (payload: PickupCollectEvent) => {
    void channel.send({
      type: 'broadcast',
      event: 'pickup_collect',
      payload,
    })
  }

  const sendBreakDestructible = (payload: BreakDestructibleEvent) => {
    void channel.send({
      type: 'broadcast',
      event: 'break_destructible',
      payload,
    })
  }

  const sendWorldSync = (payload: WorldSyncEvent) => {
    void channel.send({
      type: 'broadcast',
      event: 'world_sync',
      payload,
    })
  }

  const destroy = () => {
    void channel.unsubscribe()
    void supabase.removeChannel(channel)
  }

  return { sendSnapshot, sendPickupCollect, sendBreakDestructible, sendWorldSync, destroy, channel }
}

export const createRoomId = () => Math.random().toString(36).slice(2, 8)

export const getRoomIdFromUrl = () => {
  if (typeof window === 'undefined') {
    return null
  }
  const value = new URLSearchParams(window.location.search).get('room')
  return value && value.length >= 3 ? value : null
}

export const setRoomIdInUrl = (roomId: string) => {
  if (typeof window === 'undefined') {
    return
  }
  const url = new URL(window.location.href)
  url.searchParams.set('room', roomId)
  window.history.replaceState({}, '', url.toString())
}

export const clearRoomIdFromUrl = () => {
  if (typeof window === 'undefined') {
    return
  }
  const url = new URL(window.location.href)
  url.searchParams.delete('room')
  window.history.replaceState({}, '', url.toString())
}

export const makeClientId = () => {
  if (typeof window === 'undefined') {
    return `local-${Math.random().toString(36).slice(2, 10)}`
  }
  const key = 'autos-player-id'
  const existing = window.localStorage.getItem(key)
  if (existing) {
    return existing
  }
  const created = `player-${Math.random().toString(36).slice(2, 10)}`
  window.localStorage.setItem(key, created)
  return created
}

export type RoomChannelHandle = {
  sendSnapshot: (snapshot: CarSnapshot) => void
  sendPickupCollect: (payload: PickupCollectEvent) => void
  sendBreakDestructible: (payload: BreakDestructibleEvent) => void
  sendWorldSync: (payload: WorldSyncEvent) => void
  destroy: () => void
  channel: RealtimeChannel
}

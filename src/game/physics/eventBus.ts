import type { PhysicsEventMapV2, PhysicsEventNameV2, PhysicsEventPayloadV2 } from '../types'

type Listener<K extends PhysicsEventNameV2> = (payload: PhysicsEventMapV2[K]) => void

class TypedPhysicsEventBusV2 {
  private listeners: {
    [K in PhysicsEventNameV2]: Set<Listener<K>>
  } = {
    impact: new Set(),
    damage_applied: new Set(),
    part_state_changed: new Set(),
    vehicle_disabled: new Set(),
  }

  on<K extends PhysicsEventNameV2>(eventName: K, listener: Listener<K>): () => void {
    this.listeners[eventName].add(listener)
    return () => this.off(eventName, listener)
  }

  off<K extends PhysicsEventNameV2>(eventName: K, listener: Listener<K>): void {
    this.listeners[eventName].delete(listener)
  }

  emit<K extends PhysicsEventNameV2>(eventName: K, payload: PhysicsEventMapV2[K]): void {
    for (const listener of this.listeners[eventName]) {
      listener(payload)
    }
  }
}

export const physicsEventBusV2 = new TypedPhysicsEventBusV2()

export const emitPhysicsEventV2 = <K extends PhysicsEventNameV2>(eventName: K, payload: PhysicsEventPayloadV2<K>) => {
  physicsEventBusV2.emit(eventName, payload)
}

import { getCtx, isEngineMuted } from './runtime'

type CollisionMaterial = 'rubber' | 'wood' | 'metal' | 'rock' | 'glass'
type CollisionTier = 'minor' | 'moderate' | 'major' | 'critical'

type CollisionAudioDebugState = {
  material: CollisionMaterial
  tier: CollisionTier
  speed: number
  intensity: number
  playedAtMs: number
}

let impactNoiseBuffer: AudioBuffer | null = null

const collisionDebugState: CollisionAudioDebugState = {
  material: 'rubber',
  tier: 'minor',
  speed: 0,
  intensity: 0,
  playedAtMs: 0,
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

const scheduleEnvelope = (gain: GainNode, now: number, peak: number, attack: number, decay: number) => {
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), now + Math.max(0.002, attack))
  gain.gain.exponentialRampToValueAtTime(0.0001, now + Math.max(0.03, attack + decay))
}

const connectWithFilters = (
  source: AudioNode,
  audio: AudioContext,
  gain: GainNode,
  {
    highpassHz,
    lowpassHz,
    bandpassHz,
    bandpassQ = 0.9,
  }: { highpassHz?: number; lowpassHz?: number; bandpassHz?: number; bandpassQ?: number },
) => {
  let tail: AudioNode = source
  const filters: BiquadFilterNode[] = []
  if (typeof highpassHz === 'number') {
    const filter = audio.createBiquadFilter()
    filter.type = 'highpass'
    filter.frequency.setValueAtTime(highpassHz, audio.currentTime)
    tail.connect(filter)
    tail = filter
    filters.push(filter)
  }
  if (typeof bandpassHz === 'number') {
    const filter = audio.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.setValueAtTime(bandpassHz, audio.currentTime)
    filter.Q.setValueAtTime(bandpassQ, audio.currentTime)
    tail.connect(filter)
    tail = filter
    filters.push(filter)
  }
  if (typeof lowpassHz === 'number') {
    const filter = audio.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(lowpassHz, audio.currentTime)
    tail.connect(filter)
    tail = filter
    filters.push(filter)
  }
  tail.connect(gain)
  return filters
}

const getImpactNoiseBuffer = (audio: AudioContext) => {
  if (impactNoiseBuffer && impactNoiseBuffer.sampleRate === audio.sampleRate) {
    return impactNoiseBuffer
  }
  const durationSeconds = 0.6
  const frameCount = Math.ceil(audio.sampleRate * durationSeconds)
  const buffer = audio.createBuffer(1, frameCount, audio.sampleRate)
  const channel = buffer.getChannelData(0)
  for (let index = 0; index < frameCount; index += 1) {
    const fade = 1 - index / frameCount
    channel[index] = (Math.random() * 2 - 1) * (0.35 + fade * 0.65)
  }
  impactNoiseBuffer = buffer
  return buffer
}

const playTone = (frequency: number, duration: number, type: OscillatorType, volume: number) => {
  if (isEngineMuted()) {
    return
  }
  const audio = getCtx()
  if (!audio) {
    return
  }

  const now = audio.currentTime
  const osc = audio.createOscillator()
  const gain = audio.createGain()

  osc.type = type
  osc.frequency.setValueAtTime(frequency, now)
  osc.frequency.exponentialRampToValueAtTime(Math.max(80, frequency * 0.65), now + duration)

  gain.gain.setValueAtTime(0.001, now)
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration)

  osc.connect(gain)
  gain.connect(audio.destination)

  osc.start(now)
  osc.stop(now + duration)
}

const playSweepTone = ({
  audio,
  now,
  frequency,
  endFrequency,
  duration,
  type,
  volume,
}: {
  audio: AudioContext
  now: number
  frequency: number
  endFrequency: number
  duration: number
  type: OscillatorType
  volume: number
}) => {
  const osc = audio.createOscillator()
  const gain = audio.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(Math.max(24, frequency), now)
  osc.frequency.exponentialRampToValueAtTime(Math.max(24, endFrequency), now + duration)
  scheduleEnvelope(gain, now, volume, 0.003, duration)
  osc.connect(gain)
  gain.connect(audio.destination)
  osc.start(now)
  osc.stop(now + duration + 0.03)
  osc.onended = () => {
    osc.disconnect()
    gain.disconnect()
  }
}

const playNoiseBurst = ({
  audio,
  now,
  duration,
  volume,
  playbackRate = 1,
  highpassHz,
  lowpassHz,
  bandpassHz,
  bandpassQ,
}: {
  audio: AudioContext
  now: number
  duration: number
  volume: number
  playbackRate?: number
  highpassHz?: number
  lowpassHz?: number
  bandpassHz?: number
  bandpassQ?: number
}) => {
  const source = audio.createBufferSource()
  const gain = audio.createGain()
  source.buffer = getImpactNoiseBuffer(audio)
  source.playbackRate.setValueAtTime(playbackRate, now)
  scheduleEnvelope(gain, now, volume, 0.002, duration)
  const filters = connectWithFilters(source, audio, gain, { highpassHz, lowpassHz, bandpassHz, bandpassQ })
  gain.connect(audio.destination)
  source.start(now)
  source.stop(now + duration + 0.03)
  source.onended = () => {
    source.disconnect()
    filters.forEach((filter) => filter.disconnect())
    gain.disconnect()
  }
}

export const getCollisionAudioDebugState = (): CollisionAudioDebugState => ({ ...collisionDebugState })

export const playCollisionSound = ({
  material,
  tier,
  speed,
  relativeSpeed = speed,
}: {
  material: CollisionMaterial
  tier: CollisionTier
  speed: number
  relativeSpeed?: number
}) => {
  if (isEngineMuted()) {
    return
  }
  const audio = getCtx()
  if (!audio) {
    return
  }

  const now = audio.currentTime
  const speedFactor = clamp01(speed / 18)
  const relativeFactor = clamp01(relativeSpeed / 18)
  const tierFactor = tier === 'critical' ? 1 : tier === 'major' ? 0.8 : tier === 'moderate' ? 0.56 : 0.32
  const intensity = clamp01(tierFactor * 0.62 + speedFactor * 0.5 + relativeFactor * 0.22)

  collisionDebugState.material = material
  collisionDebugState.tier = tier
  collisionDebugState.speed = speed
  collisionDebugState.intensity = intensity
  collisionDebugState.playedAtMs = Math.round(performance.now())

  playSweepTone({
    audio,
    now,
    frequency: 108 - intensity * 20,
    endFrequency: 46 - intensity * 4,
    duration: 0.12 + intensity * 0.1,
    type: material === 'rubber' ? 'sine' : 'triangle',
    volume: 0.026 + intensity * 0.072,
  })

  if (material === 'metal') {
    playNoiseBurst({
      audio,
      now,
      duration: 0.08 + intensity * 0.12,
      volume: 0.018 + intensity * 0.045,
      playbackRate: 0.92 + speedFactor * 0.25,
      highpassHz: 180,
      bandpassHz: 1400 + speedFactor * 900,
      lowpassHz: 4800,
    })
    playSweepTone({
      audio,
      now,
      frequency: 620 + speedFactor * 120,
      endFrequency: 420 + speedFactor * 90,
      duration: 0.14 + intensity * 0.08,
      type: 'square',
      volume: 0.01 + intensity * 0.018,
    })
    playSweepTone({
      audio,
      now: now + 0.01,
      frequency: 940 + speedFactor * 180,
      endFrequency: 680 + speedFactor * 120,
      duration: 0.18 + intensity * 0.1,
      type: 'triangle',
      volume: 0.008 + intensity * 0.014,
    })
    return
  }

  if (material === 'rock') {
    playNoiseBurst({
      audio,
      now,
      duration: 0.12 + intensity * 0.12,
      volume: 0.016 + intensity * 0.035,
      playbackRate: 0.78 + speedFactor * 0.15,
      highpassHz: 120,
      bandpassHz: 900 + speedFactor * 500,
      lowpassHz: 2600,
    })
    playSweepTone({
      audio,
      now,
      frequency: 220,
      endFrequency: 140,
      duration: 0.1 + intensity * 0.06,
      type: 'square',
      volume: 0.007 + intensity * 0.012,
    })
    return
  }

  if (material === 'wood') {
    playNoiseBurst({
      audio,
      now,
      duration: 0.07 + intensity * 0.08,
      volume: 0.01 + intensity * 0.02,
      playbackRate: 0.88 + speedFactor * 0.12,
      highpassHz: 90,
      bandpassHz: 560 + speedFactor * 320,
      lowpassHz: 1800,
    })
    playSweepTone({
      audio,
      now,
      frequency: 180,
      endFrequency: 110,
      duration: 0.08 + intensity * 0.05,
      type: 'triangle',
      volume: 0.006 + intensity * 0.01,
    })
    return
  }

  if (material === 'glass') {
    playNoiseBurst({
      audio,
      now,
      duration: 0.06 + intensity * 0.09,
      volume: 0.012 + intensity * 0.028,
      playbackRate: 1.05 + speedFactor * 0.28,
      highpassHz: 900,
      bandpassHz: 2600 + speedFactor * 1200,
      lowpassHz: 8000,
      bandpassQ: 1.4,
    })
    playSweepTone({
      audio,
      now,
      frequency: 1240 + speedFactor * 220,
      endFrequency: 760 + speedFactor * 140,
      duration: 0.1 + intensity * 0.05,
      type: 'triangle',
      volume: 0.006 + intensity * 0.012,
    })
    return
  }

  playNoiseBurst({
    audio,
    now,
    duration: 0.05 + intensity * 0.05,
    volume: 0.006 + intensity * 0.012,
    playbackRate: 0.95 + speedFactor * 0.08,
    highpassHz: 120,
    lowpassHz: 1200,
  })
  playSweepTone({
    audio,
    now,
    frequency: 150,
    endFrequency: 84,
    duration: 0.06 + intensity * 0.04,
    type: 'sine',
    volume: 0.004 + intensity * 0.008,
  })
}

export const playPickupSound = (type: 'star' | 'repair' | 'part') => {
  if (type === 'star') {
    playTone(520, 0.08, 'triangle', 0.07)
    return
  }

  if (type === 'repair') {
    playTone(280, 0.12, 'sine', 0.07)
    return
  }

  playTone(330, 0.08, 'square', 0.06)
  playTone(420, 0.14, 'triangle', 0.05)
}

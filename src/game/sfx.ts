let ctx: AudioContext | null = null
let engineOsc: OscillatorNode | null = null
let engineSubOsc: OscillatorNode | null = null
let surfaceOsc: OscillatorNode | null = null
let engineGain: GainNode | null = null
let engineFilter: BiquadFilterNode | null = null
let surfaceGain: GainNode | null = null
let surfaceFilter: BiquadFilterNode | null = null
let engineMuted = false

const getCtx = () => {
  if (typeof window === 'undefined') {
    return null
  }

  if (!ctx) {
    const AudioCtx = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioCtx) {
      return null
    }
    ctx = new AudioCtx()
  }

  return ctx
}

export const unlockAudio = async () => {
  const audio = getCtx()
  if (!audio) {
    return
  }

  if (audio.state === 'suspended') {
    await audio.resume()
  }
}

const ensureEngineLoop = () => {
  const audio = getCtx()
  if (!audio || audio.state !== 'running') {
    return null
  }

  if (engineOsc && engineSubOsc && engineGain && engineFilter) {
    return {
      audio,
      osc: engineOsc,
      subOsc: engineSubOsc,
      surfaceOsc,
      gain: engineGain,
      filter: engineFilter,
      surfaceGain,
      surfaceFilter,
    }
  }

  const osc = audio.createOscillator()
  const subOsc = audio.createOscillator()
  const filter = audio.createBiquadFilter()
  const gain = audio.createGain()
  const surface = audio.createOscillator()
  const surfaceBand = audio.createBiquadFilter()
  const surfaceVol = audio.createGain()

  osc.type = 'sawtooth'
  subOsc.type = 'triangle'
  surface.type = 'square'
  filter.type = 'lowpass'
  surfaceBand.type = 'bandpass'
  filter.frequency.setValueAtTime(900, audio.currentTime)
  gain.gain.setValueAtTime(0.0001, audio.currentTime)
  surfaceBand.frequency.setValueAtTime(220, audio.currentTime)
  surfaceVol.gain.setValueAtTime(0.0001, audio.currentTime)

  osc.connect(filter)
  subOsc.connect(filter)
  filter.connect(gain)
  gain.connect(audio.destination)
  surface.connect(surfaceBand)
  surfaceBand.connect(surfaceVol)
  surfaceVol.connect(audio.destination)

  osc.start()
  subOsc.start()
  surface.start()

  engineOsc = osc
  engineSubOsc = subOsc
  surfaceOsc = surface
  engineGain = gain
  engineFilter = filter
  surfaceGain = surfaceVol
  surfaceFilter = surfaceBand

  return {
    audio,
    osc,
    subOsc,
    surfaceOsc: surface,
    gain,
    filter,
    surfaceGain: surfaceVol,
    surfaceFilter: surfaceBand,
  }
}

export const updateEngineSound = ({
  speed,
  throttle,
  direction,
  surface,
}: {
  speed: number
  throttle: number
  direction: 'forward' | 'reverse' | 'idle'
  surface: 'road' | 'grass'
}) => {
  const loop = ensureEngineLoop()
  if (!loop) {
    return
  }

  const { audio, osc, subOsc, surfaceOsc: surfaceTone, gain, filter, surfaceGain: surfaceVol, surfaceFilter: surfaceBand } = loop
  const now = audio.currentTime

  if (engineMuted) {
    gain.gain.setTargetAtTime(0.0001, now, 0.04)
    if (surfaceVol) {
      surfaceVol.gain.setTargetAtTime(0.0001, now, 0.04)
    }
    return
  }

  const speedFactor = Math.min(1, Math.max(0, speed / 12))
  const throttleFactor = Math.min(1, Math.max(0, throttle))

  const baseFreq = direction === 'reverse' ? 82 : direction === 'forward' ? 94 : 72
  const targetFreq = baseFreq + speedFactor * 125 + throttleFactor * 22
  const subFreq = targetFreq * (direction === 'reverse' ? 0.48 : 0.5)
  const targetGain =
    direction === 'idle'
      ? 0.018 + speedFactor * 0.02
      : direction === 'reverse'
        ? 0.03 + speedFactor * 0.05
        : 0.035 + speedFactor * 0.065 + throttleFactor * 0.025
  const targetFilter = direction === 'reverse' ? 620 + speedFactor * 420 : 760 + speedFactor * 820
  const surfaceGainTarget = surface === 'grass' ? 0.018 + speedFactor * 0.03 : 0.006 + speedFactor * 0.012
  const surfaceFreqTarget = surface === 'grass' ? 130 + speedFactor * 50 : 280 + speedFactor * 80

  osc.frequency.setTargetAtTime(targetFreq, now, 0.06)
  subOsc.frequency.setTargetAtTime(subFreq, now, 0.07)
  gain.gain.setTargetAtTime(targetGain, now, 0.08)
  filter.frequency.setTargetAtTime(targetFilter, now, 0.07)
  if (surfaceTone && surfaceVol && surfaceBand) {
    surfaceTone.frequency.setTargetAtTime(surface === 'grass' ? 70 : 130, now, 0.09)
    surfaceBand.frequency.setTargetAtTime(surfaceFreqTarget, now, 0.08)
    surfaceVol.gain.setTargetAtTime(surfaceGainTarget, now, 0.1)
  }
}

export const setEngineMuted = (muted: boolean) => {
  engineMuted = muted
  if (engineGain && ctx) {
    engineGain.gain.setTargetAtTime(muted ? 0.0001 : 0.03, ctx.currentTime, 0.05)
  }
  if (surfaceGain && ctx) {
    surfaceGain.gain.setTargetAtTime(muted ? 0.0001 : 0.008, ctx.currentTime, 0.05)
  }
}

export const stopEngineSound = () => {
  if (engineOsc) {
    engineOsc.stop()
    engineOsc.disconnect()
    engineOsc = null
  }
  if (engineSubOsc) {
    engineSubOsc.stop()
    engineSubOsc.disconnect()
    engineSubOsc = null
  }
  if (surfaceOsc) {
    surfaceOsc.stop()
    surfaceOsc.disconnect()
    surfaceOsc = null
  }
  if (engineFilter) {
    engineFilter.disconnect()
    engineFilter = null
  }
  if (surfaceFilter) {
    surfaceFilter.disconnect()
    surfaceFilter = null
  }
  if (engineGain) {
    engineGain.disconnect()
    engineGain = null
  }
  if (surfaceGain) {
    surfaceGain.disconnect()
    surfaceGain = null
  }
}

const playTone = (frequency: number, duration: number, type: OscillatorType, volume: number) => {
  if (engineMuted) {
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

export const playCollisionSound = (hardHit: boolean, speed: number) => {
  const normalized = Math.min(1.2, Math.max(0.35, speed / 10))
  if (hardHit) {
    playTone(120 * normalized, 0.2, 'sawtooth', 0.11)
    playTone(88 * normalized, 0.26, 'triangle', 0.08)
    return
  }

  playTone(210 * normalized, 0.12, 'square', 0.06)
}

export const playPickupSound = (type: 'star' | 'repair') => {
  if (type === 'star') {
    playTone(520, 0.08, 'triangle', 0.07)
    return
  }

  playTone(280, 0.12, 'sine', 0.07)
}

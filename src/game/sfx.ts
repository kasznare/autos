let ctx: AudioContext | null = null

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

const playTone = (frequency: number, duration: number, type: OscillatorType, volume: number) => {
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

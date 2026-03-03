let ctx: AudioContext | null = null
let engineMuted = false

export const isEngineMuted = () => engineMuted

export const setEngineMutedFlag = (muted: boolean) => {
  engineMuted = muted
}

export const getCtx = () => {
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


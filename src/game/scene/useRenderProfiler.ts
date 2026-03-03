import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { detectGpuHotspot, type RenderPerfTelemetry } from '../systems/performance'

type Params = {
  enabled?: boolean
  onSample: (next: RenderPerfTelemetry) => void
}

export const useRenderProfiler = ({ enabled = true, onSample }: Params) => {
  const frameWindowRef = useRef<number[]>([])
  const sampleTimerRef = useRef(0)

  useFrame((state, delta) => {
    if (!enabled) {
      return
    }
    const frameMs = delta * 1000
    frameWindowRef.current.push(frameMs)
    if (frameWindowRef.current.length > 90) {
      frameWindowRef.current.shift()
    }
    sampleTimerRef.current += delta
    if (sampleTimerRef.current < 0.45) {
      return
    }
    sampleTimerRef.current = 0

    const values = frameWindowRef.current
    if (values.length === 0) {
      return
    }
    const frameMsAvg = values.reduce((acc, value) => acc + value, 0) / values.length
    const frameMsWorst = values.reduce((acc, value) => Math.max(acc, value), 0)
    const drawCalls = state.gl.info.render.calls
    const triangles = state.gl.info.render.triangles
    const points = state.gl.info.render.points
    onSample({
      fps: frameMsAvg > 0 ? 1000 / frameMsAvg : 0,
      frameMsAvg,
      frameMsWorst,
      drawCalls,
      triangles,
      gpuHotspot: detectGpuHotspot({ drawCalls, triangles, points }),
    })
  })
}


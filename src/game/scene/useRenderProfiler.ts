import { addAfterEffect, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { detectGpuHotspot, type RenderPerfTelemetry } from '../systems/performance'

type Params = {
  enabled?: boolean
  onSample: (next: RenderPerfTelemetry) => void
}

export const useRenderProfiler = ({ enabled = true, onSample }: Params) => {
  const gl = useThree((state) => state.gl)
  const frameWindowRef = useRef<number[]>([])
  const sampleTimerRef = useRef(0)
  const enabledRef = useRef(enabled)
  const onSampleRef = useRef(onSample)
  const samplePendingRef = useRef(false)

  useEffect(() => {
    enabledRef.current = enabled
    onSampleRef.current = onSample
  }, [enabled, onSample])

  useFrame((_, delta) => {
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
    samplePendingRef.current = true
  })

  useEffect(() => {
    const unsubscribe = addAfterEffect(() => {
      if (!enabledRef.current || !samplePendingRef.current) {
        return
      }
      samplePendingRef.current = false
      const values = frameWindowRef.current
      if (values.length === 0) {
        return
      }
      const frameMsAvg = values.reduce((acc, value) => acc + value, 0) / values.length
      const frameMsWorst = values.reduce((acc, value) => Math.max(acc, value), 0)
      const drawCalls = gl.info.render.calls
      const triangles = gl.info.render.triangles
      const points = gl.info.render.points
      onSampleRef.current({
        fps: frameMsAvg > 0 ? 1000 / frameMsAvg : 0,
        frameMsAvg,
        frameMsWorst,
        drawCalls,
        triangles,
        gpuHotspot: detectGpuHotspot({ drawCalls, triangles, points }),
      })
    })
    return unsubscribe
  }, [gl])

  useEffect(() => {
    if (!enabled) {
      samplePendingRef.current = false
      frameWindowRef.current = []
      sampleTimerRef.current = 0
    }
  }, [enabled])
}

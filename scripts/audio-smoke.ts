import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'
import { createServer, type ViteDevServer } from 'vite'

const HOST = '127.0.0.1'
const PORT = 4180
const APP_URL = `http://${HOST}:${PORT}/`
const SCREENSHOT_PATH = path.resolve('output/playwright/audio-smoke.png')

type AudioSmokeState = {
  speedKph: number
  audio: {
    contextState: 'running' | 'suspended' | 'closed' | 'interrupted' | 'unavailable'
    muted: boolean
    engine: {
      direction: 'forward' | 'reverse' | 'idle'
      throttleBlend: number
      highGain: number
      reverseGain: number
      intakeGain: number
      reverseWhineGain: number
    }
    collision: {
      material: 'rubber' | 'wood' | 'metal' | 'rock' | 'glass'
      tier: 'minor' | 'moderate' | 'major' | 'critical'
      intensity: number
      playedAtMs: number
    }
  }
}

const assert = (condition: unknown, message: string): asserts condition => {
  if (!condition) {
    throw new Error(message)
  }
}

const getTestApiState = async (page: import('playwright').Page) =>
  page.evaluate(() => (window as typeof window & { __AUTOS_TEST_API__: { getState: () => AudioSmokeState } }).__AUTOS_TEST_API__.getState())

const setInput = async (
  page: import('playwright').Page,
  partial: Partial<Record<'forward' | 'backward' | 'left' | 'right' | 'jump' | 'restart', boolean>>,
) => {
  await page.evaluate((nextInput) => {
    ;(window as typeof window & {
      __AUTOS_TEST_API__: {
        setInput: (partial: Partial<Record<'forward' | 'backward' | 'left' | 'right' | 'jump' | 'restart', boolean>>) => void
      }
    }).__AUTOS_TEST_API__.setInput(nextInput)
  }, partial)
}

const resetInput = async (page: import('playwright').Page) => {
  await page.evaluate(() => {
    ;(window as typeof window & { __AUTOS_TEST_API__: { resetInput: () => void } }).__AUTOS_TEST_API__.resetInput()
  })
}

const createAppServer = async () => {
  const server = await createServer({
    server: {
      host: HOST,
      port: PORT,
      strictPort: true,
    },
    clearScreen: false,
  })
  await server.listen()
  return server
}

const closeServer = async (server: ViteDevServer | null) => {
  if (!server) {
    return
  }
  await server.close()
}

const isMissingBrowserExecutable = (error: unknown) =>
  error instanceof Error &&
  (error.message.includes('Executable doesn\'t exist') || error.message.includes('browserType.launch'))

const sampleEngineWindow = async (page: import('playwright').Page, durationMs: number) => {
  const samples: AudioSmokeState[] = []
  const iterations = Math.ceil(durationMs / 180)
  for (let index = 0; index < iterations; index += 1) {
    await page.waitForTimeout(180)
    samples.push(await getTestApiState(page))
  }
  return samples
}

const run = async () => {
  let server: ViteDevServer | null = null
  let browser: import('playwright').Browser | null = null

  try {
    await mkdir(path.dirname(SCREENSHOT_PATH), { recursive: true })
    server = await createAppServer()
    browser = await chromium.launch({
      headless: true,
      args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    })
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })
    const pageErrors: string[] = []
    page.on('pageerror', (error) => {
      pageErrors.push(`${error.name}: ${error.message}${error.stack ? ` :: ${error.stack}` : ''}`)
    })
    await page.addInitScript(() => {
      // eslint-disable-next-line no-var
      var __name = globalThis.__name || ((target: unknown) => target)
      Object.defineProperty(globalThis, '__name', {
        configurable: true,
        writable: true,
        value: __name,
      })
      Object.defineProperty(document, 'hidden', {
        configurable: true,
        get: () => false,
      })
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'visible',
      })
    })

    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' })
    await page.bringToFront()
    await page.evaluate(() => {
      window.dispatchEvent(new Event('focus'))
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await page.locator('.hud-panel').waitFor()
    await page.waitForFunction(() => Boolean((window as typeof window & { __AUTOS_TEST_API__?: unknown }).__AUTOS_TEST_API__))

    await page.evaluate(async () => {
      const api = (window as typeof window & {
        __AUTOS_TEST_API__: { setEngineMuted: (muted: boolean) => void; unlockAudio: () => Promise<void> }
      }).__AUTOS_TEST_API__
      api.setEngineMuted(false)
      await api.unlockAudio()
    })
    await page.waitForFunction(() => {
      const state = (window as typeof window & { __AUTOS_TEST_API__: { getState: () => AudioSmokeState } }).__AUTOS_TEST_API__.getState()
      return state.audio.contextState === 'running' && state.audio.muted === false
    })

    await setInput(page, { forward: true })
    const forwardSamples = await sampleEngineWindow(page, 2200)
    await resetInput(page)
    const peakForwardSpeed = Math.max(...forwardSamples.map((sample) => sample.speedKph))
    const peakForwardHighGain = Math.max(...forwardSamples.map((sample) => sample.audio.engine.highGain))
    const peakForwardIntakeGain = Math.max(...forwardSamples.map((sample) => sample.audio.engine.intakeGain))
    const sawForwardDirection = forwardSamples.some((sample) => sample.audio.engine.direction === 'forward')
    assert(sawForwardDirection, 'Expected engine audio to enter forward mode during acceleration')
    assert(peakForwardSpeed > 5, `Expected forward drive speed above 5 kph, got ${peakForwardSpeed.toFixed(2)} kph`)
    assert(peakForwardHighGain > 0.015, `Expected high stem gain to rise under acceleration, got ${peakForwardHighGain.toFixed(4)}`)
    assert(peakForwardIntakeGain > 0.006, `Expected intake layer to rise under acceleration, got ${peakForwardIntakeGain.toFixed(4)}`)

    await page.waitForTimeout(700)
    await setInput(page, { backward: true })
    const reverseSamples = await sampleEngineWindow(page, 2600)
    await resetInput(page)
    const peakReverseGain = Math.max(...reverseSamples.map((sample) => sample.audio.engine.reverseGain))
    const peakReverseWhineGain = Math.max(...reverseSamples.map((sample) => sample.audio.engine.reverseWhineGain))
    const sawReverseDirection = reverseSamples.some((sample) => sample.audio.engine.direction === 'reverse')
    assert(sawReverseDirection, 'Expected engine audio to enter reverse mode during backward drive')
    assert(peakReverseGain > 0.08, `Expected reverse stem gain to rise in reverse, got ${peakReverseGain.toFixed(4)}`)
    assert(
      peakReverseWhineGain > 0.005,
      `Expected reverse whine layer to rise in reverse, got ${peakReverseWhineGain.toFixed(4)}`,
    )

    const collisionBefore = (await getTestApiState(page)).audio.collision.playedAtMs
    await page.evaluate(() => {
      ;(window as typeof window & {
        __AUTOS_TEST_API__: {
          previewCollision: (options: {
            material: 'rubber' | 'wood' | 'metal' | 'rock' | 'glass'
            tier: 'minor' | 'moderate' | 'major' | 'critical'
            speed: number
            relativeSpeed?: number
          }) => void
        }
      }).__AUTOS_TEST_API__.previewCollision({ material: 'metal', tier: 'major', speed: 16, relativeSpeed: 19 })
    })
    await page.waitForTimeout(150)
    const collisionAfter = (await getTestApiState(page)).audio.collision
    assert(collisionAfter.playedAtMs > collisionBefore, 'Expected collision audio debug state to update after preview')
    assert(collisionAfter.material === 'metal', `Expected metal collision preview, got ${collisionAfter.material}`)
    assert(collisionAfter.tier === 'major', `Expected major collision preview, got ${collisionAfter.tier}`)
    assert(collisionAfter.intensity > 0.7, `Expected strong collision intensity, got ${collisionAfter.intensity.toFixed(3)}`)

    await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true })
    assert(pageErrors.length === 0, `Unexpected page errors detected: ${pageErrors.join(' | ')}`)

    console.log('Audio smoke passed:')
    console.log(`- audio context running and unmuted`)
    console.log(
      `- forward accel reached ${peakForwardSpeed.toFixed(1)} kph with high=${peakForwardHighGain.toFixed(3)} intake=${peakForwardIntakeGain.toFixed(3)}`,
    )
    console.log(`- reverse audio reached reverse=${peakReverseGain.toFixed(3)} whine=${peakReverseWhineGain.toFixed(3)}`)
    console.log(`- collision preview intensity=${collisionAfter.intensity.toFixed(3)} material=${collisionAfter.material}`)
    console.log(`- screenshot=${SCREENSHOT_PATH}`)
  } catch (error) {
    if (isMissingBrowserExecutable(error)) {
      throw new Error('Playwright browser binary is missing. Run `npx playwright install chromium` and retry.')
    }
    throw error
  } finally {
    await browser?.close()
    await closeServer(server)
  }
}

await run()

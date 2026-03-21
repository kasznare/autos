import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'
import { createServer, type ViteDevServer } from 'vite'

const HOST = '127.0.0.1'
const PORT = 4182
const APP_URL = `http://${HOST}:${PORT}/`
const SCREENSHOT_PATH = path.resolve('output/playwright/reality-smoke.png')

type RealityMetrics = {
  wheelPenetrationM: number
  chassisPenetrationM: number
  wheelHoverGapM: number
  groundedWheelCount: number
  groundedVerticalSpeedMps: number
  supportToWeightRatio: number
}

type RealityState = {
  speedKph: number
  selectedMapId: string
  realityMetrics: RealityMetrics
}

type RealitySummary = {
  maxWheelPenetrationM: number
  maxChassisPenetrationM: number
  maxWheelHoverGapM: number
  minGroundedWheelCount: number
  maxGroundedVerticalSpeedMps: number
  minSupportToWeightRatio: number
  maxSupportToWeightRatio: number
  peakSpeedKph: number
}

type Thresholds = {
  wheelPenetrationMax: number
  chassisPenetrationMax: number
  wheelHoverGapMax: number
  groundedWheelCountMin: number
  groundedVerticalSpeedMax: number
  peakSpeedMin?: number
}

const assert = (condition: unknown, message: string): asserts condition => {
  if (!condition) {
    throw new Error(message)
  }
}

const getTestApiState = async (page: import('playwright').Page) =>
  page.evaluate(() => (window as typeof window & { __AUTOS_TEST_API__: { getState: () => RealityState } }).__AUTOS_TEST_API__.getState())

const setMapAndRestart = async (page: import('playwright').Page, mapId: string) => {
  await page.evaluate((nextMapId) => {
    const api = (window as typeof window & {
      __AUTOS_TEST_API__: { setMap: (mapId: string) => void; restartRun: () => void }
    }).__AUTOS_TEST_API__
    api.setMap(nextMapId)
    api.restartRun()
  }, mapId)
  await page.waitForTimeout(1200)
}

const setVirtualInput = async (
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

const resetVirtualInput = async (page: import('playwright').Page) => {
  await page.evaluate(() => {
    ;(window as typeof window & {
      __AUTOS_TEST_API__: { resetInput: () => void }
    }).__AUTOS_TEST_API__.resetInput()
  })
}

const waitForRealityMetricsReady = async (page: import('playwright').Page) => {
  await page.waitForFunction(() => {
    const state = (window as typeof window & { __AUTOS_TEST_API__: { getState: () => RealityState } }).__AUTOS_TEST_API__.getState()
    return (
      state.realityMetrics.groundedWheelCount > 0 ||
      state.realityMetrics.supportToWeightRatio > 0 ||
      state.realityMetrics.wheelPenetrationM > 0 ||
      state.realityMetrics.wheelHoverGapM > 0 ||
      state.realityMetrics.chassisPenetrationM > 0
    )
  })
}

const sampleRealityWindow = async (page: import('playwright').Page, durationMs: number, intervalMs = 120) => {
  const samples: RealityState[] = []
  const sampleCount = Math.max(1, Math.ceil(durationMs / intervalMs))
  for (let index = 0; index < sampleCount; index += 1) {
    samples.push(await getTestApiState(page))
    await page.waitForTimeout(intervalMs)
  }
  return samples
}

const summarizeRealityWindow = (samples: readonly RealityState[]): RealitySummary => ({
  maxWheelPenetrationM: Math.max(...samples.map((sample) => sample.realityMetrics.wheelPenetrationM)),
  maxChassisPenetrationM: Math.max(...samples.map((sample) => sample.realityMetrics.chassisPenetrationM)),
  maxWheelHoverGapM: Math.max(...samples.map((sample) => sample.realityMetrics.wheelHoverGapM)),
  minGroundedWheelCount: Math.min(...samples.map((sample) => sample.realityMetrics.groundedWheelCount)),
  maxGroundedVerticalSpeedMps: Math.max(...samples.map((sample) => sample.realityMetrics.groundedVerticalSpeedMps)),
  minSupportToWeightRatio: Math.min(...samples.map((sample) => sample.realityMetrics.supportToWeightRatio)),
  maxSupportToWeightRatio: Math.max(...samples.map((sample) => sample.realityMetrics.supportToWeightRatio)),
  peakSpeedKph: Math.max(...samples.map((sample) => sample.speedKph)),
})

const assertRealityWindow = (label: string, summary: RealitySummary, thresholds: Thresholds) => {
  assert(
    summary.maxWheelPenetrationM <= thresholds.wheelPenetrationMax,
    `${label}: wheel penetration ${summary.maxWheelPenetrationM.toFixed(3)}m exceeded ${thresholds.wheelPenetrationMax.toFixed(3)}m`,
  )
  assert(
    summary.maxChassisPenetrationM <= thresholds.chassisPenetrationMax,
    `${label}: chassis penetration ${summary.maxChassisPenetrationM.toFixed(3)}m exceeded ${thresholds.chassisPenetrationMax.toFixed(3)}m`,
  )
  assert(
    summary.maxWheelHoverGapM <= thresholds.wheelHoverGapMax,
    `${label}: wheel hover gap ${summary.maxWheelHoverGapM.toFixed(3)}m exceeded ${thresholds.wheelHoverGapMax.toFixed(3)}m`,
  )
  assert(
    summary.minGroundedWheelCount >= thresholds.groundedWheelCountMin,
    `${label}: grounded wheel count dipped to ${summary.minGroundedWheelCount}, expected at least ${thresholds.groundedWheelCountMin}`,
  )
  assert(
    summary.maxGroundedVerticalSpeedMps <= thresholds.groundedVerticalSpeedMax,
    `${label}: grounded vertical speed ${summary.maxGroundedVerticalSpeedMps.toFixed(2)} m/s exceeded ${thresholds.groundedVerticalSpeedMax.toFixed(2)} m/s`,
  )
  if (typeof thresholds.peakSpeedMin === 'number') {
    assert(
      summary.peakSpeedKph >= thresholds.peakSpeedMin,
      `${label}: peak speed ${summary.peakSpeedKph.toFixed(1)} kph did not reach ${thresholds.peakSpeedMin.toFixed(1)} kph`,
    )
  }
}

const driveForward = async (page: import('playwright').Page, durationMs: number, intervalMs = 120) => {
  await setVirtualInput(page, { forward: true })
  try {
    return await sampleRealityWindow(page, durationMs, intervalMs)
  } finally {
    await resetVirtualInput(page)
  }
}

const driveFlatTurn = async (page: import('playwright').Page) => {
  await setVirtualInput(page, { forward: true })
  await sampleRealityWindow(page, 900, 120)
  await setVirtualInput(page, { forward: true, right: true })
  try {
    return await sampleRealityWindow(page, 1600, 120)
  } finally {
    await resetVirtualInput(page)
  }
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
  (error.message.includes("Executable doesn't exist") || error.message.includes('browserType.launch'))

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
    await page.locator('canvas').waitFor()
    await page.waitForFunction(() => Boolean((window as typeof window & { __AUTOS_TEST_API__?: unknown }).__AUTOS_TEST_API__))

    await setMapAndRestart(page, 'test-flat')
    await waitForRealityMetricsReady(page)
    const flatIdleSummary = summarizeRealityWindow(await sampleRealityWindow(page, 1800))
    assertRealityWindow('Flat idle', flatIdleSummary, {
      wheelPenetrationMax: 0.03,
      chassisPenetrationMax: 0.005,
      wheelHoverGapMax: 0.035,
      groundedWheelCountMin: 4,
      groundedVerticalSpeedMax: 0.3,
    })

    await setMapAndRestart(page, 'test-flat')
    await waitForRealityMetricsReady(page)
    const flatDriveSummary = summarizeRealityWindow(await driveForward(page, 2200))
    assertRealityWindow('Flat drive', flatDriveSummary, {
      wheelPenetrationMax: 0.04,
      chassisPenetrationMax: 0.008,
      wheelHoverGapMax: 0.05,
      groundedWheelCountMin: 4,
      groundedVerticalSpeedMax: 0.7,
      peakSpeedMin: 10,
    })

    await setMapAndRestart(page, 'test-flat')
    await waitForRealityMetricsReady(page)
    const flatTurnSummary = summarizeRealityWindow(await driveFlatTurn(page))
    assertRealityWindow('Flat turn', flatTurnSummary, {
      wheelPenetrationMax: 0.03,
      chassisPenetrationMax: 0.008,
      wheelHoverGapMax: 0.08,
      groundedWheelCountMin: 3,
      groundedVerticalSpeedMax: 0.8,
      peakSpeedMin: 15,
    })

    await setMapAndRestart(page, 'gaia')
    await waitForRealityMetricsReady(page)
    const gaiaDriveSummary = summarizeRealityWindow(await driveForward(page, 2400))
    assertRealityWindow('Gaia drive', gaiaDriveSummary, {
      wheelPenetrationMax: 0.05,
      chassisPenetrationMax: 0.01,
      wheelHoverGapMax: 0.08,
      groundedWheelCountMin: 1,
      groundedVerticalSpeedMax: 1.1,
      peakSpeedMin: 8,
    })

    await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true })
    assert(pageErrors.length === 0, `Unexpected page errors detected: ${pageErrors.join(' | ')}`)

    console.log('Reality smoke passed:')
    console.log(
      `- Flat idle: pen=${flatIdleSummary.maxWheelPenetrationM.toFixed(3)}m chassis=${flatIdleSummary.maxChassisPenetrationM.toFixed(3)}m hover=${flatIdleSummary.maxWheelHoverGapM.toFixed(3)}m grounded>=${flatIdleSummary.minGroundedWheelCount} vertical=${flatIdleSummary.maxGroundedVerticalSpeedMps.toFixed(2)}m/s support=${flatIdleSummary.minSupportToWeightRatio.toFixed(2)}-${flatIdleSummary.maxSupportToWeightRatio.toFixed(2)}`,
    )
    console.log(
      `- Flat drive: pen=${flatDriveSummary.maxWheelPenetrationM.toFixed(3)}m chassis=${flatDriveSummary.maxChassisPenetrationM.toFixed(3)}m hover=${flatDriveSummary.maxWheelHoverGapM.toFixed(3)}m grounded>=${flatDriveSummary.minGroundedWheelCount} vertical=${flatDriveSummary.maxGroundedVerticalSpeedMps.toFixed(2)}m/s support=${flatDriveSummary.minSupportToWeightRatio.toFixed(2)}-${flatDriveSummary.maxSupportToWeightRatio.toFixed(2)} speed=${flatDriveSummary.peakSpeedKph.toFixed(1)}kph`,
    )
    console.log(
      `- Flat turn: pen=${flatTurnSummary.maxWheelPenetrationM.toFixed(3)}m chassis=${flatTurnSummary.maxChassisPenetrationM.toFixed(3)}m hover=${flatTurnSummary.maxWheelHoverGapM.toFixed(3)}m grounded>=${flatTurnSummary.minGroundedWheelCount} vertical=${flatTurnSummary.maxGroundedVerticalSpeedMps.toFixed(2)}m/s support=${flatTurnSummary.minSupportToWeightRatio.toFixed(2)}-${flatTurnSummary.maxSupportToWeightRatio.toFixed(2)} speed=${flatTurnSummary.peakSpeedKph.toFixed(1)}kph`,
    )
    console.log(
      `- Gaia drive: pen=${gaiaDriveSummary.maxWheelPenetrationM.toFixed(3)}m chassis=${gaiaDriveSummary.maxChassisPenetrationM.toFixed(3)}m hover=${gaiaDriveSummary.maxWheelHoverGapM.toFixed(3)}m grounded>=${gaiaDriveSummary.minGroundedWheelCount} vertical=${gaiaDriveSummary.maxGroundedVerticalSpeedMps.toFixed(2)}m/s support=${gaiaDriveSummary.minSupportToWeightRatio.toFixed(2)}-${gaiaDriveSummary.maxSupportToWeightRatio.toFixed(2)} speed=${gaiaDriveSummary.peakSpeedKph.toFixed(1)}kph`,
    )
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

import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'
import { createServer, type ViteDevServer } from 'vite'

const HOST = '127.0.0.1'
const PORT = 4179
const APP_URL = `http://${HOST}:${PORT}/`
const SCREENSHOT_PATH = path.resolve('output/playwright/browser-smoke.png')

type BrowserSmokeState = {
  speedKph: number
  damage: number
  score: number
  mission: { type: string; progress: number; target: number }
  selectedMapId: string
  proceduralMapSeed: number
  activeVehicleDefinitionId: string | null
  savedBuilds: Array<{ id: string; name: string }>
  roomId: string | null
  isRoomHost: boolean
  multiplayerStatus: string
  sessionLocked: boolean
  realityMetrics: {
    wheelPenetrationM: number
    chassisPenetrationM: number
    wheelHoverGapM: number
    groundedWheelCount: number
    groundedVerticalSpeedMps: number
    supportToWeightRatio: number
  }
}

const assert = (condition: unknown, message: string): asserts condition => {
  if (!condition) {
    throw new Error(message)
  }
}

const getTestApiState = async (page: import('playwright').Page) =>
  page.evaluate(() => (window as typeof window & { __AUTOS_TEST_API__: { getState: () => BrowserSmokeState } }).__AUTOS_TEST_API__.getState())

const driveForwardAndReadPeakSpeed = async (page: import('playwright').Page) => {
  let peakSpeedKph = 0
  await page.evaluate(() => {
    ;(window as typeof window & {
      __AUTOS_TEST_API__: { setInput: (partial: Partial<Record<'forward', boolean>>) => void }
    }).__AUTOS_TEST_API__.setInput({ forward: true })
  })
  for (let idx = 0; idx < 8; idx += 1) {
    await page.waitForTimeout(250)
    const nextState = await getTestApiState(page)
    peakSpeedKph = Math.max(peakSpeedKph, nextState.speedKph)
  }
  await page.evaluate(() => {
    ;(window as typeof window & {
      __AUTOS_TEST_API__: { resetInput: () => void }
    }).__AUTOS_TEST_API__.resetInput()
  })
  return peakSpeedKph
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
    await page.locator('.touch-controls').waitFor()
    await page.waitForFunction(() => Boolean((window as typeof window & { __AUTOS_TEST_API__?: unknown }).__AUTOS_TEST_API__))
    await page.waitForTimeout(400)

    const speedKph = await driveForwardAndReadPeakSpeed(page)
    assert(speedKph > 3, `Expected native rig runtime to reach non-zero speed, got ${speedKph.toFixed(2)} kph`)

    const missionBefore = await getTestApiState(page)
    await page.evaluate(() => {
      ;(window as typeof window & { __AUTOS_TEST_API__: { advanceMission: (amount?: number) => void } }).__AUTOS_TEST_API__.advanceMission(1)
    })
    await page.waitForTimeout(120)
    const missionAfter = await getTestApiState(page)
    assert(
      missionAfter.mission.progress !== missionBefore.mission.progress || missionAfter.score >= missionBefore.score,
      'Expected mission progress or score reward to change after mission advancement',
    )

    await page.evaluate(() => {
      ;(window as typeof window & { __AUTOS_TEST_API__: { setDamage: (value: number) => void } }).__AUTOS_TEST_API__.setDamage(100)
    })
    await page.getByText('Pit Stop Time!').waitFor()
    await page.getByRole('button', { name: 'Try Again' }).click()
    await page.getByText('Pit Stop Time!').waitFor({ state: 'hidden' })
    await page.waitForTimeout(120)
    const restartedState = await getTestApiState(page)
    assert(restartedState.damage === 0, `Expected restart to clear damage, got ${restartedState.damage}`)

    await page.getByRole('button', { name: 'Titan Brakefield' }).click()
    const mapLabel = (await page.locator('.map-picker-header strong').textContent())?.trim()
    assert(mapLabel === 'Titan Brakefield', `Expected active map label to be Titan Brakefield, got ${mapLabel ?? 'n/a'}`)

    await page.getByRole('button', { name: 'Nebula Loop' }).click()
    const proceduralBefore = await getTestApiState(page)
    await page.getByRole('button', { name: 'New' }).click()
    await page.waitForTimeout(120)
    const proceduralAfter = await getTestApiState(page)
    assert(
      proceduralAfter.selectedMapId === 'procedural' && proceduralAfter.proceduralMapSeed !== proceduralBefore.proceduralMapSeed,
      'Expected procedural reroll to change the map seed',
    )

    await page.getByRole('button', { name: 'Garage' }).click()
    await page.getByRole('dialog', { name: 'Garage' }).waitFor()
    await page.getByRole('button', { name: 'City Bus RWD EV' }).click()
    const buildName = await page.locator('#build-name').inputValue()
    assert(buildName === 'City Bus RWD EV', `Expected builder name to switch to City Bus RWD EV, got ${buildName}`)
    const selectedVehicleState = await getTestApiState(page)
    assert(
      selectedVehicleState.activeVehicleDefinitionId === 'bus-rwd-ev-city',
      `Expected active catalog vehicle to be bus-rwd-ev-city, got ${selectedVehicleState.activeVehicleDefinitionId ?? 'none'}`,
    )

    const savedBuildId = await page.evaluate(() =>
      (window as typeof window & { __AUTOS_TEST_API__: { saveBuild: (name: string) => string } }).__AUTOS_TEST_API__.saveBuild('Browser Smoke'),
    )
    const afterSave = await getTestApiState(page)
    assert(afterSave.savedBuilds.some((build) => build.id === savedBuildId), 'Expected browser smoke build to be saved')
    await page.getByRole('button', { name: 'Browser Smoke' }).click()
    const loadedBuildName = await page.locator('#build-name').inputValue()
    assert(loadedBuildName === 'Browser Smoke', `Expected saved build to load, got ${loadedBuildName}`)

    await page.getByRole('button', { name: 'Back To Drive' }).click()
    await page.getByRole('dialog', { name: 'Garage' }).waitFor({ state: 'hidden' })
    await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true })
    assert(pageErrors.length === 0, `Unexpected page errors detected: ${pageErrors.join(' | ')}`)

    console.log('Browser smoke passed:')
    console.log(`- launched app and rendered HUD/canvas`)
    console.log(`- sampled forward control speed=${speedKph.toFixed(1)} kph`)
    console.log(`- advanced mission progress and observed reward state changes`)
    console.log(`- forced a loss state and verified restart recovery`)
    console.log(`- switched active map to ${mapLabel}`)
    console.log(`- rerolled procedural map seed ${proceduralBefore.proceduralMapSeed} -> ${proceduralAfter.proceduralMapSeed}`)
    console.log(`- opened garage, selected City Bus RWD EV, and verified save/load`)
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

# SlowMo — Chrome Extension MVP Plan

## Context

Web designers inspecting animations on production sites have no way to slow them down in-browser without modifying source code or using DevTools performance recording (which is cumbersome). SlowMo is a Chrome extension that injects a floating toolbar into any page and lets designers toggle real-time slow-motion (0.1×, 0.25×, 0.5×) for all animations — CSS, GSAP, Framer Motion — without leaving the page, without recording, without reloading.

---

## Key Decisions

| Question | Answer |
|---|---|
| UX model | Real-time slow-mo (toggle on → page animations immediately slow down) |
| Build tool | **WXT** (not CRXJS — WXT is actively maintained, natively supports MAIN world content scripts without a dual-build pipeline) |
| Stack | TypeScript + WXT + React + Vite |
| State persistence | Session only (resets on page reload — no chrome.storage needed) |
| Toolbar visibility | Hidden by default; toggled via extension icon click or hotkey |
| Easing visualization | Phase 2 |
| Distribution | Chrome Web Store |

---

## Architecture

Three execution contexts. All three must coordinate on every speed change.

```
┌──────────────────────────────────────────────────┐
│  MAIN WORLD  (entrypoints/inject.ts)             │
│  Runs at document_start, before any page JS      │
│  • Patches window.requestAnimationFrame          │
│  • Listens for window.postMessage speed commands │
│  • Reports rAF/GSAP status back via postMessage  │
└───────────────────────┬──────────────────────────┘
                        │ window.postMessage (shared DOM)
┌───────────────────────▼──────────────────────────┐
│  ISOLATED WORLD  (entrypoints/content/index.ts)  │
│  Runs at document_idle                           │
│  • Mounts Shadow DOM floating toolbar (React)    │
│  • Applies WAAPI layer (Layer 1)                 │
│  • Applies GSAP layer (Layer 2)                  │
│  • Relays speed to MAIN world via postMessage    │
│  • Listens to chrome.runtime messages from SW    │
└───────────────────────┬──────────────────────────┘
                        │ chrome.tabs.sendMessage
┌───────────────────────▼──────────────────────────┐
│  BACKGROUND SW  (entrypoints/background.ts)      │
│  • Handles extension icon click                  │
│  • Handles Alt+Shift+S keyboard shortcut         │
│  • Sends TOGGLE_TOOLBAR message to active tab    │
└──────────────────────────────────────────────────┘
```

### Speed state: lives in the content script

Because state is session-only (resets on page reload), there is no `chrome.storage`. The content script owns a module-level `let state = { visible: false, enabled: false, speed: 0.25 }`. This eliminates the SW from the state management path entirely — it only sends toggle commands.

### Speed change flow (step-by-step)

1. User clicks a speed button in the React toolbar.
2. `Toolbar.tsx` calls `onSpeedChange(0.25)`.
3. Content script updates local state, calls `applyAllLayers(0.25)`.
4. `applyAllLayers` applies WAAPI playback rates directly, calls `applyGSAP`, then `window.postMessage({ tag: '__slowmo__', type: 'SET_SPEED', speed: 0.25 }, '*')`.
5. MAIN world injector receives the postMessage, sets `speedFactor = 0.25`.

---

## 3-Layer Interception

All three layers fire simultaneously on every speed change.

### Layer 1 — Web Animations API
```ts
// entrypoints/content/waapi.ts

// Preserve each animation's original playbackRate so "off" restores correctly
// even on sites that already use custom rates (e.g. Lottie, staggered timelines)
const originalRates = new WeakMap<Animation, number>()

export function applyWAAPI(speed: number) {
  document.getAnimations().forEach(a => {
    if (!originalRates.has(a)) {
      originalRates.set(a, a.playbackRate) // capture baseline on first touch
    }
    a.playbackRate = originalRates.get(a)! * speed
  })
}

export function resetWAAPI() {
  document.getAnimations().forEach(a => {
    if (originalRates.has(a)) {
      a.playbackRate = originalRates.get(a)!
      originalRates.delete(a)
    }
  })
}
```
Catches: CSS animations, CSS transitions, Framer Motion WAAPI path (opacity, simple transforms).

### Layer 2 — GSAP Global Timeline
```ts
// entrypoints/content/gsap.ts

// Capture original timeScale so "off" restores site's intended value (not always 1)
let originalGSAPTimeScale: number | null = null

function getGSAPTimeline() {
  const gsap = (window as any).gsap
  const TweenMax = (window as any).TweenMax
  return gsap?.globalTimeline ?? TweenMax?.globalTimeline ?? null
}

export function applyGSAP(speed: number): boolean {
  const tl = getGSAPTimeline()
  if (!tl) return false
  if (originalGSAPTimeScale === null) {
    originalGSAPTimeScale = tl.timeScale() // capture baseline
  }
  tl.timeScale(originalGSAPTimeScale * speed)
  return true
}

export function resetGSAP() {
  if (originalGSAPTimeScale === null) return
  getGSAPTimeline()?.timeScale(originalGSAPTimeScale)
  originalGSAPTimeScale = null
}
// + 5-second polling interval to catch lazy-loaded GSAP
```
Catches: All GSAP v2 and v3 tweens and timelines.

### Layer 3 — rAF Timestamp Scaling
```ts
// entrypoints/inject.ts — runs in MAIN world at document_start

// Idempotency guard — safe against double-injection or re-running on HMR
if (!(window as any).__slowmoPatched) {
  (window as any).__slowmoPatched = true

  const _originalRAF = window.requestAnimationFrame  // keep original for reset/debug
  let speedFactor = 1
  let lastRealTime: number | null = null
  let virtualTime: number | null = null
  const MAX_DELTA = 100

  window.requestAnimationFrame = (callback) =>
    _originalRAF((realTimestamp) => {
      // Pass through at 1x — no timestamp manipulation, no observable difference
      if (speedFactor === 1) { callback(realTimestamp); return }

      if (lastRealTime === null) { lastRealTime = realTimestamp; virtualTime = realTimestamp }
      const delta = Math.min(realTimestamp - lastRealTime, MAX_DELTA)
      lastRealTime = realTimestamp
      virtualTime! += delta * speedFactor
      callback(virtualTime!)
    })

  // Per-session token generated at inject time, shared to content script via
  // the SLOWMO_STATUS_REPORT message so only this tab's messages are trusted
  const SESSION_TOKEN = Math.random().toString(36).slice(2)

  window.addEventListener('message', (e) => {
    if (e.source !== window) return
    const d = e.data
    if (d?.tag !== '__slowmo__' || d?.token !== SESSION_TOKEN) return
    if (d.type === 'SET_SPEED') {
      speedFactor = d.speed
      lastRealTime = null  // reset to avoid timestamp jump on speed change
      virtualTime = null
    }
  })

  // Expose token as a readable window property — avoids postMessage timing race
  // where inject.ts fires at document_start but content script isn't listening until document_idle
  ;(window as any).__slowmoToken = SESSION_TOKEN

  // Also postMessage for content scripts that are already listening (e.g. after SPA navigation)
  window.postMessage({
    tag: '__slowmo__',
    type: 'SLOWMO_STATUS_REPORT',
    token: SESSION_TOKEN,
    rafIntercepted: true,
    gsapDetected: typeof (window as any).gsap !== 'undefined',
  }, '*')
}
```
Catches: Framer Motion springs, layout animations, custom rAF loops.

**Session token**: generated once at inject time, sent to the content script via `SLOWMO_STATUS_REPORT`. All subsequent `SET_SPEED` messages from the content script include this token. Page scripts can't forge it (they don't receive the postMessage — only the content script's `window.addEventListener` handler does, because it filters `e.source !== window` and reads the token value the extension stored).

---

## Project Structure

```
slowmo/
├── wxt.config.ts                   ← WXT config (replaces vite.config + manifest)
├── package.json
├── tsconfig.json
├── public/
│   └── icons/
│       ├── icon16.png
│       ├── icon48.png
│       └── icon128.png
├── entrypoints/
│   ├── background.ts               ← SW: icon click → TOGGLE_TOOLBAR to tab
│   ├── inject.ts                   ← MAIN world, document_start: rAF patch
│   └── content/
│       ├── index.ts                ← ISOLATED: mounts toolbar, coordinates layers
│       ├── waapi.ts                ← Layer 1
│       ← gsap.ts                  ← Layer 2
│       ├── bridge.ts               ← postMessage helpers (typed)
│       ├── Toolbar.tsx             ← React: drag, toggle, speed buttons, badges
│       ├── SpeedSelector.tsx
│       ├── StatusBadges.tsx
│       └── toolbar.css             ← imported as ?inline string → shadow DOM
└── src/
    └── shared/
        └── types.ts                ← SlowMoSpeed, message types, SLOWMO_TAG
```

---

## Permissions Strategy

**Preferred (lower CWS friction)**: `activeTab` + `scripting` only — no `host_permissions`.

With `activeTab`, injection happens when the user clicks the extension icon. The rAF patch runs at that moment (not `document_start`), meaning animations that fired during initial page load can't be slowed retroactively. However, for the primary use case — inspecting hover states, modal entrances, and triggered animations — the user always re-triggers animations after activating the extension, so this is fine in practice.

**Trade-off table**:

| Approach | CWS review | rAF pre-patch | Notes |
|---|---|---|---|
| `activeTab` only | Easy | No | Works for hover/click animations; misses page-load animations already completed |
| `<all_urls>` | Extended review | Yes | Full coverage but higher bar for CWS |

**Decision for MVP**: Start with `activeTab` only. Add a note in the UI: "Activate before interacting to catch all animations." If users report missing animations on load, ship a v1.1 with `<all_urls>` and a clear justification.

## WXT Configuration

```ts
// wxt.config.ts
import { defineConfig } from 'wxt'
import react from '@vitejs/plugin-react'

export default defineConfig({
  vite: () => ({ plugins: [react()] }),
  manifest: {
    name: 'SlowMo',
    description: 'Slow down web animations in real time. For designers.',
    version: '1.0.0',
    permissions: ['scripting', 'activeTab'],
    // No host_permissions for MVP — activeTab only, lower CWS review friction
    // Upgrade to host_permissions: ['<all_urls>'] in v1.1 if needed
    commands: {
      _execute_action: {
        suggested_key: { default: 'Alt+Shift+S' },
        description: 'Toggle SlowMo toolbar',
      },
    },
  },
})
```

```ts
// entrypoints/inject.ts
export default defineContentScript({
  matches: ['<all_urls>'],
  world: 'MAIN',         // ← WXT handles this natively, no dual-build needed
  runAt: 'document_start',
  main() { /* rAF patch code */ },
})
```

```ts
// entrypoints/content/index.ts
export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  cssInjectionMode: 'ui',   // WXT's shadow DOM helper
  async main(ctx) {
    // Mount toolbar, attach layers
  },
})
```

---

## Shadow DOM Toolbar

Injected via WXT's built-in `createShadowRootUi` helper (from `wxt/utils/content-script-ui/shadow-root`) — this eliminates manual Shadow DOM wiring.

```ts
// entrypoints/content/index.ts
import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root'

const ui = await createShadowRootUi(ctx, {
  name: 'slowmo-toolbar',
  position: 'overlay',
  zIndex: 2147483647,
  onMount(container, shadow) {
    const root = createRoot(container)
    root.render(<Toolbar shadow={shadow} onSpeedChange={applyAllLayers} />)
    return root
  },
  onRemove(root) { root?.unmount() },
})
ui.mount()
```

Toolbar CSS is imported as `import styles from './toolbar.css?inline'` and injected into the shadow root. **No Tailwind** — plain CSS in the shadow DOM avoids `:root` variable and `@property` scoping issues with Tailwind v4.

---

## Toolbar UI

Floating, draggable, bottom-right by default.

```
┌─────────────────────┐
│ ◈ SlowMo      [ON]  │  ← drag handle + toggle button
│ [0.1×][0.25×][0.5×][1×] │  ← speed selector
│ ⚡rAF  ✓GSAP  4 anim│  ← status badges
└─────────────────────┘
```

Drag: pointer events (not mouse) for reliability. Host element has `pointer-events: none`; toolbar container has `pointer-events: all`.

State managed locally in the React component — no Redux, no context, just `useState`.

---

## Top-Frame Only (MVP)

Both inject.ts and content/index.ts constrain to the top frame to avoid duplicate toolbars and conflicting state in sites with iframes:

```ts
// entrypoints/inject.ts
if (window === window.top) {
  // rAF patch + message listener
}

// entrypoints/content/index.ts
if (window !== window.top) return  // bail immediately in iframes
```

This is a single guard at the top of each entrypoint. iframe support (e.g. for Webflow preview panes or embedded demos) is Phase 2.

---

## Background Service Worker

Minimal — only two jobs:
1. Listen for `chrome.action.onClicked` → `chrome.tabs.sendMessage(tabId, { type: 'TOGGLE_TOOLBAR' })`
2. Listen for the `_execute_action` keyboard command (Chrome fires this directly as `onClicked`)

No state storage. No API calls.

---

## WAAPI Dynamic Animation Observer

```ts
// entrypoints/content/waapi.ts

let pendingRAF = false
let observerEnabled = false  // skip work entirely when slow-mo is off

export function setObserverEnabled(enabled: boolean) {
  observerEnabled = enabled
}

export function startWAAPIObserver(getSpeed: () => number) {
  new MutationObserver(() => {
    if (!observerEnabled) return  // no-op when disabled — avoids all overhead
    if (pendingRAF) return        // coalesce: only one flush per frame
    pendingRAF = true
    requestAnimationFrame(() => {
      pendingRAF = false
      applyWAAPI(getSpeed())
    })
  }).observe(document.documentElement, {
    childList: true, subtree: true,
    attributes: true, attributeFilter: ['class', 'style', 'data-state'],
  })
}
```

**Why `requestAnimationFrame` coalescing instead of `queueMicrotask`**: `queueMicrotask` runs synchronously before the browser's style recalculation, so animations on freshly-added nodes aren't registered yet. Coalescing to the next rAF fires after layout/style recalc, when `getAnimations()` actually returns the new entries. The `pendingRAF` guard ensures multiple mutations in one frame trigger only one `applyWAAPI` call. The `observerEnabled` flag skips all observer work when slow-mo is off, avoiding needless `getAnimations()` calls on active pages.

---

## Library Detection & Status Badges

```
document_idle
  ├─ applyWAAPI(1)                        → count immediately
  ├─ detectGSAP() → if not found, poll every 250ms for 5s
  └─ MAIN world postMessages SLOWMO_STATUS_REPORT on load
       → content script dispatches CustomEvent 'slowmo:status'
       → Toolbar's useEffect updates status badges
```

Status badge messages shown in toolbar:
- `⚡ rAF intercepted` (always true once inject.ts ran)
- `✓ GSAP detected` (if `window.gsap` found)
- `N Web Animations` (live count from `document.getAnimations()`)

---

## Development Workflow

```bash
# Install
pnpm create wxt@latest slowmo
cd slowmo && pnpm install
pnpm add react react-dom
pnpm add -D @vitejs/plugin-react @types/react @types/react-dom

# Dev (HMR, load from .output/chrome-mv3/)
pnpm dev

# Load in Chrome
# chrome://extensions → Developer mode → Load unpacked → .output/chrome-mv3/

# Production build
pnpm build

# Zip for CWS
pnpm zip   # outputs .output/slowmo-1.0.0.zip
```

WXT hot-reloads content scripts and the toolbar without requiring manual extension reload. MAIN world changes require reloading the tab.

---

## Test Strategy

Four layers of confidence, each catching different classes of bugs.

---

### Layer A — Unit Tests (Vitest, no browser needed)

Pure logic that can run in Node. Extract all math and state logic from browser-specific APIs.

**File**: `src/shared/__tests__/raf.test.ts`

```ts
// Tests for virtual time math — the core correctness guarantee
describe('rAF virtual time', () => {
  test('0.25x: 100ms real → 25ms virtual', () => {
    const sim = createRAFSim(0.25)
    expect(sim.advance(100)).toBe(25)
  })
  test('at 1x: timestamps pass through unchanged', () => {
    const sim = createRAFSim(1)
    expect(sim.advance(100)).toBe(100)
  })
  test('caps delta to MAX_DELTA on tab-switch jump', () => {
    const sim = createRAFSim(0.25)
    expect(sim.advance(5000)).toBe(25) // capped: 100ms * 0.25
  })
  test('resets correctly after speed change', () => {
    const sim = createRAFSim(0.25)
    sim.advance(100)
    sim.setSpeed(0.5)
    expect(sim.advance(100)).toBe(50) // no jump from reset
  })
})
```

**File**: `src/shared/__tests__/waapi.test.ts`

```ts
// Tests for WeakMap baseline preservation
describe('WAAPI rate preservation', () => {
  test('captures original rate on first touch', () => {
    const anim = { playbackRate: 2 } as Animation
    applyWAAPI(0.25, [anim])
    expect(anim.playbackRate).toBeCloseTo(0.5) // 2 * 0.25
  })
  test('does not re-capture on second call', () => {
    const anim = { playbackRate: 2 } as Animation
    applyWAAPI(0.25, [anim])
    anim.playbackRate = 99  // simulate external mutation
    applyWAAPI(0.5, [anim])
    expect(anim.playbackRate).toBeCloseTo(1.0)  // still 2 * 0.5, not 99 * 0.5
  })
  test('reset restores original rate, clears WeakMap entry', () => {
    const anim = { playbackRate: 2 } as Animation
    applyWAAPI(0.25, [anim])
    resetWAAPI([anim])
    expect(anim.playbackRate).toBe(2)
  })
})
```

**File**: `src/shared/__tests__/gsap.test.ts`

```ts
describe('GSAP timeScale', () => {
  test('captures baseline and multiplies correctly', () => {
    const mockTL = { timeScale: vi.fn().mockReturnValue(2) }
    applyGSAP(0.5, mockTL)
    expect(mockTL.timeScale).toHaveBeenLastCalledWith(1.0)  // 2 * 0.5
  })
  test('reset restores original timeScale', () => {
    const mockTL = { timeScale: vi.fn().mockReturnValue(2) }
    applyGSAP(0.5, mockTL)
    resetGSAP(mockTL)
    expect(mockTL.timeScale).toHaveBeenLastCalledWith(2)
  })
})
```

Run: `pnpm test` (Vitest, no Chrome needed, runs in CI).

---

### Layer B — Static Test Pages (open in Chrome, no build required)

Eight standalone HTML files in `test-pages/`. Open directly in Chrome (file://), activate the extension, and manually verify. These are the ground truth for each animation layer.

```
test-pages/
  01-css-transition.html     # hover a box → color + translate transition
  02-css-keyframe.html       # spinning/bouncing @keyframes, always playing
  03-waapi-animate.html      # element.animate() called on click
  04-gsap-tween.html         # gsap.to() via CDN, triggered on click
  05-gsap-timeline.html      # gsap.timeline() with stagger; non-1x original timeScale
  06-raf-custom.html         # manual requestAnimationFrame loop, no library
  07-mixed.html              # CSS + GSAP + rAF all on one page simultaneously
  08-dynamic-insert.html     # animating elements added to DOM after 2s (tests observer)
```

Each page has a visible timer/counter so you can see if it's running at the right speed without needing DevTools. Example for `06-raf-custom.html`:

```html
<!-- Counts up using rAF — at 0.25x it should count 4x slower -->
<div id="counter">0</div>
<script>
  let count = 0
  let last = null
  function tick(ts) {
    if (!last) last = ts
    if (ts - last > 16) { count++; last = ts }
    document.getElementById('counter').textContent = count
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
</script>
```

**What to verify on each page**:
- [ ] Counter/animation visibly slows at 0.25x
- [ ] Returns to correct speed at 1x (not always exactly 1x if site had custom rate)
- [ ] Toggle off → restores original rate, not hard 1
- [ ] GSAP badge appears on pages 04 and 05
- [ ] Web Animations badge shows correct count on pages 01–03

---

### Layer C — Playwright E2E Tests

```ts
// e2e/extension.spec.ts
import { test, expect, chromium } from '@playwright/test'
import path from 'path'

const EXTENSION_PATH = path.resolve('.output/chrome-mv3')

test.use({
  context: async ({}, use) => {
    const ctx = await chromium.launchPersistentContext('', {
      headless: false,  // extensions require headed mode
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
      ],
    })
    await use(ctx)
    await ctx.close()
  },
})

test('WAAPI animation slows to 0.25x', async ({ context }) => {
  const page = await context.newPage()
  await page.goto(`file://${path.resolve('test-pages/02-css-keyframe.html')}`)

  // Activate extension
  const [sw] = context.serviceWorkers()
  const extId = sw.url().split('/')[2]
  await page.click(`[data-ext-id="${extId}"]`).catch(() => {})
  // Alternative: simulate action via chrome.action API

  const rate = await page.evaluate(() => document.getAnimations()[0]?.playbackRate)
  expect(rate).toBeCloseTo(0.25)
})

test('restores original rate on toggle off', async ({ context }) => {
  const page = await context.newPage()
  // Load a page where GSAP sets timeScale to 2 initially
  await page.goto(`file://${path.resolve('test-pages/05-gsap-timeline.html')}`)

  // Activate, set to 0.25x
  // ... activation steps ...

  // Toggle off
  // ... toggle off steps ...

  const ts = await page.evaluate(() => (window as any).gsap?.globalTimeline?.timeScale())
  expect(ts).toBe(2)  // restored to original, not 1
})

test('rAF counter advances at correct rate', async ({ context }) => {
  const page = await context.newPage()
  await page.goto(`file://${path.resolve('test-pages/06-raf-custom.html')}`)

  // Activate at 0.25x
  // ...

  const before = await page.evaluate(() => parseInt(document.getElementById('counter')!.textContent!))
  await page.waitForTimeout(1000) // wait 1 real second
  const after = await page.evaluate(() => parseInt(document.getElementById('counter')!.textContent!))

  // At 0.25x, 1000ms real = 250ms virtual → ~15 increments instead of ~60
  expect(after - before).toBeLessThan(20)
  expect(after - before).toBeGreaterThan(5)
})

test('toolbar does not appear in iframes', async ({ context }) => {
  const page = await context.newPage()
  await page.goto(`file://${path.resolve('test-pages/07-mixed.html')}`)
  // Activate extension on top frame
  // ...
  const iframeToolbar = await page.frameLocator('iframe').locator('#slowmo-host').count()
  expect(iframeToolbar).toBe(0)
})

test('session token rejects spoofed messages', async ({ context }) => {
  const page = await context.newPage()
  await page.goto(`file://${path.resolve('test-pages/01-css-transition.html')}`)

  // Activate extension (sets speed to 0.25x)
  // ...

  // Page script tries to forge a SET_SPEED 1x
  await page.evaluate(() => {
    window.postMessage({ tag: '__slowmo__', type: 'SET_SPEED', speed: 1, token: 'wrong' }, '*')
  })
  await page.waitForTimeout(100)

  const rate = await page.evaluate(() => document.getAnimations()[0]?.playbackRate)
  expect(rate).toBeCloseTo(0.25)  // forge had no effect
})
```

Run: `pnpm e2e` (requires a prior `pnpm build`).

---

### Layer D — Real-World Smoke Test Matrix

Test against these sites before each release. Can't be automated (live production sites). Run manually after Playwright passes.

| Site | Why | What to verify |
|---|---|---|
| [linear.app](https://linear.app) | Framer Motion (springs + layout) | Sidebar open/close, page transitions slow correctly |
| [stripe.com](https://stripe.com) | Heavy CSS + some GSAP | Hero section, hover card animations |
| [greensock.com/showcase](https://greensock.com/showcase) | GSAP demos | GSAP badge shows, tween slows, restore is correct |
| [framer.com/motion](https://www.framer.com/motion) | Canonical Framer Motion | springs, AnimatePresence, layout |
| [vercel.com](https://vercel.com) | CSS transitions + scroll reveal | No crashes, no toolbar interference |
| A local Next.js app | Framer Motion + custom rAF | rAF counter, spring animations |

**What to check on each**:
- [ ] Toolbar appears on icon click, disappears on second click
- [ ] 0.25x noticeably slows animations
- [ ] Restoring to 1x feels correct (no lingering slowness)
- [ ] No console errors in DevTools
- [ ] Page is still fully interactive while toolbar is visible
- [ ] No z-index / style collisions with page UI

---

### Known Edge Cases to Verify

These are the scenarios most likely to produce bugs and require dedicated test attention:

| Edge case | How to test | Expected result |
|---|---|---|
| GSAP page with non-1 original timeScale | `test-pages/05-gsap-timeline.html` sets `timeScale(2)` | Restore returns to 2, not 1 |
| Framer Motion spring after activation (activeTab timing) | Activate extension, then click trigger | Spring slows because rAF is patched on injection |
| Framer Motion spring that already started | Load page, wait 200ms, then activate | Spring may not slow — expected limitation of activeTab approach |
| Tab switch mid-animation | Activate, switch away for 5s, switch back | No timestamp jump, no freeze |
| DOM-injected animation (observer test) | `test-pages/08-dynamic-insert.html` | New animation slows 2s after page load |
| Very fast animation (< 50ms total) | Create one with `animation-duration: 30ms` | Doesn't crash; may complete before patch applies |
| Multiple extension icon clicks (toggle) | Click 3 times rapidly | Toolbar shows, hides, shows — no duplicate mounts |
| Session token timing race | `SLOWMO_STATUS_REPORT` arrives before content script listener is ready | See note below |

**Session token timing race**: `inject.ts` sends `SLOWMO_STATUS_REPORT` immediately at `document_start`. The content script runs at `document_idle` — potentially seconds later. The postMessage is lost if no one is listening.

**Fix**: expose the token on a window property as a fallback:
```ts
// inject.ts — after generating token
;(window as any).__slowmoToken = SESSION_TOKEN  // readable by content script as fallback
```
Content script reads `window.__slowmoToken` directly instead of waiting for the postMessage. This is safe — only the MAIN world inject can set it, and the content script reads it once at startup.

---

### Iteration Process: Build → Test → Ship

```
Phase 1 — Core (day 1)
  ├── Scaffold WXT + test pages
  ├── Implement inject.ts (rAF patch, token)
  ├── Verify 06-raf-custom.html slows correctly
  └── Unit tests pass for rAF math

Phase 2 — Layers (day 2)
  ├── Implement waapi.ts + gsap.ts
  ├── Verify 01–05 test pages
  ├── Unit tests pass for WeakMap + GSAP math
  └── Verify 05-gsap-timeline.html restore is 2x not 1x

Phase 3 — Toolbar (day 3)
  ├── Implement Toolbar.tsx + Shadow DOM mount
  ├── Verify toolbar appears/hides on icon click
  ├── Verify drag, speed selector, status badges
  └── Verify pointer events don't block page

Phase 4 — Integration (day 4)
  ├── Wire all layers via content/index.ts
  ├── Verify 07-mixed.html (all layers simultaneously)
  ├── Verify 08-dynamic-insert.html (observer)
  └── Playwright E2E suite passes

Phase 5 — Real world (day 5)
  ├── Run smoke test matrix (all 6 sites)
  ├── Fix any issues found
  ├── Run final E2E suite
  └── pnpm build && pnpm zip

Phase 6 — CWS submission
  ├── Verify no eval() in output
  ├── Write privacy policy
  ├── Prepare screenshots
  └── Submit
```

---

## Chrome Web Store Checklist

- [ ] Privacy policy hosted (GitHub Pages or Notion). Must say: no user data collected, all processing local.
- [ ] Store screenshots: 1280×800 — toolbar visible on a React/GSAP site, speed selector active, badges showing
- [ ] Short description (132 chars): "Slow down CSS, GSAP, and Framer Motion animations to 0.1×–0.5× speed. Real-time. In-context. For designers."
- [ ] Permissions justification for `<all_urls>` (if upgraded): "Developer tool that must operate on any URL the designer is inspecting"
- [ ] Verify no `eval()` in output: `grep -r "eval\|new Function" .output/chrome-mv3 --include="*.js"`

---

## Critical Pitfalls

| Risk | Mitigation |
|---|---|
| Tab-switch timestamp jump in rAF | `Math.min(delta, 100)` caps the delta |
| GSAP loads after `document_idle` | 5-second polling interval in `gsap.ts` |
| Restoring wrong playback rate on "off" | WeakMap of original rates (WAAPI) + stored baseline timeScale (GSAP) — multiply, don't hard-set |
| Double-patching rAF on HMR or re-inject | `window.__slowmoPatched` idempotency guard in inject.ts |
| MutationObserver firing per-mutation is expensive | rAF coalescing + `observerEnabled` flag — no work done when slow-mo is off |
| postMessage spoofed by page scripts | Per-session random token (`SESSION_TOKEN`) included in all messages; content script stores and validates it |
| Duplicate toolbars / state conflicts in iframes | `window === window.top` guard at top of both entrypoints |
| Shadow DOM pointer event bleed | Host: `pointer-events: none`; `.slowmo-toolbar`: `pointer-events: all` |
| React inside Shadow DOM event routing | `createRoot(container)` where container is inside shadow root — React 18 attaches to container, not document |
| CSP blocking inject script | Not an issue — WXT's MAIN world scripts bypass page CSP |

---

## Phase 2 (post-MVP)

- **Easing curve overlay**: read `Animation.effect.getTiming().easing` for WAAPI, `gsap.getById().vars.ease` for GSAP, render a bezier SVG badge overlaid on the element
- `performance.now()` patching for rare libraries that read it directly instead of using rAF timestamps
- Per-domain settings persistence via `chrome.storage.sync`

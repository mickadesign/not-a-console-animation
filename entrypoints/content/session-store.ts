/**
 * Per-tab state backed by the page's native sessionStorage.
 *
 * Why not chrome.storage.*?
 *   - chrome.storage.session: requires setAccessLevel() from the SW before
 *     content scripts can access it; the SW may be terminated before the
 *     content script runs, causing silent read failures.
 *   - chrome.storage.local: routes through Chrome's extension infrastructure
 *     which can fail when the SW is not yet running.
 *
 * sessionStorage is always accessible from content scripts (shared window),
 * survives page refreshes, is synchronous (no async/timing issues), and
 * requires no extension permissions. State is scoped per-tab and cleared
 * when the tab is closed.
 */

import type { SlowMoSpeed } from '../../src/shared/types'

export interface SlowMoSessionState {
  visible: boolean
  enabled: boolean
  speed: SlowMoSpeed
}

const KEY = '__slowmo_state'

export async function readSessionState(): Promise<SlowMoSessionState | null> {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    return JSON.parse(raw) as SlowMoSessionState
  } catch {
    return null
  }
}

export function writeSessionState(state: SlowMoSessionState): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    // Blocked (e.g. sandboxed iframe, storage quota) — silently ignore.
  }
}

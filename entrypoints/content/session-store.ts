/**
 * Thin wrapper around chrome.storage.session.
 *
 * chrome.storage.session persists across page refreshes within the same
 * browser session and is cleared automatically when the browser closes.
 * It is global across all tabs — no host_permissions needed.
 */

import type { SlowMoSpeed } from '../../src/shared/types'

export interface SlowMoSessionState {
  visible: boolean
  enabled: boolean
  speed: SlowMoSpeed
}

const KEY = 'slowmo_state'

export async function readSessionState(): Promise<SlowMoSessionState | null> {
  try {
    const result = await chrome.storage.session.get(KEY)
    return (result[KEY] as SlowMoSessionState) ?? null
  } catch {
    return null
  }
}

export function writeSessionState(state: SlowMoSessionState): void {
  try {
    chrome.storage.session.set({ [KEY]: state }).catch(() => {})
  } catch {
    // Extension context invalidated — tab outlived the extension reload, ignore.
  }
}

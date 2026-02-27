/**
 * Thin wrapper around chrome.storage.local.
 *
 * chrome.storage.local is always accessible from content scripts (with the
 * "storage" permission) without any setAccessLevel workaround. Unlike
 * chrome.storage.session, state persists across browser restarts — which is
 * fine here since users generally want their last speed/enabled preference
 * remembered.
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
    const result = await chrome.storage.local.get(KEY)
    return (result[KEY] as SlowMoSessionState) ?? null
  } catch {
    return null
  }
}

export function writeSessionState(state: SlowMoSessionState): void {
  try {
    chrome.storage.local.set({ [KEY]: state }).catch(() => {})
  } catch {
    // Extension context invalidated — tab outlived the extension reload, ignore.
  }
}

#!/usr/bin/env node
/**
 * Generates PNG icons for the SlowMo Chrome extension.
 * Pure Node.js — no external dependencies (uses built-in zlib).
 *
 * Icon design:
 *   • Dark rounded-square background (#0f0f14)
 *   • Two vertical purple bars (⏸ pause = slow motion concept) in #6c63ff
 *   • Yellow accent dot bottom-right (#ffd166) — omitted at 16px (too small)
 */

import { deflateSync } from 'zlib'
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dirname, '../public/icons')
mkdirSync(OUT_DIR, { recursive: true })

// ── PNG encoder ───────────────────────────────────────────────────────────────

const crcTable = new Uint32Array(256)
for (let i = 0; i < 256; i++) {
  let c = i
  for (let j = 0; j < 8; j++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
  crcTable[i] = c
}
function crc32(buf) {
  let crc = 0xffffffff
  for (const b of buf) crc = crcTable[(crc ^ b) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const t = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])))
  return Buffer.concat([len, t, data, crcBuf])
}
function encodePNG(width, height, getPixel) {
  const rows = []
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 4) // filter byte + RGBA
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = getPixel(x, y)
      row[1 + x * 4]     = r
      row[1 + x * 4 + 1] = g
      row[1 + x * 4 + 2] = b
      row[1 + x * 4 + 3] = a
    }
    rows.push(row)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8; ihdr[9] = 6 // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(Buffer.concat(rows))),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

// ── Icon renderer (scales with 'size') ────────────────────────────────────────

function renderPixel(x, y, size) {
  const cr = size * 0.20 // corner radius

  // Rounded-rectangle hit test
  const ax = Math.abs(x - size / 2), ay = Math.abs(y - size / 2)
  const hw = size / 2 - cr, hh = size / 2 - cr
  const inRR =
    (ax <= hw) ? ay <= size / 2 :
    (ay <= hh) ? ax <= size / 2 :
    (ax - hw) ** 2 + (ay - hh) ** 2 <= cr ** 2

  if (!inRR) return [0, 0, 0, 0] // transparent

  // Pause bars — purple #6c63ff
  const barW  = Math.max(2, Math.round(size * 0.13))
  const barH  = Math.round(size * 0.42)
  const barTop = Math.round((size - barH) / 2)
  const b1L   = Math.round(size * 0.27)
  const b2L   = Math.round(size * 0.52)

  if (
    (x >= b1L && x < b1L + barW && y >= barTop && y < barTop + barH) ||
    (x >= b2L && x < b2L + barW && y >= barTop && y < barTop + barH)
  ) return [108, 99, 255, 255]

  // Accent dot — yellow #ffd166 (only at 48px+; too small at 16px)
  if (size >= 48) {
    const dCX = size * 0.72, dCY = size * 0.73
    const dR  = size * 0.09
    if ((x - dCX) ** 2 + (y - dCY) ** 2 <= dR ** 2) return [255, 209, 102, 255]
  }

  // Background #0f0f14
  return [15, 15, 20, 255]
}

// ── Emit files ────────────────────────────────────────────────────────────────

for (const size of [16, 48, 128]) {
  const buf = encodePNG(size, size, (x, y) => renderPixel(x, y, size))
  const out = join(OUT_DIR, `icon${size}.png`)
  writeFileSync(out, buf)
  console.log(`✓ icon${size}.png  (${buf.length} bytes)`)
}

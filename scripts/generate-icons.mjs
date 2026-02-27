#!/usr/bin/env node
/**
 * Generates PNG icons for the SlowMo Chrome extension.
 * Pure Node.js — no external dependencies (uses built-in zlib).
 *
 * Icon design (matches provided logo):
 *   • Octagon shape (stop-sign style, 45° corner cuts)
 *   • Orange → red vertical gradient (#ff7a33 → #ff2d00)
 *   • Two white vertical pause bars centred
 *   • Anti-aliased edges via 4×4 supersampling
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
    const row = Buffer.alloc(1 + width * 4)
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

// ── Shape & colour helpers ────────────────────────────────────────────────────

// Returns true if (px, py) is inside the octagon (45° corner cuts of size `cut`)
function inOctagon(px, py, size, cut) {
  if (px < 0 || px > size || py < 0 || py > size) return false
  if (px + py < cut) return false
  if ((size - px) + py < cut) return false
  if (px + (size - py) < cut) return false
  if ((size - px) + (size - py) < cut) return false
  return true
}

// Orange → red gradient interpolated by y position
function gradientColor(y, size) {
  const t = y / size
  // top: #ff7a33 = rgb(255, 122, 51)  bottom: #ff2d00 = rgb(255, 45, 0)
  return [
    255,
    Math.round(122 * (1 - t) + 45 * t),
    Math.round(51  * (1 - t) + 0  * t),
  ]
}

// ── Pixel renderer ────────────────────────────────────────────────────────────

function renderPixel(x, y, size) {
  const cut = size * 0.22   // corner cut — controls how octagon-like the shape is

  // 4×4 supersampling for anti-aliased edges
  const SS = 4
  let coverage = 0
  for (let sy = 0; sy < SS; sy++) {
    for (let sx = 0; sx < SS; sx++) {
      const px = x + (sx + 0.5) / SS
      const py = y + (sy + 0.5) / SS
      if (inOctagon(px, py, size, cut)) coverage++
    }
  }
  if (coverage === 0) return [0, 0, 0, 0]
  const alpha = Math.round((coverage / (SS * SS)) * 255)

  // Gradient background colour at this y
  const [r, g, b] = gradientColor(y, size)

  // Pause bars — white, centred
  const barW   = Math.max(2, Math.round(size * 0.13))
  const barH   = Math.round(size * 0.44)
  const barTop = Math.round((size - barH) / 2)
  const b1L    = Math.round(size * 0.27)
  const b2L    = Math.round(size * 0.52)

  if (
    (x >= b1L && x < b1L + barW && y >= barTop && y < barTop + barH) ||
    (x >= b2L && x < b2L + barW && y >= barTop && y < barTop + barH)
  ) return [255, 255, 255, alpha]

  return [r, g, b, alpha]
}

// ── Emit files ────────────────────────────────────────────────────────────────

for (const size of [16, 48, 128]) {
  const buf = encodePNG(size, size, (x, y) => renderPixel(x, y, size))
  const out = join(OUT_DIR, `icon${size}.png`)
  writeFileSync(out, buf)
  console.log(`✓ icon${size}.png  (${buf.length} bytes)`)
}

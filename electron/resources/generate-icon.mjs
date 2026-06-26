import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const iconsetEntries = [
  { pt: 16, scale: 1 },
  { pt: 16, scale: 2 },
  { pt: 32, scale: 1 },
  { pt: 32, scale: 2 },
  { pt: 128, scale: 1 },
  { pt: 128, scale: 2 },
  { pt: 256, scale: 1 },
  { pt: 256, scale: 2 },
  { pt: 512, scale: 1 },
  { pt: 512, scale: 2 },
]

const resourcesDir = dirname(fileURLToPath(import.meta.url))
const iconsetDir = join(resourcesDir, 'BetterJira.iconset')
const icoTempDir = join(resourcesDir, 'BetterJira.ico.tmp')
const svgPath = join(resourcesDir, 'icon-source.svg')
const renderedPngPath = `${svgPath}.png`
const icon1024Path = join(resourcesDir, 'icon-1024.png')
const icnsPath = join(resourcesDir, 'icon.icns')
const icoPath = join(resourcesDir, 'icon.ico')

const svg = String.raw`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" fill="#17a45c"/>
  <clipPath id="circleClip">
    <circle cx="512" cy="512" r="360"/>
  </clipPath>
  <g clip-path="url(#circleClip)">
    <circle cx="512" cy="512" r="360" fill="#050505"/>
    <g fill="#17a45c">
      <rect x="-187" y="531" width="1300" height="74" rx="37" transform="rotate(45 463 568)"/>
      <rect x="-279" y="623" width="1300" height="74" rx="37" transform="rotate(45 371 660)"/>
      <rect x="-371" y="715" width="1300" height="74" rx="37" transform="rotate(45 279 752)"/>
    </g>
  </g>
</svg>`

function run(command, args) {
  execFileSync(command, args, { stdio: 'inherit' })
}

function writeIco(sourcePngPath, outputPath) {
  const sizes = [16, 32, 48, 64, 128, 256]
  const pngs = sizes.map((size) => {
    const pngPath = join(icoTempDir, `icon-${size}.png`)
    run('/usr/bin/sips', ['-z', String(size), String(size), sourcePngPath, '--out', pngPath])
    return { size, data: readFileSync(pngPath) }
  })

  const headerSize = 6
  const directoryEntrySize = 16
  const imageOffset = headerSize + (directoryEntrySize * pngs.length)
  const dataSize = pngs.reduce((total, png) => total + png.data.length, 0)
  const ico = Buffer.alloc(imageOffset + dataSize)

  ico.writeUInt16LE(0, 0)
  ico.writeUInt16LE(1, 2)
  ico.writeUInt16LE(pngs.length, 4)

  let directoryOffset = headerSize
  let dataOffset = imageOffset
  for (const png of pngs) {
    ico.writeUInt8(png.size === 256 ? 0 : png.size, directoryOffset)
    ico.writeUInt8(png.size === 256 ? 0 : png.size, directoryOffset + 1)
    ico.writeUInt8(0, directoryOffset + 2)
    ico.writeUInt8(0, directoryOffset + 3)
    ico.writeUInt16LE(1, directoryOffset + 4)
    ico.writeUInt16LE(32, directoryOffset + 6)
    ico.writeUInt32LE(png.data.length, directoryOffset + 8)
    ico.writeUInt32LE(dataOffset, directoryOffset + 12)
    png.data.copy(ico, dataOffset)
    directoryOffset += directoryEntrySize
    dataOffset += png.data.length
  }

  writeFileSync(outputPath, ico)
}

rmSync(iconsetDir, { recursive: true, force: true })
rmSync(icoTempDir, { recursive: true, force: true })
rmSync(svgPath, { force: true })
rmSync(renderedPngPath, { force: true })
mkdirSync(iconsetDir, { recursive: true })
mkdirSync(icoTempDir, { recursive: true })
writeFileSync(svgPath, svg)

run('/usr/bin/qlmanage', ['-t', '-s', '1024', '-o', resourcesDir, svgPath])
rmSync(icon1024Path, { force: true })
renameSync(renderedPngPath, icon1024Path)

for (const entry of iconsetEntries) {
  const px = String(entry.pt * entry.scale)
  const suffix = entry.scale === 1 ? '' : `@${entry.scale}x`
  const outputPath = join(iconsetDir, `icon_${entry.pt}x${entry.pt}${suffix}.png`)
  run('/usr/bin/sips', ['-z', px, px, icon1024Path, '--out', outputPath])
}

run('/usr/bin/iconutil', ['-c', 'icns', iconsetDir, '-o', icnsPath])
writeIco(icon1024Path, icoPath)

rmSync(svgPath, { force: true })
rmSync(icoTempDir, { recursive: true, force: true })
console.log(`wrote ${icnsPath}`)
console.log(`wrote ${icoPath}`)

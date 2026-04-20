import { execFileSync } from "node:child_process";
import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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
];

const resourcesDir = dirname(fileURLToPath(import.meta.url));
const iconsetDir = join(resourcesDir, "BetterJira.iconset");
const svgPath = join(resourcesDir, "icon-source.svg");
const renderedPngPath = `${svgPath}.png`;
const icon1024Path = join(resourcesDir, "icon-1024.png");
const icnsPath = join(resourcesDir, "icon.icns");

const svg = String.raw`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="160" x2="864" y1="96" y2="928" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#0f2447"/>
      <stop offset="55%" stop-color="#18407b"/>
      <stop offset="100%" stop-color="#0b1830"/>
    </linearGradient>
    <radialGradient id="bgGlowA" cx="300" cy="250" r="360" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#38d7ff" stop-opacity="0.4"/>
      <stop offset="100%" stop-color="#38d7ff" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="bgGlowB" cx="760" cy="790" r="320" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#2cf2a4" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="#2cf2a4" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="card" x1="300" x2="710" y1="280" y2="760" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="100%" stop-color="#dfeafb"/>
    </linearGradient>
    <linearGradient id="check" x1="340" x2="540" y1="500" y2="640" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#2af59f"/>
      <stop offset="100%" stop-color="#0aa56c"/>
    </linearGradient>
    <linearGradient id="diamondBase" x1="654" x2="860" y1="194" y2="400" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#7ad3ff"/>
      <stop offset="100%" stop-color="#2268ff"/>
    </linearGradient>
    <linearGradient id="diamondFacetTop" x1="690" x2="842" y1="214" y2="366" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#8fe5ff"/>
      <stop offset="100%" stop-color="#4690ff"/>
    </linearGradient>
    <linearGradient id="diamondFacetBottom" x1="676" x2="830" y1="330" y2="484" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#2358d8"/>
      <stop offset="100%" stop-color="#12358f"/>
    </linearGradient>
    <filter id="shadow" x="-40%" y="-40%" width="200%" height="200%">
      <feDropShadow dx="0" dy="28" stdDeviation="24" flood-color="#031020" flood-opacity="0.35"/>
    </filter>
    <filter id="softGlow" x="-40%" y="-40%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="36"/>
    </filter>
    <clipPath id="diamondClip">
      <rect x="636" y="226" width="184" height="184" rx="18" transform="rotate(45 728 318)"/>
    </clipPath>
  </defs>

  <rect width="1024" height="1024" rx="228" fill="url(#bg)"/>
  <rect width="1024" height="1024" rx="228" fill="url(#bgGlowA)"/>
  <rect width="1024" height="1024" rx="228" fill="url(#bgGlowB)"/>

  <path d="M238 254c0-35.346 28.654-64 64-64h280l168 166.4V702c0 35.346-28.654 64-64 64H302c-35.346 0-64-28.654-64-64Z" fill="#6db6ff" opacity="0.18" filter="url(#softGlow)"/>
  <path d="M256 238c0-35.346 28.654-64 64-64h267.2L752 338.4V686c0 35.346-28.654 64-64 64H320c-35.346 0-64-28.654-64-64Z" fill="url(#card)" filter="url(#shadow)"/>
  <path d="M587.2 174 752 338.4H627.2c-22.091 0-40-17.909-40-40Z" fill="#c4dbf8"/>

  <path d="M339.2 508.8 400 568 499.2 452.8" fill="none" stroke="#54ffc0" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="0.35" stroke-width="84" filter="url(#softGlow)"/>
  <path d="M339.2 508.8 400 568 499.2 452.8" fill="none" stroke="url(#check)" stroke-linecap="round" stroke-linejoin="round" stroke-width="58"/>
  <rect x="544" y="451.2" width="136" height="38.4" rx="19.2" fill="#87a3c7"/>
  <rect x="544" y="531.2" width="104" height="38.4" rx="19.2" fill="#87a3c7" opacity="0.92"/>
  <rect x="336" y="624" width="344" height="38.4" rx="19.2" fill="#c0d1e8"/>

  <rect x="636" y="226" width="184" height="184" rx="18" transform="rotate(45 728 318)" fill="url(#diamondBase)" filter="url(#shadow)"/>
  <g clip-path="url(#diamondClip)">
    <polygon points="728,215.8 829.8,318 728,350.2 626.2,318" fill="url(#diamondFacetTop)"/>
    <polygon points="626.2,318 728,350.2 728,452.2 626.2,318" fill="#1a49bc"/>
    <polygon points="829.8,318 728,350.2 728,452.2 829.8,318" fill="url(#diamondFacetBottom)"/>
    <polygon points="728,273.6 772.6,318 728,362.4 683.4,318" fill="#9fd7ff"/>
  </g>
  <rect x="636" y="226" width="184" height="184" rx="18" transform="rotate(45 728 318)" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="8"/>
</svg>`;

function run(command, args) {
  execFileSync(command, args, { stdio: "inherit" });
}

rmSync(iconsetDir, { recursive: true, force: true });
rmSync(svgPath, { force: true });
rmSync(renderedPngPath, { force: true });
mkdirSync(iconsetDir, { recursive: true });
writeFileSync(svgPath, svg);

run("/usr/bin/qlmanage", ["-t", "-s", "1024", "-o", resourcesDir, svgPath]);
rmSync(icon1024Path, { force: true });
renameSync(renderedPngPath, icon1024Path);

for (const entry of iconsetEntries) {
  const px = String(entry.pt * entry.scale);
  const suffix = entry.scale === 1 ? "" : `@${entry.scale}x`;
  const outputPath = join(iconsetDir, `icon_${entry.pt}x${entry.pt}${suffix}.png`);
  run("/usr/bin/sips", ["-z", px, px, icon1024Path, "--out", outputPath]);
}

run("/usr/bin/iconutil", ["-c", "icns", iconsetDir, "-o", icnsPath]);

rmSync(svgPath, { force: true });
console.log(`wrote ${icnsPath}`);

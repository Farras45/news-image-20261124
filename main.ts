// main.ts — "The World in a Day — Tuesday, 24 November 2026"
// Draws a one-page newspaper summary of six verified 24 November 2026
// world news stories as a 1024x1024 PNG, using only the Node standard
// library (node:fs, node:path, node:zlib, node:crypto).
// Run: mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// The program is deterministic: same input, same bytes, every run.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { createHash } from "node:crypto";

// ---------------------------------------------------------------- canvas
const W = 1024;
const H = 1024;
const px = new Uint8Array(W * H * 3);

type RGB = [number, number, number];
const PAPER: RGB = [246, 241, 231];
const INK: RGB = [26, 26, 26];
const NAVY: RGB = [22, 35, 63];
const GOLD: RGB = [201, 162, 39];
const WHITE: RGB = [255, 255, 255];
const GREY: RGB = [110, 108, 100];
const CARD: RGB = [255, 255, 255];

function setPixel(x: number, y: number, c: RGB): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  px[i] = c[0];
  px[i + 1] = c[1];
  px[i + 2] = c[2];
}

function fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) setPixel(xx, yy, c);
  }
}

function drawLine(x0: number, y0: number, x1: number, y1: number, c: RGB): void {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    setPixel(x, y, c);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

function drawRectOutline(x: number, y: number, w: number, h: number, c: RGB, t = 2): void {
  fillRect(x, y, w, t, c);
  fillRect(x, y + h - t, w, t, c);
  fillRect(x, y, t, h, c);
  fillRect(x + w - t, y, t, h, c);
}

function fillCircle(cx: number, cy: number, r: number, c: RGB): void {
  for (let y = -r; y <= r; y++) {
    const half = Math.floor(Math.sqrt(r * r - y * y));
    for (let x = -half; x <= half; x++) setPixel(cx + x, cy + y, c);
  }
}

function circleOutline(cx: number, cy: number, r: number, c: RGB): void {
  for (let a = 0; a < 360; a += 2) {
    const rad = (a * Math.PI) / 180;
    setPixel(Math.round(cx + r * Math.cos(rad)), Math.round(cy + r * Math.sin(rad)), c);
  }
}

// Fill a triangle given three points, by scanning rows.
function fillTriangle(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, c: RGB): void {
  const minY = Math.min(ay, by, cy);
  const maxY = Math.max(ay, by, cy);
  for (let y = minY; y <= maxY; y++) {
    const xs: number[] = [];
    const edges: Array<[number, number, number, number]> = [
      [ax, ay, bx, by],
      [bx, by, cx, cy],
      [cx, cy, ax, ay],
    ];
    for (const [x0, y0, x1, y1] of edges) {
      if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) {
        xs.push(Math.round(x0 + ((y - y0) * (x1 - x0)) / (y1 - y0)));
      }
    }
    if (xs.length >= 2) {
      const lo = Math.min(...xs);
      const hi = Math.max(...xs);
      for (let x = lo; x <= hi; x++) setPixel(x, y, c);
    }
  }
}

// ------------------------------------------------------------------- font
// 5x7 pixel font, one glyph = 7 rows of 5 bits (bit 4 = leftmost pixel).
const GLYPHS: Record<string, number[]> = {
  A: [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  B: [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  C: [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  D: [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  F: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  G: [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01111],
  H: [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  I: [0b01110, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  J: [0b00111, 0b00010, 0b00010, 0b00010, 0b00010, 0b10010, 0b01100],
  K: [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  M: [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  P: [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  Q: [0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  V: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
  X: [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  Z: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
  "0": [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  "1": [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  "2": [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  "3": [0b11111, 0b00010, 0b00100, 0b00010, 0b00001, 0b10001, 0b01110],
  "4": [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  "5": [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  "6": [0b00110, 0b01000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
  "7": [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  "8": [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  "9": [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00010, 0b01100],
  " ": [0, 0, 0, 0, 0, 0, 0],
  ".": [0, 0, 0, 0, 0, 0b01100, 0b01100],
  ",": [0, 0, 0, 0, 0b01100, 0b00100, 0b01000],
  ":": [0, 0b01100, 0b01100, 0, 0b01100, 0b01100, 0],
  ";": [0, 0b01100, 0b01100, 0, 0b01100, 0b00100, 0b01000],
  "!": [0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0, 0b00100],
  "?": [0b01110, 0b10001, 0b00001, 0b00110, 0b00100, 0, 0b00100],
  "'": [0b00100, 0b00100, 0b01000, 0, 0, 0, 0],
  '"': [0b01010, 0b01010, 0, 0, 0, 0, 0],
  "(": [0b00010, 0b00100, 0b01000, 0b01000, 0b01000, 0b00100, 0b00010],
  ")": [0b01000, 0b00100, 0b00010, 0b00010, 0b00010, 0b00100, 0b01000],
  "-": [0, 0, 0, 0b01110, 0, 0, 0],
  "/": [0b00001, 0b00010, 0b00010, 0b00100, 0b01000, 0b01000, 0b10000],
  "%": [0b11001, 0b11010, 0b00010, 0b00100, 0b01000, 0b01011, 0b10011],
  $: [0b00100, 0b01111, 0b10100, 0b01110, 0b00101, 0b11110, 0b00100],
  "&": [0b01100, 0b10010, 0b10100, 0b01000, 0b10101, 0b10010, 0b01101],
  "+": [0, 0b00100, 0b00100, 0b11111, 0b00100, 0b00100, 0],
  "=": [0, 0, 0b11111, 0, 0b11111, 0, 0],
  "*": [0, 0b10101, 0b01110, 0b11111, 0b01110, 0b10101, 0],
  "#": [0b01010, 0b01010, 0b11111, 0b01010, 0b11111, 0b01010, 0b01010],
};

// Normalise copy to what the font can draw: uppercase ASCII only.
function clean(s: string): string {
  return s
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[—–]/g, "-")
    .replace(/·/g, "-")
    .toUpperCase();
}

function drawChar(ch: string, x: number, y: number, scale: number, c: RGB): void {
  const g = GLYPHS[ch] ?? GLYPHS[" "];
  for (let r = 0; r < 7; r++) {
    for (let col = 0; col < 5; col++) {
      if (g[r] & (1 << (4 - col))) {
        fillRect(x + col * scale, y + r * scale, scale, scale, c);
      }
    }
  }
}

function textWidth(s: string, scale: number): number {
  if (s.length === 0) return 0;
  return s.length * 6 * scale - scale;
}

function drawText(s: string, x: number, y: number, scale: number, c: RGB): void {
  const t = clean(s);
  for (let i = 0; i < t.length; i++) {
    drawChar(t[i], x + i * 6 * scale, y, scale, c);
  }
}

function drawTextCentered(s: string, cx: number, y: number, scale: number, c: RGB): void {
  const t = clean(s);
  drawText(t, cx - Math.floor(textWidth(t, scale) / 2), y, scale, c);
}

// Greedy word wrap. Returns lines that fit maxWidth at the given scale.
function wrap(s: string, maxWidth: number, scale: number): string[] {
  const words = clean(s).split(/\s+/).filter((w) => w.length > 0);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const trial = cur === "" ? w : cur + " " + w;
    if (textWidth(trial, scale) <= maxWidth) {
      cur = trial;
    } else {
      if (cur !== "") lines.push(cur);
      cur = w;
    }
  }
  if (cur !== "") lines.push(cur);
  return lines;
}

// ----------------------------------------------------------------- icons
// Small geometric pictograms, drawn in a 40x40 box at (x, y).
function drawIcon(kind: string, x: number, y: number, c: RGB): void {
  if (kind === "alert") {
    // warning triangle with exclamation mark
    fillTriangle(x + 20, y + 3, x + 37, y + 35, x + 3, y + 35, c);
    fillRect(x + 18, y + 14, 4, 12, WHITE);
    fillRect(x + 18, y + 29, 4, 4, WHITE);
  } else if (kind === "chart") {
    // three rising bars
    fillRect(x + 5, y + 24, 7, 12, c);
    fillRect(x + 16, y + 16, 7, 20, c);
    fillRect(x + 27, y + 8, 7, 28, c);
  } else if (kind === "vote") {
    // ballot box with a tick
    drawRectOutline(x + 6, y + 12, 28, 24, c, 3);
    drawLine(x + 12, y + 24, x + 18, y + 30, c);
    drawLine(x + 18, y + 30, x + 30, y + 16, c);
    fillRect(x + 6, y + 12, 28, 5, c);
  } else if (kind === "dome") {
    // stadium dome: arc over a base
    for (let a = 180; a <= 360; a += 3) {
      const rad = (a * Math.PI) / 180;
      setPixel(Math.round(x + 20 + 15 * Math.cos(rad)), Math.round(y + 26 - 13 * Math.sin(rad)), c);
      setPixel(Math.round(x + 20 + 15 * Math.cos(rad)), Math.round(y + 27 - 13 * Math.sin(rad)), c);
    }
    fillRect(x + 4, y + 26, 32, 4, c);
    fillRect(x + 8, y + 30, 4, 6, c);
    fillRect(x + 28, y + 30, 4, 6, c);
  } else if (kind === "flag") {
    // golf flag on a pole
    fillRect(x + 10, y + 4, 3, 32, c);
    fillTriangle(x + 13, y + 5, x + 13, y + 16, x + 30, y + 10, c);
    fillCircle(x + 28, y + 32, 4, c);
  } else if (kind === "rocket") {
    // simple rocket, nose up
    fillTriangle(x + 20, y + 2, x + 14, y + 14, x + 26, y + 14, c);
    fillRect(x + 14, y + 14, 12, 14, c);
    fillTriangle(x + 14, y + 20, x + 8, y + 30, x + 14, y + 28, c);
    fillTriangle(x + 26, y + 20, x + 32, y + 30, x + 26, y + 28, c);
    fillTriangle(x + 20, y + 28, x + 17, y + 37, x + 23, y + 37, GOLD);
  } else if (kind === "globe") {
    // globe: circle with equator and meridian
    circleOutline(x + 20, y + 20, 15, c);
    drawLine(x + 5, y + 20, x + 35, y + 20, c);
    for (let a = 0; a < 360; a += 4) {
      const rad = (a * Math.PI) / 180;
      setPixel(Math.round(x + 20 + 6 * Math.cos(rad)), Math.round(y + 20 + 15 * Math.sin(rad)), c);
    }
  }
}

// ---------------------------------------------------------------- stories
interface Story {
  tag: string;
  accent: RGB;
  headline: string;
  body: string;
  source: string;
  icon: string;
}

const RED: RGB = [179, 57, 46];
const TEAL: RGB = [15, 118, 110];
const PURPLE: RGB = [109, 40, 217];
const GREEN: RGB = [21, 128, 61];
const ORANGE: RGB = [194, 65, 12];
const BLUE: RGB = [29, 78, 216];

const STORIES: Story[] = [
  {
    tag: "SEOUL - SECURITY",
    accent: RED,
    headline: "Jets scrambled over mystery aircraft",
    body: "Seoul sent fighter jets up after an unidentified aircraft entered the Korea air defence zone. Ulleung Island's warning was lifted in 3 minutes.",
    source: "SOURCE: YONHAP, REUTERS",
    icon: "alert",
  },
  {
    tag: "SEOUL - ECONOMY",
    accent: TEAL,
    headline: "Korea's shoppers turn gloomier",
    body: "The Bank of Korea said consumer sentiment fell to 103.1 in November, its lowest in seven months. Stock falls and higher loan rates squeezed households.",
    source: "SOURCE: BANK OF KOREA",
    icon: "chart",
  },
  {
    tag: "LISBON - POLITICS",
    accent: PURPLE,
    headline: "Portugal votes on 2027 budget as unions strike",
    body: "Parliament holds its final vote on the 2027 budget today, as four unions strike and crowds rally outside the Assembly. The plan offers a 2.3% pay rise.",
    source: "SOURCE: LUSA, RTP",
    icon: "vote",
  },
  {
    tag: "HOBART - STADIUM",
    accent: GREEN,
    headline: "Hobart stadium bill jumps to $1.23 billion",
    body: "Tasmania revealed its Macquarie Point stadium will cost $1.23 billion, up $100 million. With precinct and delivery costs, the total is $1.54 billion.",
    source: "SOURCE: ABC NEWS",
    icon: "dome",
  },
  {
    tag: "SPORT - GOLF",
    accent: ORANGE,
    headline: "Three Koreans earn LPGA cards for 2027",
    body: "Min Sun7 Kim, Hyunjo Yoo and Da Yeon Lee came through Q-School in Mobile, Alabama. Megha Ganne won as 27 players earned cards.",
    source: "SOURCE: YONHAP, GOLFWEEK",
    icon: "flag",
  },
  {
    tag: "CALIFORNIA - SPACE",
    accent: BLUE,
    headline: "SpaceX to fly classified Space Force mission",
    body: "SpaceX plans a Falcon 9 launch from Vandenberg today, carrying the classified USSF-266 mission. The window opens at 7:55 a.m. local time.",
    source: "SOURCE: SPACEX, AP",
    icon: "rocket",
  },
];

// ------------------------------------------------------------------ layout
function drawMasthead(): void {
  fillRect(0, 0, W, 132, NAVY);
  drawTextCentered("THE WORLD IN A DAY", W / 2, 26, 5, WHITE);
  drawTextCentered("TUESDAY, 24 NOVEMBER 2026", W / 2, 88, 3, GOLD);
  fillRect(0, 132, W, 6, GOLD);
  drawTextCentered("SIX STORIES FROM AROUND THE GLOBE", W / 2, 152, 2, INK);
}

function drawCell(s: Story, x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, CARD);
  drawRectOutline(x, y, w, h, INK, 2);
  fillRect(x, y, 10, h, s.accent);

  // kicker tag
  const tagW = textWidth(s.tag, 2) + 20;
  fillRect(x + 24, y + 14, tagW, 24, s.accent);
  drawText(s.tag, x + 34, y + 19, 2, WHITE);

  // pictogram, top right
  drawIcon(s.icon, x + w - 56, y + 12, s.accent);

  // headline, up to 3 lines
  const headLines = wrap(s.headline, w - 48, 3).slice(0, 3);
  let cy = y + 50;
  for (const ln of headLines) {
    drawText(ln, x + 24, cy, 3, INK);
    cy += 25;
  }

  // body
  const bodyTop = cy + 8;
  const bodyBottom = y + h - 36;
  const maxBodyLines = Math.max(1, Math.floor((bodyBottom - bodyTop) / 17));
  const bodyLines = wrap(s.body, w - 48, 2).slice(0, maxBodyLines);
  let by = bodyTop;
  for (const ln of bodyLines) {
    drawText(ln, x + 24, by, 2, INK);
    by += 17;
  }

  // source line
  drawText(s.source, x + 24, y + h - 28, 2, GREY);
}

function drawFooter(): void {
  fillRect(32, 950, W - 64, 2, INK);
  drawTextCentered(
    "SOURCES: YONHAP, REUTERS, BANK OF KOREA, LUSA, ABC NEWS, GOLFWEEK, AP",
    W / 2,
    962,
    2,
    GREY,
  );
  drawTextCentered("DRAWN BY CODE - NO PHOTOGRAPHS - MAKE.FUN NEWS-IMAGE-20261124", W / 2, 986, 2, GREY);
}

// --------------------------------------------------------------------- png
let crcTable: Int32Array | undefined;
function crc32(buf: Buffer): number {
  if (!crcTable) {
    crcTable = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}

function encodePNG(): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type 2 = RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    const off = y * (1 + W * 3);
    raw[off] = 0; // filter: none
    Buffer.from(px.buffer, y * W * 3, W * 3).copy(raw, off + 1);
  }
  const idat = deflateSync(raw, { level: 9 });

  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --------------------------------------------------------------------- main
function main(): void {
  fillRect(0, 0, W, H, PAPER);
  drawMasthead();

  const x0 = 32;
  const y0 = 184;
  const cw = 472;
  const ch = 242;
  const gx = 16;
  const gy = 14;
  for (let i = 0; i < STORIES.length; i++) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    drawCell(STORIES[i], x0 + col * (cw + gx), y0 + row * (ch + gy), cw, ch);
  }

  drawFooter();

  const png = encodePNG();
  const outDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "entry.png");
  writeFileSync(outPath, png);
  const sha = createHash("sha256").update(png).digest("hex");
  console.log(`wrote ${png.length} bytes to ${outPath} sha256 ${sha}`);
}

main();

/**
 * The startup banner: Amr Elshabrawy's hexagon logo next to the tool name.
 *
 * The logo is pixel art drawn for the terminal grid (not a shrunk image): each
 * character cell shows two pixels with the half-block "▀" — top pixel in the
 * text colour, bottom pixel in the background colour. Letters come from a 5×7
 * pixel font so they stay sharp.
 *
 * In an interactive terminal it animates for under a second: the outline is
 * drawn around from the top, then a light shimmer sweeps across. Without
 * colour support (NO_COLOR, piped output) it falls back to a text logo.
 */
import pc from "picocolors";

const BLUE = [137, 180, 250]; // #89b4fa
const LIGHT = [205, 214, 244]; // #cdd6f4
const DARK = [24, 24, 37]; // #181825
const TEAL = [148, 226, 213]; // #94e2d5
const MUTED = [127, 132, 156]; // #7f849c

// Text fallback for terminals without colour
const TEXT_LOGO = [
  "      ▄▄▄▀▀▀▀▀▄▄▄      ",
  "  ▄▄▀▀           ▀▀▄▄  ",
  " █   ▄▀█ █▀▄▀█ █▀█   █ ",
  " █   █▀█ █ ▀ █ █▀▄   █ ",
  "  ▀▀▄▄           ▄▄▀▀  ",
  "      ▀▀▀▄▄▄▄▄▀▀▀      ",
];

// 5×7 pixel font
const FONT = {
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  M: ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
  R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
};

// Hexagon: 25×20 pixels → 25 columns × 10 lines, pointy top like the brand logo
const W = 25;
const H = 20;
const CX = 12;
const SLOPE_ROWS = 6;
const halfWidth = (y) => (y < SLOPE_ROWS ? 2 * (y + 1) : y >= H - SLOPE_ROWS ? 2 * (H - y) : CX);
const inside = (x, y) => y >= 0 && y < H && Math.abs(x - CX) <= halfWidth(y);

/** The finished logo as a pixel grid (null = transparent) */
function logoPixels() {
  const grid = [];
  for (let y = 0; y < H; y++) {
    const row = [];
    for (let x = 0; x < W; x++) {
      if (!inside(x, y)) row.push(null);
      else {
        const edge = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]].some(([dx, dy]) => !inside(x + dx, y + dy));
        row.push(edge ? BLUE : DARK);
      }
    }
    grid.push(row);
  }
  let left = 4;
  for (const letter of "AMR") {
    FONT[letter].forEach((line, dy) => [...line].forEach((p, dx) => p === "#" && (grid[6 + dy][left + dx] = letter === "M" ? BLUE : LIGHT)));
    left += 6;
  }
  return grid;
}
const LOGO = logoPixels();

const mix = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));

/** Brighten the pixels under a diagonal band; k = 0…1 is the band's position */
function shimmer(color, x, y, k) {
  if (!(k > 0 && k < 1)) return color;
  const band = -4 + k * (W + H * 0.6 + 8);
  const distance = Math.abs(x + y * 0.6 - band);
  return distance < 3 ? mix(color, [255, 255, 255], (1 - distance / 3) * 0.7) : color;
}

/** Where a pixel sits going round the hexagon clockwise from the top, 0…1 */
const drawOrder = (x, y) => ((Math.atan2(x - CX, -(y - H / 2)) + Math.PI) / (2 * Math.PI) + 0.5) % 1;

const REVEAL_SHARE = 0.55; // first 55% of the animation draws, the rest shimmers

/** Nearest colour in the xterm 256-colour cube */
const to256 = ([r, g, b]) => 16 + 36 * Math.round((r / 255) * 5) + 6 * Math.round((g / 255) * 5) + Math.round((b / 255) * 5);

/**
 * The logo at animation progress t (0 = nothing, 1 = finished) as terminal lines.
 * @param {number} t
 * @param {{ truecolor?: boolean }} options false → nearest 256-colour palette
 */
export function logoLines(t = 1, { truecolor = true } = {}) {
  const reveal = Math.min(t / REVEAL_SHARE, 1);
  const shine = t >= 1 ? 1 : Math.max(0, (t - REVEAL_SHARE) / (1 - REVEAL_SHARE));
  const pixel = (x, y) => {
    const color = LOGO[y]?.[x];
    if (!color || (reveal < 1 && drawOrder(x, y) >= reveal)) return null;
    return shimmer(color, x, y, shine);
  };
  const fg = (c) => (truecolor ? `\x1b[38;2;${c.join(";")}m` : `\x1b[38;5;${to256(c)}m`);
  const bg = (c) => (truecolor ? `\x1b[48;2;${c.join(";")}m` : `\x1b[48;5;${to256(c)}m`);
  const reset = "\x1b[0m";

  const lines = [];
  for (let y = 0; y < H; y += 2) {
    let line = "";
    for (let x = 0; x < W; x++) {
      const top = pixel(x, y);
      const bottom = pixel(x, y + 1);
      if (!top && !bottom) line += " ";
      else if (top && !bottom) line += `${fg(top)}▀${reset}`;
      else if (!top && bottom) line += `${fg(bottom)}▄${reset}`;
      else line += `${fg(top)}${bg(bottom)}▀${reset}`;
    }
    lines.push(line);
  }
  return lines;
}

// Ask the stream we're writing to (Node's hasColors() honours NO_COLOR and FORCE_COLOR);
// picocolors alone always says yes on Windows, even when the output is piped to a file
const hasColor = (stream) =>
  stream.hasColors ? stream.hasColors() : Boolean(process.env.FORCE_COLOR) || Boolean(stream.isTTY && pc.isColorSupported);
const hasTrueColor = (stream) => stream.hasColors?.(2 ** 24) || /truecolor|24bit/i.test(process.env.COLORTERM || "");
const has256 = (stream) => stream.hasColors?.(256) || /256/.test(process.env.TERM || "");

const rgb = (color) => (text) => `\x1b[38;2;${color.join(";")}m${text}\x1b[39m`;

/** Banner lines at animation progress t */
function bannerLines({ version, stream, t }) {
  const color = hasColor(stream);
  const c = pc.createColors(color);
  const truecolor = color && hasTrueColor(stream);
  const pixels = color && (truecolor || has256(stream));
  const text = truecolor ? rgb(LIGHT) : c.white;
  const muted = truecolor ? rgb(MUTED) : c.dim;
  const accent = truecolor ? rgb(TEAL) : c.cyan;

  const logo = pixels ? logoLines(t, { truecolor }) : TEXT_LOGO.map((line) => (color ? c.blue(line) : line));
  // the text appears once the outline is drawn
  const info =
    t < REVEAL_SHARE
      ? ["", "", "", ""]
      : [
          c.bold(text("wayback-restore")) + (version ? muted(`  v${version}`) : ""),
          accent("Bring lost websites back from the Internet Archive"),
          "",
          muted("by Amr Elshabrawy · amrelshabrawydev.github.io"),
        ];

  // narrow terminal: text under the logo instead of beside it
  if ((stream.columns ?? 80) < 80) {
    return ["", ...logo.map((line) => `  ${line}`), "", ...info.filter((line, i) => i !== 2).map((line) => `  ${line}`)];
  }
  const top = Math.floor((logo.length - info.length) / 2);
  return ["", ...logo.map((line, i) => `  ${line}   ${info[i - top] ?? ""}`)];
}

/** The finished banner as one string (used by --help and when animation is off) */
export function banner({ version, stream = process.stdout } = {}) {
  return `${bannerLines({ version, stream, t: 1 }).join("\n")}\n`;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Animate only in a real, colourful, interactive terminal */
export const canAnimate = (stream = process.stdout, env = process.env) =>
  Boolean(stream.isTTY) && hasColor(stream) && (hasTrueColor(stream) || has256(stream)) && !env.CI && !env.WAYBACK_NO_ANIMATION;

/**
 * Print the banner, animated when the terminal allows it (~0.9 s).
 *
 * It never touches stdin: switching the keyboard into raw mode and back before
 * the questions start broke arrow keys in the prompts on Windows.
 * @returns {Promise<void>}
 */
export async function playBanner({ version, stream = process.stdout, duration = 900, frames = 24 } = {}) {
  if (!canAnimate(stream)) {
    stream.write(banner({ version, stream }));
    return;
  }

  const showCursor = () => stream.write("\x1b[?25h");
  // Ctrl+C during the animation: bring the cursor back before quitting
  const onInterrupt = () => {
    showCursor();
    stream.write("\n");
    process.exit(130);
  };
  process.once("SIGINT", onInterrupt);
  stream.write("\x1b[?25l"); // hide the cursor while drawing
  try {
    let height = 0;
    for (let i = 0; i <= frames; i++) {
      const lines = bannerLines({ version, stream, t: i / frames });
      if (height) stream.write(`\x1b[${height}A`);
      stream.write(`${lines.map((line) => `\r\x1b[2K${line}`).join("\n")}\n`);
      height = lines.length;
      await sleep(duration / frames);
    }
  } finally {
    process.off("SIGINT", onInterrupt);
    showCursor();
  }
}

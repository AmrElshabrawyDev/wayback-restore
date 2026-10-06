/**
 * The startup banner: Amr Elshabrawy's logo next to the tool name.
 *
 * Terminals with 256+ colours get the real logo (assets/logo.svg), drawn with
 * half-block characters — each character cell shows two pixels, top and bottom.
 * Without colour support (NO_COLOR, piped output, very old consoles) it falls
 * back to a text version of the logo.
 */
import pc from "picocolors";
import { LOGO_PIXELS } from "./logo-pixels.js";

// Text fallback — hexagon outline with the letters inside
const TEXT_LOGO = [
  "      ▄▄▄▀▀▀▀▀▄▄▄      ",
  "  ▄▄▀▀           ▀▀▄▄  ",
  " █   ▄▀█ █▀▄▀█ █▀█   █ ",
  " █   █▀█ █ ▀ █ █▀▄   █ ",
  "  ▀▀▄▄           ▄▄▀▀  ",
  "      ▀▀▀▄▄▄▄▄▀▀▀      ",
];

// Ask the stream we're writing to (Node's hasColors() honours NO_COLOR and FORCE_COLOR);
// picocolors alone always says yes on Windows, even when the output is piped to a file
const hasColor = (stream) =>
  stream.hasColors ? stream.hasColors() : Boolean(process.env.FORCE_COLOR) || Boolean(stream.isTTY && pc.isColorSupported);
const hasTrueColor = (stream) => stream.hasColors?.(2 ** 24) || /truecolor|24bit/i.test(process.env.COLORTERM || "");
const has256 = (stream) => stream.hasColors?.(256) || /256/.test(process.env.TERM || "");

const rgb = (r, g, b) => (text) => `\x1b[38;2;${r};${g};${b}m${text}\x1b[39m`;

/** "89b4fa" → [137, 180, 250]; "------" → null (transparent) */
const parsePixel = (hex) => (hex.startsWith("-") ? null : [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)));

/** Nearest colour in the xterm 256-colour cube */
const to256 = ([r, g, b]) => 16 + 36 * Math.round((r / 255) * 5) + 6 * Math.round((g / 255) * 5) + Math.round((b / 255) * 5);

/** The logo as terminal lines: ▀ = top pixel in the foreground colour, bottom pixel in the background colour */
export function pixelLogo({ truecolor = true } = {}) {
  const fg = (c) => (truecolor ? `\x1b[38;2;${c.join(";")}m` : `\x1b[38;5;${to256(c)}m`);
  const bg = (c) => (truecolor ? `\x1b[48;2;${c.join(";")}m` : `\x1b[48;5;${to256(c)}m`);
  const reset = "\x1b[0m";
  const rows = LOGO_PIXELS.map((row) => row.match(/.{6}/g).map(parsePixel));
  const lines = [];
  for (let y = 0; y < rows.length; y += 2) {
    let line = "";
    for (let x = 0; x < rows[y].length; x++) {
      const top = rows[y][x];
      const bottom = rows[y + 1]?.[x] ?? null;
      if (!top && !bottom) line += " ";
      else if (top && !bottom) line += `${fg(top)}▀${reset}`;
      else if (!top && bottom) line += `${fg(bottom)}▄${reset}`;
      else line += `${fg(top)}${bg(bottom)}▀${reset}`;
    }
    lines.push(line);
  }
  return lines;
}

export function banner({ version, stream = process.stdout } = {}) {
  const color = hasColor(stream);
  const c = pc.createColors(color);
  const truecolor = color && hasTrueColor(stream);
  const pixels = color && (truecolor || has256(stream));
  const text = truecolor ? rgb(205, 214, 244) : c.white; // #cdd6f4
  const muted = truecolor ? rgb(127, 132, 156) : c.dim; // #7f849c
  const accent = truecolor ? rgb(148, 226, 213) : c.cyan; // #94e2d5

  const logo = pixels ? pixelLogo({ truecolor }) : TEXT_LOGO.map((line) => (color ? c.blue(line) : line));
  const info = [
    c.bold(text("wayback-restore")) + (version ? muted(`  v${version}`) : ""),
    accent("Bring lost websites back from the Internet Archive"),
    "",
    muted("by Amr Elshabrawy · amrelshabrawydev.github.io"),
  ];

  // narrow terminal: name and tagline under the logo instead of beside it
  if ((stream.columns ?? 80) < 80) {
    return `\n${logo.map((line) => `  ${line}`).join("\n")}\n\n${info.filter(Boolean).map((line) => `  ${line}`).join("\n")}\n`;
  }
  // text block vertically centred next to the logo
  const top = Math.floor((logo.length - info.length) / 2);
  return `\n${logo.map((line, i) => `  ${line}   ${info[i - top] ?? ""}`).join("\n")}\n`;
}

/**
 * The startup banner: the AMR hexagon logo next to the tool name.
 * Uses 24-bit colour when the terminal supports it, plain ANSI colours otherwise,
 * and no colour at all when NO_COLOR is set or output isn't a terminal.
 */
import pc from "picocolors";

// The AMR logo — hexagon outline with the letters inside (brand blue #89b4fa)
const LOGO = [
  "      ▄▄▄▀▀▀▀▀▄▄▄      ",
  "  ▄▄▀▀           ▀▀▄▄  ",
  " █   ▄▀█ █▀▄▀█ █▀█   █ ",
  " █   █▀█ █ ▀ █ █▀▄   █ ",
  "  ▀▀▄▄           ▄▄▀▀  ",
  "      ▀▀▀▄▄▄▄▄▀▀▀      ",
];
// which columns of each line belong to the letters (the rest is the hexagon)
const LETTERS = /[▄▀█]/;
const isLetterZone = (row, col) => (row === 2 || row === 3) && col >= 5 && col <= 17;

// picocolors always enables colour on Windows, so also ask the stream we're writing to
const hasColor = (stream) => pc.isColorSupported && (stream.hasColors ? stream.hasColors() : true);
const hasTrueColor = (stream) => stream.hasColors?.(2 ** 24) || /truecolor|24bit/i.test(process.env.COLORTERM || "");

const rgb = (r, g, b) => (text) => `\x1b[38;2;${r};${g};${b}m${text}\x1b[39m`;

export function banner({ version, stream = process.stdout } = {}) {
  const color = hasColor(stream);
  const c = pc.createColors(color);
  const truecolor = color && hasTrueColor(stream);
  const hex = truecolor ? rgb(137, 180, 250) : c.blue; // #89b4fa
  const text = truecolor ? rgb(205, 214, 244) : c.white; // #cdd6f4
  const muted = truecolor ? rgb(127, 132, 156) : c.dim; // #7f849c
  const accent = truecolor ? rgb(148, 226, 213) : c.cyan; // #94e2d5

  const logo = LOGO.map((line, row) =>
    [...line]
      .map((ch, col) => (!LETTERS.test(ch) ? ch : isLetterZone(row, col) ? c.bold(text(ch)) : hex(ch)))
      .join(""),
  );

  const side = [
    "",
    c.bold(text("wayback-restore")) + (version ? muted(`  v${version}`) : ""),
    accent("Bring lost websites back from the Internet Archive"),
    "",
    muted("by Amr Elshabrawy · amrelshabrawydev.github.io"),
    "",
  ];

  // narrow terminal: name and tagline under the logo instead of beside it
  if ((stream.columns ?? 80) < 80) return `\n${logo.map((line) => `  ${line}`).join("\n")}\n${side.filter(Boolean).map((line) => `  ${line}`).join("\n")}\n`;
  return `\n${logo.map((line, i) => `  ${line}   ${side[i] ?? ""}`).join("\n")}\n`;
}

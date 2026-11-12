import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const out = fileURLToPath(new URL("../server/easel/modules/board/client/pieces/", import.meta.url));
fs.mkdirSync(out, { recursive: true });

const base = '<path d="M10.5 39h24v-2.6c0-1.3-1-2.4-2.4-2.4H12.9c-1.4 0-2.4 1.1-2.4 2.4z"/>';
const shapes = {
  pawn: '<circle cx="22.5" cy="13.5" r="5.6"/><path d="M16.6 20.4h11.8a1.7 1.7 0 0 1 0 3.4H16.6a1.7 1.7 0 0 1 0-3.4z"/><path d="M18.6 23.8h7.8c.6 4.6 2 7.6 4 10.2H14.6c2-2.6 3.4-5.600 4-10.2z"/>' + base,
  rook: '<path d="M12.5 8h4.6v3.2h3.1V8h4.600v3.2h3.100V8h4.600v8.200l-3.200 3v10.600l2.700 4.200H13l2.700-4.200V19.200l-3.200-3z"/><path class="line" d="M15.700 19.200h13.600M15.700 29.800h13.600"/>' + base,
  knight: '<path d="M14.200 34c-.4-7.200 2.200-11.400 6.600-14.600l-5.200 1.900-2.600-3.300c1.700-5.400 5.900-9.400 11.900-10l.9-3.800 3.300 3.900c4.700 4.300 5.500 12.800 3.700 25.900z"/><circle class="dot" cx="21.800" cy="13.200" r="1.300"/><path class="line" d="M28.400 12.500c2.200 3.500 2.700 8.500 2 14.500"/>' + base,
  bishop: '<circle cx="22.500" cy="6.400" r="2.300"/><path d="M22.500 8.500c5.400 4.200 7.500 8.300 7.500 12.200 0 3-1.700 5.200-4.100 6.300l2.400 7H16.700l2.400-7c-2.400-1.100-4.100-3.300-4.100-6.300 0-3.900 2.100-8 7.500-12.200z"/><path class="line" d="M25 13.200l-4.300 6.300M17.800 27h9.400"/>' + base,
  queen: '<path d="M9.800 14.600L15.300 28h14.400l5.500-13.400-5.300 6-2-10.300-3.200 9.700-2.200-11.500-2.200 11.500-3.200-9.700-2 10.300z"/><path d="M15.300 28h14.400l1.700 6H13.600z"/><circle cx="9.800" cy="13.400" r="2"/><circle cx="17.100" cy="9" r="2"/><circle cx="22.500" cy="7.300" r="2"/><circle cx="27.900" cy="9" r="2"/><circle cx="35.200" cy="13.400" r="2"/><path class="line" d="M15.300 28h14.400"/>' + base,
  king: '<path d="M21.200 2.800h2.600v3h3v2.600h-3v3.800h-2.600V8.400h-3V5.800h3z"/><path d="M22.500 12.200c2.900 0 4.900 2 4.900 5.200 0 0 1.300-3.200 5.200-3.200 4.100 0 5.600 4.200 3.900 7.900L32 30.400l1.200 3.600H11.800l1.200-3.600-4.500-8.300c-1.700-3.700-.2-7.900 3.900-7.900 3.900 0 5.200 3.200 5.200 3.200 0-3.200 2-5.200 4.900-5.200z"/><path class="line" d="M13 30.400h19M22.500 17.400v13"/>' + base,
};
const tones = {
  white: { top: "#fffdf6", bottom: "#d8cdb4", stroke: "#2a2630", line: "#2a2630" },
  black: { top: "#565c70", bottom: "#1c1f29", stroke: "#0c0d12", line: "#c9cfdf" },
};
for (const [side, tone] of Object.entries(tones)) {
  for (const [kind, shape] of Object.entries(shapes)) {
    const body = shape.replaceAll('class="line"', 'fill="none" stroke="' + tone.line + '" stroke-width="1.1"').replaceAll('class="dot"', 'fill="' + tone.line + '" stroke="none"');
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + tone.top + '"/><stop offset="1" stop-color="' + tone.bottom + '"/></linearGradient></defs><g fill="url(#g)" stroke="' + tone.stroke + '" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round">' + body + "</g></svg>\n";
    fs.writeFileSync(path.join(out, side + "-" + kind + ".svg"), svg);
  }
}
console.log("wrote 12 pieces to " + out);

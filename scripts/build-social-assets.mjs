import sharp from "sharp";
import { mkdir, readFile } from "node:fs/promises";

// Rasterize the existing Scheduler mark for clients that cannot use SVG icons.
export async function buildSocialAssets() {
  const mark = await readFile("_includes/scheduler-mark.svg", "utf8");
  await mkdir("assets/social", { recursive: true });
  const svg = (width, height, contents) =>
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" color="#f5f5f2">${contents}</svg>`,
    );
  await sharp(
    svg(
      1200,
      630,
      `<rect width="1200" height="630" fill="#101215"/><rect x="44" y="44" width="1112" height="542" rx="36" fill="none" stroke="#30343b" stroke-width="2"/><g transform="translate(400 115) scale(10)">${mark}</g>`,
    ),
  )
    .png()
    .toFile("assets/social/preview-v1.png");
  await sharp(
    svg(
      180,
      180,
      `<rect width="180" height="180" rx="40" fill="#101215"/><g transform="scale(4.5)">${mark}</g>`,
    ),
  )
    .png()
    .toFile("assets/social/apple-touch-icon-v1.png");
}

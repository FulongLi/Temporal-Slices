#!/usr/bin/env node
/**
 * Turn a folder of images into a local temporal dataset.
 *
 *   npm run import:images -- <folder> --id <id> [--title "Title"] [--subtitle "…"]
 *                                      [--spreads] [--aspect 1.5]
 *
 * Images are taken in filename order, one moment each. With --spreads, a
 * file ending in "-left" followed by one ending in "-right" becomes a single
 * two-page moment. Times are the moment order (a "generic" time axis).
 *
 * Output, both ignored by Git so that imagery with unclear reuse rights is
 * never committed:
 *   public/local/<id>/…               copies of the images
 *   src/data/local/<id>/dataset.json  the dataset (picked up automatically)
 */
import { copyFile, mkdir, open, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const IMAGE = /\.(png|jpe?g|webp|avif|svg)$/i;

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--spreads") args.spreads = true;
    else if (a.startsWith("--")) args[a.slice(2)] = argv[++i];
    else args._.push(a);
  }
  return args;
}

/** Pixel size from a PNG or JPEG header; null for anything else. */
async function imageSize(file) {
  const handle = await open(file, "r");
  try {
    const { buffer } = await handle.read(Buffer.alloc(65536), 0, 65536, 0);
    if (buffer.readUInt32BE(0) === 0x89504e47) return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    if (buffer[0] === 0xff && buffer[1] === 0xd8) {
      let i = 2;
      while (i < buffer.length - 9) {
        if (buffer[i] !== 0xff) return null;
        const marker = buffer[i + 1];
        const length = buffer.readUInt16BE(i + 2);
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
          return { width: buffer.readUInt16BE(i + 7), height: buffer.readUInt16BE(i + 5) };
        }
        i += 2 + length;
      }
    }
    return null;
  } finally {
    await handle.close();
  }
}

const stem = (file) => path.basename(file).replace(IMAGE, "");
const side = (file) => (/-left$/i.test(stem(file)) ? "left" : /-right$/i.test(stem(file)) ? "right" : null);

function titleOf(file) {
  const words = stem(file)
    .replace(/^(page|img|image|moment)?[-_ ]?\d+[-_ ]?/i, "")
    .replace(/[-_ ](left|right)$/i, "")
    .replace(/[-_]+/g, " ")
    .trim();
  return words ? words[0].toUpperCase() + words.slice(1) : stem(file);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const folder = args._[0];
  if (!folder || !args.id || !/^[a-z0-9-]+$/.test(args.id)) {
    console.error('Usage: npm run import:images -- <folder> --id <lowercase-id> [--title "Title"] [--spreads] [--aspect 1.5]');
    process.exit(1);
  }
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
  const files = (await readdir(folder)).filter((f) => IMAGE.test(f)).sort();
  if (files.length < 2) throw new Error(`Need at least two images in ${folder}.`);

  // Group into moments: single files, or left/right spreads.
  const groups = [];
  for (let i = 0; i < files.length; i++) {
    if (args.spreads && side(files[i]) === "left" && side(files[i + 1] ?? "") === "right") {
      groups.push([files[i], files[i + 1]]);
      i++;
    } else groups.push([files[i]]);
  }

  const publicDir = path.join(root, "public", "local", args.id);
  const dataDir = path.join(root, "src", "data", "local", args.id);
  await mkdir(publicDir, { recursive: true });
  await mkdir(dataDir, { recursive: true });
  for (const file of files) await copyFile(path.join(folder, file), path.join(publicDir, file));

  let aspect = Number(args.aspect) || null;
  if (!aspect) {
    const sample = groups.find((g) => g.length === (args.spreads ? 2 : 1)) ?? groups[0];
    const size = await imageSize(path.join(folder, sample[0]));
    aspect = size ? (size.width * sample.length) / size.height : 1.6;
  }

  const moments = groups.map((group, index) => ({
    id: `moment-${String(index + 1).padStart(2, "0")}`,
    time: index,
    timeLabel: String(index + 1).padStart(2, "0"),
    title: titleOf(group[0]),
    image: group.length === 1 ? `local/${args.id}/${group[0]}` : group.map((f) => `local/${args.id}/${f}`),
  }));
  const dataset = {
    id: args.id,
    title: args.title ?? titleOf(args.id),
    ...(args.subtitle ? { subtitle: args.subtitle } : {}),
    description: `Imported locally from ${files.length} images. Not for redistribution unless their licence allows it.`,
    timeUnit: "generic",
    aspect: Math.round(aspect * 1000) / 1000,
    moments,
  };
  await writeFile(path.join(dataDir, "dataset.json"), `${JSON.stringify(dataset, null, 2)}\n`);
  console.log(`${moments.length} moments → src/data/local/${args.id}/dataset.json (aspect ${dataset.aspect})`);
  console.log(`Open the app with ?dataset=${args.id} (it is also the default while it exists).`);
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});

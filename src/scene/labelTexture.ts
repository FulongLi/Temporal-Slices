import { CanvasTexture, LinearFilter, SRGBColorSpace } from "three";

export const LABEL_ASPECT = 1024 / 176;

/** A slice's in-world time label: the moment, and the era it belongs to. */
export function createLabelTexture(timeLabel: string, phase = "") {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 176;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(170, 205, 255, 0.55)";
  ctx.fillRect(0, 22, 3, 132);
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#e4eeff";
  ctx.font = '300 76px "IBM Plex Mono", ui-monospace, monospace';
  if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "4px";
  ctx.fillText(timeLabel, 30, 92);
  ctx.fillStyle = "rgba(190, 215, 255, 0.6)";
  ctx.font = '400 28px "IBM Plex Mono", ui-monospace, monospace';
  if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "7px";
  ctx.fillText(phase.toUpperCase(), 32, 146);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

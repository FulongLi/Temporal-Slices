import { Vector3 } from "three";

export const BACKGROUND = "#020305";
/** Exponential-squared fog shared by every custom shader in the volume. */
export const FOG_DENSITY = 0.017;
export const FOV = 34;
/** The Enter Slice view lives far from the volume, in its own space. */
export const MOMENT_ORIGIN = new Vector3(0, 0, 400);

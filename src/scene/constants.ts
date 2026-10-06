import { Vector3 } from "three";

export const BACKGROUND = "#020305";
/** Exponential-squared fog shared by every custom shader in the field. */
export const FOG_DENSITY = 0.032;
export const FOV = 38;
/** The Enter Slice view lives far from the field, in its own space. */
export const MOMENT_ORIGIN = new Vector3(0, 0, 400);

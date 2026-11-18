import { v3 } from './metrics.js';

// Torso-frame world volumes, including clearance for the hand's width.
export const BODY_VOLUMES = [
  { name: 'head', center: [0, 22, -1], radii: [14, 18, 15] },
  { name: 'ribcage', center: [0, -20, -1], radii: [20, 29, 15] },
];
export function insideBody(point) {
  return BODY_VOLUMES.some(({ center, radii }) =>
    point.reduce((sum, value, i) => sum + ((value - center[i]) / radii[i]) ** 2, 0) < 1);
}
export function constrainForearmDirection(elbow, direction) {
  const clear = f => {
    for (let d = 6; d <= 46; d += 2)
      if (insideBody(elbow.map((v, i) => v + f[i] * d))) return false;
    return true;
  };
  const original = v3.norm(direction);
  if (clear(original)) return original;
  for (let front = .25; front <= 3; front += .25) {
    const candidate = v3.norm([original[0], original[1], Math.max(0, original[2]) + front]);
    if (clear(candidate)) return candidate;
  }
  return v3.norm([Math.sign(elbow[0]) || 1, -.3, 1]);
}

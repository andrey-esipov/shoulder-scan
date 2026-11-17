// Perspective fit with a stable torso-centered target and room around every limb.
export function fitAnatomyBounds(bounds, aspect, fov = 36, target = [0, -20, 0]) {
  const halfWidth = Math.max(Math.abs(bounds.min.x - target[0]), Math.abs(bounds.max.x - target[0]));
  const halfHeight = Math.max(Math.abs(bounds.min.y - target[1]), Math.abs(bounds.max.y - target[1]));
  const tan = Math.tan(fov * Math.PI / 360);
  const depth = Math.max(0, bounds.max.z - target[2]);
  return {
    target,
    distance: Math.max(halfWidth / (tan * Math.max(.1, aspect)), halfHeight / tan) * 1.14 + depth + 5,
  };
}

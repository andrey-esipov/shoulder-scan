// Fit the shoulders, upper arms and torso rather than the full fingertip span.
export function fitAnatomyBounds(bounds, aspect, fov = 36) {
  const target = ['x', 'y', 'z'].map((axis) => (bounds.min[axis] + bounds.max[axis]) / 2);
  const halfWidth = (bounds.max.x - bounds.min.x) / 2;
  const halfHeight = (bounds.max.y - bounds.min.y) / 2;
  const tan = Math.tan(fov * Math.PI / 360);
  const depth = (bounds.max.z - bounds.min.z) / 2;
  return {
    target,
    distance: Math.max(halfWidth / (tan * Math.max(.1, aspect) * .96), halfHeight / (tan * .84)) + depth,
  };
}

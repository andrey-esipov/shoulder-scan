// Fit the torso, arms and full fingertip span inside the unobstructed stage.
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

export function fitReachEnvelope(points, aspect, fov = 36) {
  const y = points.map(p => p[1]);
  const target = [0, (Math.min(...y) + Math.max(...y)) / 2, 0];
  const tan = Math.tan(fov * Math.PI / 360);
  const distance = Math.max(...points.map(p => Math.max(
    Math.abs(p[0]) / (tan * Math.max(.1, aspect) * .96),
    Math.abs(p[1] - target[1]) / (tan * .96)
  ) + p[2]));
  return { target, distance };
}

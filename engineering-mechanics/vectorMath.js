export function resolve(magnitude, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    magnitude,
    angle: angleDeg,
    fx: magnitude * Math.cos(rad),
    fy: magnitude * Math.sin(rad),
  };
}

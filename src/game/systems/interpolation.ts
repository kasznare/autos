export const interpolateAngle = (a: number, b: number, t: number) => {
  let delta = (b - a) % (Math.PI * 2)
  if (delta > Math.PI) delta -= Math.PI * 2
  if (delta < -Math.PI) delta += Math.PI * 2
  return a + delta * t
}


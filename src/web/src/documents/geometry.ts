import type { Affine, PageInfo, Point, Quad } from '../contracts';
export const point = (m: Affine, [x, y]: Point): Point => [
  m[0] * x + m[2] * y + m[4],
  m[1] * x + m[3] * y + m[5],
];
export function inverse(m: Affine): Affine {
  const [a, b, c, d, e, f] = m,
    det = a * d - b * c;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-20) throw new Error('不可逆坐标矩阵');
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
}
export function compose(a: Affine, b: Affine): Affine {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}
export function viewport(info: PageInfo, scale = 1, rotation = 0) {
  const [x0, y0, x1, y1] = info.pageBox,
    s = (scale * info.userUnit * 96) / 72,
    r = (((info.rotate + rotation) % 360) + 360) % 360;
  const transform: Affine =
    r === 90
      ? [0, s, s, 0, -y0 * s, -x0 * s]
      : r === 180
        ? [-s, 0, 0, s, x1 * s, -y0 * s]
        : r === 270
          ? [0, -s, -s, 0, y1 * s, x1 * s]
          : [s, 0, 0, -s, -x0 * s, y1 * s];
  return {
    transform,
    width: (r % 180 ? y1 - y0 : x1 - x0) * s,
    height: (r % 180 ? x1 - x0 : y1 - y0) * s,
  };
}
export function quad(m: Affine, q: Quad): Quad {
  return [0, 2, 4, 6].flatMap(i => point(m, [q[i], q[i + 1]])) as Quad;
}
export function clientToPage(
  info: PageInfo,
  scale: number,
  rotation: number,
  rect: Pick<DOMRect, 'left' | 'top'>,
  x: number,
  y: number,
): Point {
  return point(inverse(viewport(info, scale, rotation).transform), [x - rect.left, y - rect.top]);
}
export function backingScale(
  width: number,
  height: number,
  dpr: number,
  maxBytes = 128 * 1024 * 1024,
) {
  return Math.min(
    dpr,
    16384 / width,
    16384 / height,
    Math.sqrt((16 * 1024 * 1024) / (width * height)),
    Math.sqrt(maxBytes / (width * height * 8)),
  );
}
export function rasterToPage(info: PageInfo, scale: number, rotation: number, outputScale: number) {
  return inverse(
    compose([outputScale, 0, 0, outputScale, 0, 0], viewport(info, scale, rotation).transform),
  );
}
export function imagePixelsToPage(info: PageInfo, pixelWidth: number, pixelHeight: number): Affine {
  const b = info.pageBox;
  return [(b[2] - b[0]) / pixelWidth, 0, 0, -(b[3] - b[1]) / pixelHeight, b[0], b[3]];
}

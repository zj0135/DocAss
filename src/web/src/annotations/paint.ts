import type { Annotation, Affine, Point } from '../contracts';
import { point } from '../documents/geometry';
import { textType } from './model';
export function paintAnnotations(
  ctx: CanvasRenderingContext2D,
  annotations: Annotation[],
  matrix: Affine,
  selected?: string,
) {
  const scale = Math.hypot(matrix[0], matrix[1]);
  const line = (points: Point[]) => {
    ctx.beginPath();
    points.forEach((p, i) => {
      const [x, y] = point(matrix, p);
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
  };
  for (const a of annotations) {
    if (a.migrationState === 'needsReview') continue;
    ctx.save();
    ctx.globalAlpha = a.opacity;
    ctx.strokeStyle = a.color;
    ctx.fillStyle = a.color;
    ctx.lineWidth = (a.strokeWidth ?? a.width ?? 1) * scale;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (textType(a)) {
      for (const q of a.quads!) {
        if (a.type === 'highlight') {
          line([0, 2, 4, 6].map(i => [q[i], q[i + 1]]));
          ctx.closePath();
          ctx.fill();
        } else {
          line([
            [q[0], q[1]],
            [q[2], q[3]],
          ]);
          ctx.lineWidth = Math.max(1, scale);
          ctx.stroke();
        }
      }
    } else if (a.type === 'ink') {
      for (const path of a.paths!) {
        line(path);
        ctx.stroke();
      }
    } else if (a.type === 'arrow') {
      line([a.from!, a.to!]);
      ctx.stroke();
      if (a.endStyle === 'arrow') {
        const f = point(matrix, a.from!),
          t = point(matrix, a.to!),
          angle = Math.atan2(t[1] - f[1], t[0] - f[0]),
          len = Math.max(8, ctx.lineWidth * 4);
        ctx.beginPath();
        ctx.moveTo(t[0], t[1]);
        ctx.lineTo(t[0] - Math.cos(angle - 0.45) * len, t[1] - Math.sin(angle - 0.45) * len);
        ctx.moveTo(t[0], t[1]);
        ctx.lineTo(t[0] - Math.cos(angle + 0.45) * len, t[1] - Math.sin(angle + 0.45) * len);
        ctx.stroke();
      }
    } else if (a.type === 'note') {
      const p = point(matrix, a.anchor!);
      ctx.fillRect(p[0], p[1] - 18 * scale, 20 * scale, 18 * scale);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#fff';
      ctx.font = `${12 * scale}px sans-serif`;
      ctx.fillText('…', p[0] + 3 * scale, p[1] - 4 * scale);
    } else if (a.type === 'freetext') {
      // Local y-down text frame follows the same affine as its page rectangle.
      const r = a.rect,
        origin = point(matrix, [r[0], r[3]]);
      ctx.transform(matrix[0], matrix[1], -matrix[2], -matrix[3], origin[0], origin[1]);
      ctx.font = `${a.fontSize}px ${a.fontFamily === 'serif' ? 'serif' : 'sans-serif'}`;
      ctx.textBaseline = 'top';
      ctx.textAlign = a.alignment!;
      const width = r[2] - r[0],
        height = r[3] - r[1],
        x = a.alignment === 'center' ? width / 2 : a.alignment === 'right' ? width : 0;
      ctx.beginPath();
      ctx.rect(0, 0, width, height);
      ctx.clip();
      let y = 0;
      for (const paragraph of a.text!.split('\n')) {
        let row = '';
        for (const char of paragraph) {
          if (row && ctx.measureText(row + char).width > width) {
            ctx.fillText(row, x, y);
            y += a.fontSize! * 1.3;
            row = '';
          }
          row += char;
        }
        ctx.fillText(row, x, y);
        y += a.fontSize! * 1.3;
      }
    } else {
      const r = a.rect;
      line([
        [r[0], r[1]],
        [r[2], r[1]],
        [r[2], r[3]],
        [r[0], r[3]],
        [r[0], r[1]],
      ]);
      if (a.fill) {
        ctx.fillStyle = a.fill;
        ctx.fill();
      }
      ctx.stroke();
    }
    ctx.restore();
    if (a.id === selected) {
      const r = a.rect;
      ctx.save();
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      line([
        [r[0], r[1]],
        [r[2], r[1]],
        [r[2], r[3]],
        [r[0], r[3]],
        [r[0], r[1]],
      ]);
      ctx.stroke();
      ctx.setLineDash([]);
      if (!textType(a)) {
        const p = point(matrix, [r[2], r[1]]);
        ctx.fillStyle = '#2563eb';
        ctx.fillRect(p[0] - 4, p[1] - 4, 8, 8);
      }
      ctx.restore();
    }
  }
}

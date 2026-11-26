import { validate } from '../contracts';
import type { Annotation, Box, Point, PageText, TextRange, Mutation, Settings } from '../contracts';
import { rangeQuads, snap } from '../text/model';

export type Tool = Exclude<Settings['tool'], 'regionAsk'>;
export type ToolStyle = { color: string; strokeWidth: number; opacity: number };
export type EditDraft = { annotation: Annotation; isNew: boolean; text: string };
export type HistoryEntry = { forward: Mutation[]; inverse: Mutation[] };
export const textType = (a: Annotation) => a.type === 'highlight' || a.type === 'underline';
export function bounds(points: Point[]): Box {
  const xs = points.map(p => p[0]),
    ys = points.map(p => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs) + 0.001, Math.max(...ys) + 0.001];
}
export function baseAnnotation(
  hash: string,
  page: number,
  type: Annotation['type'],
  rect: Box,
  author: string,
  style: ToolStyle,
): Annotation {
  const time = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    docHash: hash,
    page,
    type,
    rect,
    color: style.color,
    opacity: style.opacity,
    author,
    createdAt: time,
    modifiedAt: time,
    revision: 1,
    migrationState: 'none',
  };
}
export function textAnnotation(
  hash: string,
  text: PageText,
  range: TextRange,
  type: 'highlight' | 'underline',
  author: string,
  style: ToolStyle,
  groupId?: string,
): Annotation | undefined {
  const start = snap(text.text, range.start),
    end = snap(text.text, range.end, true);
  if (start >= end || text.quality === 'unavailable') return;
  const quads = rangeQuads(text, [{ start, end }]);
  if (!quads.length) return;
  const rect = bounds(quads.flatMap(q => [0, 2, 4, 6].map(i => [q[i], q[i + 1]] as Point)));
  return validate<Annotation>('Annotation', {
    ...baseAnnotation(hash, text.page, type, rect, author, style),
    ...(groupId ? { groupId } : {}),
    quads,
    textAnchor: {
      quote: text.text.slice(start, end),
      prefix: text.text.slice(Math.max(0, start - 40), start),
      suffix: text.text.slice(end, end + 40),
      ranges: [{ start, end }],
      textRevision: text.textRevision,
      source: text.source,
    },
  });
}
export function applyAnnotations(current: Annotation[], mutations: Mutation[]): Annotation[] {
  const map = new Map(current.map(a => [a.id, a]));
  for (const m of mutations) {
    if (m.type === 'annotation.put') map.set(m.value.id, structuredClone(m.value));
    else if (m.type === 'annotation.remove') map.delete(m.id);
  }
  return [...map.values()];
}
export function inverseMutations(current: Annotation[], mutations: Mutation[]): Mutation[] {
  let state = current;
  const result: Mutation[] = [];
  for (const m of mutations) {
    if (m.type !== 'annotation.put' && m.type !== 'annotation.remove')
      throw Error('撤销只适用于标注命令');
    const id = m.type === 'annotation.put' ? m.value.id : m.id,
      old = state.find(a => a.id === id);
    result.unshift(
      old
        ? { type: 'annotation.put', value: structuredClone(old) }
        : { type: 'annotation.remove', id },
    );
    state = applyAnnotations(state, [m]);
  }
  return result;
}
export class AnnotationHistory {
  undoEntries: HistoryEntry[] = [];
  redoEntries: HistoryEntry[] = [];
  push(value: HistoryEntry) {
    this.undoEntries.push(structuredClone(value));
    if (this.undoEntries.length > 200) this.undoEntries.shift();
    this.redoEntries = [];
  }
  clear() {
    this.undoEntries = [];
    this.redoEntries = [];
  }
}
export function segmentDistance(p: Point, a: Point, b: Point) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    t = Math.max(
      0,
      Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)),
    );
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
export function simplify(points: Point[], epsilon: number): Point[] {
  if (points.length < 3) return points;
  const keep = new Set([0, points.length - 1]),
    stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let max = epsilon,
      index = -1;
    for (let i = a + 1; i < b; i++) {
      const d = segmentDistance(points[i], points[a], points[b]);
      if (d > max) {
        max = d;
        index = i;
      }
    }
    if (index >= 0) {
      keep.add(index);
      stack.push([a, index], [index, b]);
    }
  }
  return [...keep].sort((a, b) => a - b).map(i => points[i]);
}
export function hitAnnotation(a: Annotation, p: Point, tolerance: number) {
  if (a.migrationState === 'needsReview') return false;
  if (a.type === 'ink')
    return a.paths!.some(path =>
      path.slice(1).some((b, i) => segmentDistance(p, path[i], b) <= tolerance + a.width! / 2),
    );
  if (a.type === 'arrow')
    return segmentDistance(p, a.from!, a.to!) <= tolerance + a.strokeWidth! / 2;
  if (textType(a))
    return a.quads!.some(q => {
      for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4;
        if (
          (q[j * 2] - q[i * 2]) * (p[1] - q[i * 2 + 1]) -
            (q[j * 2 + 1] - q[i * 2 + 1]) * (p[0] - q[i * 2]) <
          0
        )
          return false;
      }
      return true;
    });
  const [x0, y0, x1, y1] = a.rect;
  return (
    p[0] >= x0 - tolerance &&
    p[0] <= x1 + tolerance &&
    p[1] >= y0 - tolerance &&
    p[1] <= y1 + tolerance
  );
}
export function transformAnnotation(a: Annotation, rect: Box): Annotation {
  if (textType(a)) throw Error('文字标注必须重新选择文字');
  const old = a.rect,
    sx = (rect[2] - rect[0]) / (old[2] - old[0]),
    sy = (rect[3] - rect[1]) / (old[3] - old[1]);
  const p = ([x, y]: Point): Point => [rect[0] + (x - old[0]) * sx, rect[1] + (y - old[1]) * sy];
  return {
    ...a,
    rect,
    ...(a.anchor ? { anchor: p(a.anchor) } : {}),
    ...(a.from ? { from: p(a.from), to: p(a.to!) } : {}),
    ...(a.paths ? { paths: a.paths.map(path => path.map(p)) } : {}),
  };
}

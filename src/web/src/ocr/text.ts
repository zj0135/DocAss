import type {
  NativePage,
  OcrResult,
  Glyph,
  PageText,
  TextLine,
  TextSpan,
  Quad,
  Point,
} from '../contracts';
import { validate } from '../contracts';
import { graphemes } from '../text/model';
export type TextMode = 'auto' | 'native' | 'ocr' | 'hybrid';
export function classify(raw: NativePage, mode: TextMode = 'auto'): 'native' | 'ocr' | 'hybrid' {
  if (mode !== 'auto') return mode;
  if (raw.status !== 'ready' || !raw.glyphs.length) return 'ocr';
  const count = [
    ...graphemes.segment(
      raw.glyphs
        .map(g => g.text)
        .join('')
        .replace(/\s/gu, ''),
    ),
  ].length;
  return count < 40 && raw.hasImages ? 'hybrid' : 'native';
}
const normalize = (s: string) => s.normalize('NFKC').replace(/\s/gu, '').toLocaleLowerCase('und');
const words = new Intl.Segmenter(undefined, { granularity: 'word' });
const points = (q: Quad): Point[] => [0, 2, 4, 6].map(i => [q[i], q[i + 1]]);
function area(p: Point[]) {
  return (
    Math.abs(
      p.reduce((sum, a, i) => {
        const b = p[(i + 1) % p.length];
        return sum + a[0] * b[1] - b[0] * a[1];
      }, 0),
    ) / 2
  );
}
export function overlap(a: Quad, b: Quad) {
  let p = points(a);
  const clip = points(b),
    cross = (a: Point, b: Point, c: Point) =>
      (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  for (let i = 0; i < 4 && p.length; i++) {
    const x = clip[i],
      y = clip[(i + 1) % 4],
      input = p;
    p = [];
    for (let j = 0; j < input.length; j++) {
      const s = input[j],
        e = input[(j + 1) % input.length],
        ds = cross(x, y, s),
        de = cross(x, y, e);
      if (ds >= 0) p.push(s);
      if (ds >= 0 !== de >= 0) {
        const t = ds / (ds - de);
        p.push([s[0] + t * (e[0] - s[0]), s[1] + t * (e[1] - s[1])]);
      }
    }
  }
  return area(p) / Math.max(0.000001, Math.min(area(points(a)), area(points(b))));
}
export function duplicate(ocr: Glyph, native: Glyph) {
  if (!normalize(ocr.text) || normalize(ocr.text) !== normalize(native.text)) return false;
  const angle = (g: Glyph) =>
    Math.atan2(g.baseline[3] - g.baseline[1], g.baseline[2] - g.baseline[0]);
  return (
    Math.abs(Math.sin(angle(ocr) - angle(native))) < 0.2 && overlap(ocr.quad, native.quad) >= 0.8
  );
}
function wordGroups(text: string, spans: Pick<TextSpan, 'range' | 'glyphIds'>[], glyphs: Glyph[]) {
  const byId = new Map(glyphs.map(g => [g.id, g])),
    groups: { text: string; glyphs: Glyph[] }[] = [];
  let cursor = 0;
  for (const word of words.segment(text)) {
    if (!word.isWordLike || word.segment.length < 2 || word.segment.length > 32) continue;
    const end = word.index + word.segment.length;
    while (cursor < spans.length && spans[cursor].range.end <= word.index) cursor++;
    const ids = new Set<string>();
    let complete = true;
    for (let i = cursor; i < spans.length && spans[i].range.start < end; i++) {
      const span = spans[i];
      if (span.glyphIds.length && (span.range.start < word.index || span.range.end > end))
        complete = false;
      span.glyphIds.forEach(id => ids.add(id));
    }
    if (complete && ids.size)
      groups.push({
        text: normalize(word.segment),
        glyphs: [...ids].map(id => byId.get(id)!).filter(Boolean),
      });
  }
  return groups;
}
// Short words can have a narrower/taller CTC box than the native ink box.
// Require >=80% overlap on BOTH baseline-aligned axes; never discard an entire OCR line.
function sameWordPosition(a: Glyph[], b: Glyph[]) {
  const angle = (g: Glyph) =>
      Math.atan2(g.baseline[3] - g.baseline[1], g.baseline[2] - g.baseline[0]),
    theta = angle(b[0]);
  if (Math.abs(Math.sin(angle(a[0]) - theta)) >= 0.2) return false;
  return [theta, theta + Math.PI / 2].every(axis => {
    const range = (gs: Glyph[]) => {
        const values = gs.flatMap(g =>
          points(g.quad).map(([x, y]) => x * Math.cos(axis) + y * Math.sin(axis)),
        );
        return [Math.min(...values), Math.max(...values)];
      },
      x = range(a),
      y = range(b),
      length = Math.min(x[1] - x[0], y[1] - y[0]);
    return length > 0 && (Math.min(x[1], y[1]) - Math.max(x[0], y[0])) / length >= 0.8;
  });
}
export async function composeText(
  native: PageText,
  result: OcrResult,
  mode: 'ocr' | 'hybrid',
): Promise<PageText> {
  const groups: { glyphs: Glyph[]; text: string; native: boolean }[] = [];
  const nativeWords = new Map<string, Glyph[][]>();
  if (mode === 'hybrid' && native.quality !== 'unavailable')
    for (const word of wordGroups(native.text, native.spans, native.glyphs)) {
      const matches = nativeWords.get(word.text) ?? [];
      matches.push(word.glyphs);
      nativeWords.set(word.text, matches);
    }
  if (mode === 'hybrid' && native.quality !== 'unavailable')
    for (const line of native.lines)
      groups.push({
        glyphs: line.glyphIds.map(id => native.glyphs.find(g => g.id === id)!).filter(Boolean),
        text: native.text.slice(line.range.start, line.range.end),
        native: true,
      });
  for (const line of result.lines) {
    const removed = new Set<string>();
    if (nativeWords.size) {
      let offset = 0;
      const spans = line.glyphs.map(g => {
        const start = offset;
        offset += g.text.length;
        return { range: { start, end: offset }, glyphIds: [g.id] };
      });
      for (const word of wordGroups(line.glyphs.map(g => g.text).join(''), spans, line.glyphs))
        if (nativeWords.get(word.text)?.some(gs => sameWordPosition(word.glyphs, gs)))
          word.glyphs.forEach(g => removed.add(g.id));
    }
    const glyphs = line.glyphs.filter(
      g =>
        !removed.has(g.id) &&
        (mode !== 'hybrid' ||
          native.quality === 'unavailable' ||
          !native.glyphs.some(n => duplicate(g, n))),
    );
    if (glyphs.some(g => /\S/u.test(g.text)))
      groups.push({ glyphs, text: glyphs.map(g => g.text).join(''), native: false });
  }
  const vertical = (g: Glyph) =>
    Math.abs(g.baseline[3] - g.baseline[1]) > Math.abs(g.baseline[2] - g.baseline[0]);
  groups.sort((a, b) => {
    const axis = vertical(a.glyphs[0]) && vertical(b.glyphs[0]) ? 0 : 1;
    return (
      Math.max(
        ...b.glyphs.flatMap(g => [
          g.quad[axis],
          g.quad[axis + 2],
          g.quad[axis + 4],
          g.quad[axis + 6],
        ]),
      ) -
      Math.max(
        ...a.glyphs.flatMap(g => [
          g.quad[axis],
          g.quad[axis + 2],
          g.quad[axis + 4],
          g.quad[axis + 6],
        ]),
      )
    );
  });
  let text = '';
  const glyphs: Glyph[] = [],
    spans: TextSpan[] = [],
    lines: TextLine[] = [];
  for (const group of groups) {
    const id = group.glyphs[0].id,
      start = text.length;
    const x = group.glyphs.flatMap(g => [g.quad[0], g.quad[2], g.quad[4], g.quad[6]]),
      y = group.glyphs.flatMap(g => [g.quad[1], g.quad[3], g.quad[5], g.quad[7]]);
    const q: Quad = [
      Math.min(...x),
      Math.min(...y),
      Math.max(...x),
      Math.min(...y),
      Math.max(...x),
      Math.max(...y),
      Math.min(...x),
      Math.max(...y),
    ];
    if (group.native) {
      const source = native.lines.find(l => l.id === id)!;
      text += group.text;
      for (const span of native.spans.filter(
        s => s.range.start >= source.range.start && s.range.end <= source.range.end,
      ))
        spans.push({
          ...span,
          range: {
            start: start + span.range.start - source.range.start,
            end: start + span.range.end - source.range.start,
          },
        });
      glyphs.push(...group.glyphs);
    } else
      for (const g of group.glyphs) {
        const begin = text.length;
        text += g.text;
        glyphs.push(g);
        for (const part of graphemes.segment(g.text))
          spans.push({
            range: { start: begin + part.index, end: begin + part.index + part.segment.length },
            glyphIds: /\S/u.test(part.segment) ? [g.id] : [],
            kind: /\S/u.test(part.segment) ? 'glyph' : 'space',
            lineId: id,
          });
      }
    const a = group.glyphs[0],
      dx = a.baseline[2] - a.baseline[0],
      dy = a.baseline[3] - a.baseline[1];
    lines.push({
      id,
      range: { start, end: text.length },
      quad: q,
      direction: Math.abs(dy) > Math.abs(dx) ? 'ttb' : 'ltr',
      glyphIds: group.glyphs.filter(g => /\S/u.test(g.text)).map(g => g.id),
    });
    if (group !== groups.at(-1)) {
      spans.push({
        range: { start: text.length, end: text.length + 1 },
        glyphIds: [],
        kind: 'lineBreak',
        lineId: id,
      });
      text += '\n';
    }
  }
  const fingerprint = result.profile.fingerprint,
    revision = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(
        JSON.stringify({ text, glyphs, mode, fingerprint, native: native.textRevision }),
      ),
    );
  return validate<PageText>('PageText', {
    page: native.page,
    pageBox: native.pageBox,
    userUnit: native.userUnit,
    textRevision: Array.from(new Uint8Array(revision), b => b.toString(16).padStart(2, '0')).join(
      '',
    ),
    source: mode,
    text,
    glyphs,
    spans,
    lines,
    quality: 'approximate',
    profileFingerprint: fingerprint,
  });
}

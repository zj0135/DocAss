import type { PageText, TextRange, Quad } from '../contracts';
import { graphemes, rangeQuads } from './model';
export type SearchHit = { page: number; ranges: TextRange[]; quads: Quad[]; textRevision: string };
export function normalize(text: string) {
  let value = '';
  const mapping: TextRange[] = [];
  for (const segment of graphemes.segment(text)) {
    let normalized = segment.segment.normalize('NFKC').toLocaleLowerCase('und');
    // Soft hyphen is discretionary; a hard '-' remains meaningful.
    if (normalized === '\u00ad') continue;
    if (normalized === '\n' && text[segment.index - 1] === '\u00ad') continue;
    if (
      normalized === '\n' &&
      /\p{Script=Han}/u.test(text[segment.index - 1] ?? '') &&
      /\p{Script=Han}/u.test(text[segment.index + 1] ?? '')
    )
      continue;
    normalized = normalized.replace(/\s/gu, ' ');
    if (normalized === ' ' && value.endsWith(' ')) {
      mapping[mapping.length - 1].end = segment.index + segment.segment.length;
      continue;
    }
    for (let i = 0; i < normalized.length; i++)
      mapping.push({ start: segment.index, end: segment.index + segment.segment.length });
    value += normalized;
  }
  return { value, mapping };
}
export function searchPage(page: PageText, query: string): SearchHit[] {
  if (page.quality === 'unavailable') return [];
  const haystack = normalize(page.text),
    needle = normalize(query).value.trim();
  if (!needle) return [];
  const hits: SearchHit[] = [];
  for (
    let at = haystack.value.indexOf(needle);
    at >= 0;
    at = haystack.value.indexOf(needle, at + needle.length)
  ) {
    const ranges: TextRange[] = [];
    for (const range of haystack.mapping.slice(at, at + needle.length)) {
      const last = ranges.at(-1);
      if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
      else ranges.push({ ...range });
    }
    hits.push({
      page: page.page,
      ranges,
      quads: rangeQuads(page, ranges),
      textRevision: page.textRevision,
    });
  }
  return hits;
}
export class SearchController {
  private generation = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private abort?: AbortController;
  run(
    query: string,
    count: number,
    getPage: (page: number, signal: AbortSignal) => Promise<PageText>,
    update: (
      hits: SearchHit[],
      searched: number,
      unavailable: number,
      queryId: number,
      counts: number[],
    ) => void,
  ) {
    this.cancel();
    const generation = this.generation,
      abort = new AbortController();
    this.abort = abort;
    update([], 0, 0, generation, []);
    this.timer = setTimeout(() => {
      void (async () => {
        let firstBatch: SearchHit[] = [];
        const counts: number[] = [];
        let searched = 0,
          unavailable = 0;
        for (let page = 1; page <= count; page++) {
          if (abort.signal.aborted || generation !== this.generation) return;
          counts[page - 1] = 0;
          try {
            const text = await getPage(page, abort.signal);
            if (text.quality === 'unavailable') unavailable++;
            else {
              const hits = searchPage(text, query);
              counts[page - 1] = hits.length;
              if (!firstBatch.length) firstBatch = hits.slice(0, 200);
              searched++;
            }
          } catch {
            if (abort.signal.aborted) return;
            unavailable++;
          }
          if (generation === this.generation)
            update(firstBatch, searched, unavailable, generation, [...counts]);
        }
      })().catch(() => {});
    }, 200);
  }
  cancel() {
    this.generation++;
    clearTimeout(this.timer);
    this.abort?.abort();
  }
}

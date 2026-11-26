import type { Annotation, PageInfo, PageText, Point } from '../contracts';
import { normalize, searchPage } from '../text/search';
import { bounds } from './model';
export type MigrationItem = {
  annotation: Annotation;
  status: 'located' | 'review' | 'missing';
  candidates: number;
};
export function sameGeometry(a: PageInfo | undefined, b: PageInfo | undefined) {
  return (
    !!a &&
    !!b &&
    a.rotate === b.rotate &&
    a.userUnit === b.userUnit &&
    a.pageBox.every((v, i) => Math.abs(v - b.pageBox[i]) < 1e-6)
  );
}
export async function planMigration(
  annotations: Annotation[],
  oldPages: PageInfo[],
  newHash: string,
  pageCount: number,
  getInfo: (p: number) => Promise<PageInfo>,
  getText: (p: number, signal: AbortSignal) => Promise<PageText>,
  signal: AbortSignal,
  progress: (p: number) => void = () => {},
): Promise<MigrationItem[]> {
  const groups = new Map<string, string>(),
    matches = new Map<string, { count: number; value?: Annotation }>();
  const copies = annotations.map(a => {
    let groupId: string | undefined;
    if (a.groupId) {
      groupId = groups.get(a.groupId);
      if (!groupId) {
        groupId = crypto.randomUUID();
        groups.set(a.groupId, groupId);
      }
    }
    return {
      ...structuredClone(a),
      id: crypto.randomUUID(),
      docHash: newHash,
      revision: 1,
      modifiedAt: new Date().toISOString(),
      ...(groupId ? { groupId } : {}),
      migrationState: 'needsReview' as const,
    };
  });
  const anchored = copies.filter(a => a.textAnchor);
  for (let page = 1; page <= pageCount && anchored.length; page++) {
    signal.throwIfAborted();
    let text: PageText;
    try {
      text = await getText(page, signal);
    } catch (e) {
      if (signal.aborted) throw e;
      throw Error(`第 ${page} 页文字无法读取，不能确认唯一匹配，请重试迁移`);
    }
    if (text.quality !== 'unavailable')
      for (const a of anchored) {
        const anchor = a.textAnchor!,
          prefix = normalize(anchor.prefix).value,
          suffix = normalize(anchor.suffix).value;
        for (const hit of searchPage(text, anchor.quote)) {
          const start = hit.ranges[0].start,
            end = hit.ranges.at(-1)!.end;
          if (
            (prefix &&
              !normalize(text.text.slice(Math.max(0, start - 120), start)).value.endsWith(
                prefix,
              )) ||
            (suffix && !normalize(text.text.slice(end, end + 120)).value.startsWith(suffix))
          )
            continue;
          const match = matches.get(a.id) ?? { count: 0 };
          match.count++;
          if (match.count === 1 && hit.quads.length) {
            const rect = bounds(
              hit.quads.flatMap(q => [0, 2, 4, 6].map(i => [q[i], q[i + 1]] as Point)),
            );
            match.value = {
              ...a,
              page,
              rect,
              ...(a.quads ? { quads: hit.quads } : {}),
              ...(a.anchor ? { anchor: [rect[0], rect[3]] as Point } : {}),
              textAnchor: {
                quote: text.text.slice(start, end),
                prefix: text.text.slice(Math.max(0, start - 40), start),
                suffix: text.text.slice(end, end + 40),
                ranges: hit.ranges,
                textRevision: text.textRevision,
                source: text.source,
              },
              migrationState: 'confirmed',
            };
          }
          matches.set(a.id, match);
        }
      }
    progress(page);
  }
  const result: MigrationItem[] = [];
  for (const a of copies) {
    signal.throwIfAborted();
    if (a.textAnchor) {
      const match = matches.get(a.id);
      result.push({
        annotation: match?.count === 1 && match.value ? match.value : a,
        status:
          match?.count === 1 && match.value ? 'located' : a.page > pageCount ? 'missing' : 'review',
        candidates: match?.count ?? 0,
      });
    } else {
      const found =
        a.page <= pageCount &&
        sameGeometry(
          oldPages.find(p => p.page === a.page),
          await getInfo(a.page),
        );
      result.push({
        annotation: { ...a, migrationState: found ? 'confirmed' : 'needsReview' },
        status: found ? 'located' : a.page > pageCount ? 'missing' : 'review',
        candidates: found ? 1 : 0,
      });
    }
  }
  return result;
}

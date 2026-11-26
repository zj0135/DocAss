import { useEffect, useRef, useState } from 'react';
import type { PageText } from '../contracts';
import type { PagedDocument } from '../documents/types';
import type { AppServices } from '../services/AppServices';
import type { DocSession } from '../state/DocSession';
import { planMigration } from './migration';
import type { MigrationItem } from './migration';

export function VersionNotice({
  session,
  services,
  document,
  getText,
}: {
  session: DocSession;
  services: AppServices;
  document: PagedDocument;
  getText: (p: number, signal: AbortSignal) => Promise<PageText>;
}) {
  const [source, setSource] = useState({ changed: false, missing: false });
  const [oldHash, setOldHash] = useState(session.migrationFrom);
  const [plan, setPlan] = useState<MigrationItem[]>();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const abort = useRef<AbortController | undefined>(undefined);

  useEffect(() => {
    let active = true;
    let running = false;
    const check = async () => {
      if (running) return;
      running = true;
      try {
        const value = await services.documents.checkSource(session.handle.docId);
        if (active) setSource(value);
      } catch {
        // A busy writer is checked again on the next tick.
      } finally {
        running = false;
      }
    };
    void check();
    const timer = setInterval(check, 5000);
    return () => {
      active = false;
      clearInterval(timer);
      abort.current?.abort();
    };
  }, [session, services]);

  useEffect(() => {
    if (oldHash) {
      void services.documents
        .migrationInfo(session.handle.docId, oldHash)
        .then(info => {
          if (info.decision) {
            session.migrationFrom = undefined;
            setOldHash(undefined);
          }
        })
        .catch(e => setError(String(e)));
    }
  }, [oldHash, services, session]);

  const preview = async () => {
    if (!oldHash) return;
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setError('');
    try {
      const old = await services.documents.migrationInfo(session.handle.docId, oldHash);
      if (old.annotations.length > 999) {
        throw Error('超过单次 999 项迁移上限，请先整理旧版本标注');
      }
      const result = await planMigration(
        old.annotations,
        old.pages,
        session.handle.docHash,
        document.pageCount,
        p => document.getPageInfo(p),
        getText,
        controller.signal,
        setProgress,
      );
      setPlan(result);
    } catch (e) {
      if (!controller.signal.aborted) setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const decide = async (decision: 'accepted' | 'declined') => {
    if (!oldHash) return;
    setBusy(true);
    try {
      await session.commit({
        type: 'batch',
        mutations: [
          ...(decision === 'accepted'
            ? plan!.map(p => ({
                type: 'annotation.put' as const,
                value: p.annotation,
              }))
            : []),
          { type: 'migration.decision', value: { oldHash, decision } },
        ],
      });
      setOldHash(undefined);
      session.migrationFrom = undefined;
      setPlan(undefined);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {(source.changed || source.missing) && (
        <div className="bg-amber-50 px-4 py-2 text-sm">
          {source.missing
            ? '原文件已移动；当前快照仍可阅读。'
            : '源文件存在新版本，当前阅读内容保持原快照。'}
          {source.changed && (
            <button
              className="ml-4 underline"
              onClick={() =>
                void services.documents
                  .openVersion(session.handle.docId)
                  .catch(e => setError(String(e)))
              }
            >
              打开新版本
            </button>
          )}
        </div>
      )}
      {oldHash && (
        <div className="bg-blue-50 px-4 py-2 text-sm" aria-label="标注迁移">
          <span>发现此文件的旧版本标注。</span>
          {!busy && !plan && (
            <button className="ml-4 underline" onClick={() => void preview()}>
              预览标注迁移
            </button>
          )}
          {!busy && (
            <button className="ml-4" onClick={() => void decide('declined')}>
              不迁移此版本
            </button>
          )}
          {busy && (
            <span className="ml-3">
              处理中 · 已检查 {progress} 页
              <button className="ml-3" onClick={() => abort.current?.abort()}>
                取消扫描
              </button>
            </span>
          )}
          {plan && (
            <div className="mt-2">
              可定位 {plan.filter(p => p.status === 'located').length} 项，待复核{' '}
              {plan.filter(p => p.status === 'review').length} 项，未定位{' '}
              {plan.filter(p => p.status === 'missing').length}{' '}
              项。待复核项仅进入列表，不绘制在新页面上。
              <button
                disabled={busy}
                className="ml-4 underline"
                onClick={() => void decide('accepted')}
              >
                确认复制标注到新版本
              </button>
            </div>
          )}
        </div>
      )}
      {error && (
        <div role="alert" className="px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
    </>
  );
}

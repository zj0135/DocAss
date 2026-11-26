import { useEffect, useState } from 'react';
import type { AppServices } from '../../services/AppServices';

export function AttachmentPreview({
  services,
  docId,
  attachmentId,
}: {
  services: AppServices;
  docId: string;
  attachmentId: string;
}) {
  const [source, setSource] = useState<string | undefined>();
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let active = true;
    void services.attachments
      .resolve(docId, attachmentId)
      .then(result => {
        if (active) {
          setSource(result.url);
          setUnavailable(!result.available);
        }
      })
      .catch(() => {
        if (active) setUnavailable(true);
      });
    return () => {
      active = false;
    };
  }, [services, docId, attachmentId]);

  if (unavailable) {
    return (
      <div
        role="img"
        aria-label="附件不可用"
        className="border border-slate-200 rounded-lg p-4 text-sm text-slate-500"
      >
        附件不可用，消息文字仍可查看。
      </div>
    );
  }

  return source ? (
    <img
      className="max-w-full rounded-lg border border-slate-200"
      src={source}
      alt="消息附件"
      onError={() => setUnavailable(true)}
    />
  ) : (
    <span className="text-xs text-slate-400">正在加载附件…</span>
  );
}

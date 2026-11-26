import type { ReactNode } from 'react';
// Deliberately small Markdown subset. HTML and images remain text; links only use explicit safe schemes.
export function SafeMarkdown({
  text,
  renderText = (text: string) => text,
}: {
  text: string;
  renderText?: (text: string) => ReactNode;
}) {
  const inline = (value: string) => {
    const parts: ReactNode[] = [];
    const pattern =
      /(\*\*([^*\n]+)\*\*|`([^`\n]+)`|(?<!!)\[([^\]\n]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\))/g;
    let at = 0;
    for (const m of value.matchAll(pattern)) {
      parts.push(renderText(value.slice(at, m.index)));
      if (m[2]) parts.push(<strong key={m.index}>{renderText(m[2])}</strong>);
      else if (m[3])
        parts.push(
          <code key={m.index} className="bg-slate-100 rounded px-1">
            {m[3]}
          </code>,
        );
      else
        parts.push(
          <a
            key={m.index}
            href={m[5]}
            target="_blank"
            rel="noreferrer noopener"
            className="text-blue-700 underline"
          >
            {m[4]}
          </a>,
        );
      at = m.index! + m[0].length;
    }
    parts.push(renderText(value.slice(at)));
    return parts;
  };
  return (
    <div className="break-words leading-6">
      {text.split(/(```[\s\S]*?```)/g).map((block, i) =>
        block.startsWith('```') ? (
          <pre key={i} className="overflow-auto whitespace-pre-wrap bg-slate-50 p-2 rounded">
            <code>{block.slice(3, -3).replace(/^\w*\n/, '')}</code>
          </pre>
        ) : (
          <span key={i} className="whitespace-pre-wrap">
            {inline(block)}
          </span>
        ),
      )}
    </div>
  );
}

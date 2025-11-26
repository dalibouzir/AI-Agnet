import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";

type MarkdownContentProps = {
  text: string;
  variant?: "assistant" | "user";
  className?: string;
};

type CodeComponentProps = Components["code"] extends (props: infer P) => ReactNode ? P : { inline?: boolean; children?: ReactNode; className?: string };

const components: Components = {
  h1: ({ children }) => <h2 className="chat-markdown__heading">{children}</h2>,
  h2: ({ children }) => <h3 className="chat-markdown__heading">{children}</h3>,
  h3: ({ children }) => <h4 className="chat-markdown__heading">{children}</h4>,
  p: ({ children }) => <p className="chat-markdown__paragraph">{children}</p>,
  ul: ({ children }) => <ul className="chat-markdown__list">{children}</ul>,
  ol: ({ children }) => <ol className="chat-markdown__list chat-markdown__list--ordered">{children}</ol>,
  li: ({ children }) => <li className="chat-markdown__list-item">{children}</li>,
  blockquote: ({ children }) => <blockquote className="chat-markdown__blockquote">{children}</blockquote>,
  table: ({ children }) => (
    <div className="chat-markdown__table-wrapper">
      <table>{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="chat-markdown__table-head">{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  th: ({ children }) => <th className="chat-markdown__table-cell chat-markdown__table-cell--header">{children}</th>,
  td: ({ children }) => <td className="chat-markdown__table-cell">{children}</td>,
  hr: () => <hr className="chat-markdown__divider" />,
  code: ({ inline, children, className }: CodeComponentProps) =>
    inline ? (
      <code className={`chat-markdown__code-inline ${className ?? ""}`.trim()}>{children}</code>
    ) : (
      <pre className="chat-markdown__code-block">
        <code className={className}>{children}</code>
      </pre>
    ),
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer" className="chat-markdown__link">
      {children}
    </a>
  ),
};

export default function MarkdownContent({ text, variant = "assistant", className }: MarkdownContentProps) {
  if (!text.trim()) {
    return null;
  }
  return (
    <div className={`chat-markdown chat-markdown--${variant} ${className ?? ""}`.trim()}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} skipHtml>
        {text}
      </ReactMarkdown>
    </div>
  );
}

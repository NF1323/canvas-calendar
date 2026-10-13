import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/** Alterna el n-ésimo checkbox de una descripción markdown. */
export function toggleCheckbox(md: string, index: number): string {
  let i = -1
  return md.replace(/^(\s*[-*+]\s+)\[([ xX])\]/gm, (m, pre: string, mark: string) => {
    i++
    return i === index ? `${pre}[${mark === ' ' ? 'x' : ' '}]` : m
  })
}

export function Markdown({ text, onToggle }: { text: string; onToggle?: (index: number) => void }) {
  let idx = 0
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
              {children}
            </a>
          ),
          input: ({ checked, type }) => {
            if (type !== 'checkbox') return null
            const i = idx++
            return (
              <input
                type="checkbox"
                checked={!!checked}
                disabled={!onToggle}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onChange={() => onToggle?.(i)}
              />
            )
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}

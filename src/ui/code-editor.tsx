import type { ReactNode } from "react"

const AT_RULE = "text-purple-700 dark:text-purple-300"
const SELECTOR = "text-amber-700 dark:text-amber-300"
const PROPERTY = "text-sky-700 dark:text-sky-300"
const VALUE = "text-emerald-700 dark:text-emerald-300"
const COMMENT = "text-muted-foreground italic"
const PUNCTUATION = "text-muted-foreground"

/** Colors one line of CSS. Good enough for theme files; not a full parser. */
function highlight(line: string): ReactNode {
  if (/^\s*(\/\*|\*)/.test(line)) {
    return <span className={COMMENT}>{line}</span>
  }

  const declaration = /^(\s*)([\w-]+|--[\w*-]+)(\s*:\s*)(.*?)(;?\s*)$/.exec(
    line
  )
  if (declaration && !line.includes("{")) {
    const [, indent, property, colon, value, end] = declaration
    return (
      <>
        {indent}
        <span className={PROPERTY}>{property}</span>
        <span className={PUNCTUATION}>{colon}</span>
        <span className={VALUE}>{value}</span>
        <span className={PUNCTUATION}>{end}</span>
      </>
    )
  }

  const rule = /^(\s*)([^{}]*?)(\s*[{}]?\s*)$/.exec(line)
  if (rule) {
    const [, indent, head, brace] = rule
    return (
      <>
        {indent}
        <span className={head.startsWith("@") ? AT_RULE : SELECTOR}>
          {head}
        </span>
        <span className={PUNCTUATION}>{brace}</span>
      </>
    )
  }

  return line
}

type CodeEditorProps = {
  value: string
  label: string
  placeholder?: string
  /** Makes the editor editable. Without it the code is read-only. */
  onChange?: (value: string) => void
}

/**
 * CSS editor with line numbers and syntax colors. The highlighted code sits
 * under a transparent textarea, so editing and selection stay native.
 */
export function CodeEditor({
  value,
  label,
  placeholder,
  onChange,
}: CodeEditorProps) {
  const lines = value.split("\n")

  return (
    <div className="flex min-h-40 flex-1 overflow-auto rounded-md border bg-muted/40 font-mono text-xs leading-5">
      <div
        aria-hidden
        className="sticky left-0 shrink-0 border-r bg-muted px-2 py-2 text-right text-muted-foreground select-none"
      >
        {lines.map((_, index) => (
          <div key={index}>{index + 1}</div>
        ))}
      </div>
      <div className="relative min-w-0 flex-1">
        <pre aria-hidden className="min-w-max px-3 py-2">
          {lines.map((line, index) => (
            <div key={index}>
              {highlight(line)}
              {"\n"}
            </div>
          ))}
        </pre>
        <textarea
          value={value}
          readOnly={!onChange}
          aria-label={label}
          placeholder={placeholder}
          spellCheck={false}
          wrap="off"
          className="absolute inset-0 size-full resize-none overflow-hidden bg-transparent px-3 py-2 whitespace-pre text-transparent caret-foreground outline-none placeholder:text-muted-foreground"
          onChange={(event) => onChange?.(event.target.value)}
        />
      </div>
    </div>
  )
}

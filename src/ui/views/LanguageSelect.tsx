import { useEffect, useId, useRef, useState } from 'react'
import { ChevronDownIcon } from '../icons'
import { POPULAR_LANGUAGES, type LanguageCode } from '../../storage/languages'

interface LanguageSelectProps {
  label: string
  ariaLabel: string
  value: LanguageCode
  onChange: (code: LanguageCode) => void
}

export function LanguageSelect({ label, ariaLabel, value, onChange }: LanguageSelectProps) {
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const listId = useId()

  const selectedIndex = Math.max(
    0,
    POPULAR_LANGUAGES.findIndex((lang) => lang.code === value),
  )
  const selected = POPULAR_LANGUAGES[selectedIndex]

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  function openList() {
    setHighlight(selectedIndex)
    setOpen(true)
  }

  function choose(index: number) {
    onChange(POPULAR_LANGUAGES[index].code)
    setOpen(false)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) {
        openList()
        return
      }
      setHighlight((i) =>
        e.key === 'ArrowDown'
          ? Math.min(i + 1, POPULAR_LANGUAGES.length - 1)
          : Math.max(i - 1, 0),
      )
      return
    }
    if (e.key === 'Enter' || e.key === ' ') {
      if (open) {
        e.preventDefault()
        choose(highlight)
      }
      return
    }
    if (e.key === 'Escape' && open) {
      e.preventDefault()
      setOpen(false)
    }
  }

  return (
    <div className="lang-select" ref={rootRef}>
      <span className="lang-select-label">{label}</span>
      <button
        type="button"
        className="lang-select-trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
      >
        <span>{selected.label}</span>
        <span className="lang-select-chevron" aria-hidden="true">
          <ChevronDownIcon size={16} />
        </span>
      </button>
      {open && (
        <ul
          id={listId}
          className="lang-select-menu"
          role="listbox"
          aria-label={ariaLabel}
        >
          {POPULAR_LANGUAGES.map((lang, index) => (
            <li
              key={lang.code}
              role="option"
              aria-selected={lang.code === value}
              className={`lang-select-option ${index === highlight ? 'highlight' : ''}`}
              onMouseEnter={() => setHighlight(index)}
              onClick={() => choose(index)}
            >
              {lang.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

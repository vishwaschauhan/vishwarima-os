import type { ReactNode } from 'react'

// Hand-painted ornaments, drawn as light inline SVG. All are decorative and hidden from screen readers.

/** A loose brushstroke under a heading. */
export function BrushUnderline({ className = '', color = 'var(--marigold)' }: { className?: string; color?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 200 14" preserveAspectRatio="none" className={`pointer-events-none block h-2.5 ${className}`}>
      <path
        className="brush-in"
        d="M3 9.5 C 40 4.5, 82 3.5, 120 5.5 S 182 9, 197 6"
        fill="none"
        stroke={color}
        strokeWidth="5.5"
        strokeLinecap="round"
        opacity="0.75"
      />
    </svg>
  )
}

/** A small botanical sprig, as in the portrait's wordmark. */
export function Sprig({ className = '', flip = false }: { className?: string; flip?: boolean }) {
  return (
    <svg aria-hidden viewBox="0 0 120 60" className={`pointer-events-none ${flip ? '-scale-x-100' : ''} ${className}`}>
      <g fill="none" stroke="var(--sage-ink)" strokeWidth="1.6" strokeLinecap="round" opacity="0.55">
        <path className="brush-in" d="M6 52 C 34 44, 66 30, 112 8" />
      </g>
      <g fill="var(--sage)" stroke="var(--sage-ink)" strokeWidth="1.1" opacity="0.8">
        <path d="M30 44 c -4 -9 -1 -17 6 -20 c 2 8 -1 15 -6 20 z" />
        <path d="M30 44 c 8 3 15 1 19 -5 c -7 -3 -14 -1 -19 5 z" />
        <path d="M58 32 c -3 -9 0 -17 8 -19 c 1 8 -2 15 -8 19 z" />
        <path d="M58 32 c 8 2 15 -1 18 -7 c -8 -2 -14 1 -18 7 z" />
        <path d="M86 19 c -2 -8 2 -15 9 -16 c 0 7 -3 13 -9 16 z" />
        <path d="M86 19 c 7 2 13 0 16 -6 c -7 -2 -12 1 -16 6 z" />
      </g>
      <circle cx="113" cy="7" r="3.2" fill="var(--coral)" opacity="0.7" />
    </svg>
  )
}

/** A tiny painted heart, the mark from the app icon. */
export function PaintedHeart({ className = '' }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 22" className={className}>
      <path
        d="M12 20.5 C 6 16.5, 1.5 12.5, 2 7.5 C 2.4 3.6, 7.6 1.8, 12 6.2 C 16.4 1.8, 21.6 3.6, 22 7.5 C 22.5 12.5, 18 16.5, 12 20.5 Z"
        fill="var(--coral)"
        opacity="0.85"
      />
    </svg>
  )
}

/** The screen title: editorial serif with a brushstroke under it, and an optional small line above. */
export function PageTitle({ eyebrow, children, size = 'lg' }: { eyebrow?: ReactNode; children: ReactNode; size?: 'lg' | 'md' }) {
  return (
    <div className="min-w-0">
      {eyebrow && <p className="text-[13px] font-semibold tracking-[0.08em] text-ink-muted uppercase">{eyebrow}</p>}
      <h1 className={`relative inline-block font-serif leading-tight font-medium tracking-tight ${size === 'lg' ? 'text-[32px]' : 'text-[27px]'}`}>
        <span className="relative z-[1]">{children}</span>
        <BrushUnderline className="absolute -bottom-0.5 left-0 z-0 w-full" />
      </h1>
    </div>
  )
}

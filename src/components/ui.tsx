import { useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'quiet' }) {
  const styles = {
    primary: 'bg-ink text-canvas hover:opacity-90',
    secondary: 'bg-surface text-ink border border-line hover:bg-canvas',
    quiet: 'text-ink-muted hover:text-ink',
  }[variant]
  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-[15px] font-medium transition disabled:opacity-50 ${styles} ${className}`}
      {...props}
    />
  )
}

export function Field({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm text-ink-muted">{label}</span>
      <input
        className="min-h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-[16px] text-ink outline-none transition focus:border-ink-muted"
        {...props}
      />
    </label>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-line bg-surface p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] ${className}`}>{children}</div>
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null
  return (
    <p role="alert" className="text-sm text-danger">
      {children}
    </p>
  )
}

export function Portrait({ className = '' }: { className?: string }) {
  // The portrait is optional; if it is missing the screens fall back to the typographic wordmark.
  const [missing, setMissing] = useState(false)
  if (missing) return null
  return (
    <picture>
      <source type="image/webp" srcSet="/brand/portrait-720.webp 720w, /brand/portrait-1440.webp 1440w" sizes="(min-width: 640px) 560px, 100vw" />
      <img
        src="/brand/portrait-720.jpg"
        srcSet="/brand/portrait-720.jpg 720w, /brand/portrait-1440.jpg 1440w"
        sizes="(min-width: 640px) 560px, 100vw"
        alt="Illustrated portrait of Vishwas, Garima, Vihan and Vyomika in a sunset backyard, with the Vishwarima logo"
        className={`w-full object-cover ${className}`}
        width={1448}
        height={1086}
        onError={() => setMissing(true)}
      />
    </picture>
  )
}

export function Wordmark({ className = '' }: { className?: string }) {
  return <span className={`font-serif tracking-tight ${className}`}>VishwarimaOS</span>
}

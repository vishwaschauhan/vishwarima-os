import { useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'quiet' }) {
  const styles = {
    primary: 'bg-primary text-on-primary shadow-paper hover:brightness-105',
    secondary: 'bg-surface text-ink border border-line shadow-paper hover:border-ink-muted/50',
    quiet: 'text-ink-muted hover:text-ink',
  }[variant]
  return (
    <button
      className={`press inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-[15px] font-semibold disabled:opacity-50 ${styles} ${className}`}
      {...props}
    />
  )
}

export function Field({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink-muted">{label}</span>
      <input
        className="min-h-11 w-full rounded-2xl border border-line bg-surface px-3.5 text-[16px] text-ink outline-none transition focus:border-teal-ink focus:ring-3 focus:ring-teal-ink/15 aria-invalid:border-danger"
        {...props}
      />
    </label>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-card border border-line bg-surface p-5 shadow-paper ${className}`}>{children}</div>
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null
  return (
    <p role="alert" className="rounded-2xl bg-danger/10 px-3.5 py-2.5 text-sm font-medium text-danger">
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
  return (
    <span className={`font-serif font-medium tracking-tight ${className}`}>
      Vishwarima<span className="text-primary">OS</span>
    </span>
  )
}

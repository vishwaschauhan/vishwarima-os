import { useCallback, useEffect, useRef, useState } from 'react'

// Browser speech recognition (Web Speech API), feature-detected at runtime. Safari and Chrome
// support it in different ways and some browsers not at all, so typed entry is always offered.
// Nothing here records or stores audio; the browser hands back text only.

interface RecognitionResult {
  isFinal: boolean
  0: { transcript: string; confidence: number }
}
interface RecognitionEvent {
  resultIndex: number
  results: ArrayLike<RecognitionResult>
}
interface Recognition {
  lang: string
  interimResults: boolean
  continuous: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  abort(): void
  onresult: ((e: RecognitionEvent) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
}
type RecognitionCtor = new () => Recognition

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export type SpeechState = 'idle' | 'listening' | 'done' | 'error'

const ERRORS: Record<string, string> = {
  'not-allowed': 'Microphone access is off for this site. Allow it in your browser settings, or type instead.',
  'service-not-allowed': 'Speech recognition isn’t allowed in this browser. Type instead.',
  'no-speech': 'I didn’t hear anything. Try again, a little closer to the phone.',
  'audio-capture': 'No microphone was found. Type instead.',
  network: 'Speech recognition needs a connection in this browser. Type instead, or try again online.',
  'language-not-supported': 'English speech recognition isn’t available here. Type instead.',
}

export function useSpeech() {
  const Ctor = recognitionCtor()
  const [state, setState] = useState<SpeechState>('idle')
  const [transcript, setTranscript] = useState('')
  const [confidence, setConfidence] = useState<number | null>(null)
  const [error, setError] = useState('')
  const rec = useRef<Recognition | null>(null)

  useEffect(() => () => rec.current?.abort(), [])

  const start = useCallback(() => {
    if (!Ctor) return
    rec.current?.abort()
    setTranscript('')
    setConfidence(null)
    setError('')
    if (!navigator.onLine) setError('You’re offline; speech may not work in this browser. You can type instead.')
    const r = new Ctor()
    r.lang = 'en-US'
    r.interimResults = true
    r.continuous = false
    r.maxAlternatives = 1
    let finalText = ''
    r.onresult = (e) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]
        if (res.isFinal) {
          finalText += res[0].transcript
          setConfidence(res[0].confidence || null)
        } else interim += res[0].transcript
      }
      setTranscript((finalText + interim).trim())
    }
    r.onerror = (e) => {
      if (e.error === 'aborted') return
      setError(ERRORS[e.error] ?? 'Speech recognition stopped. Try again or type instead.')
      setState('error')
    }
    r.onend = () => setState((s) => (s === 'error' ? s : 'done'))
    rec.current = r
    try {
      r.start()
      setState('listening')
    } catch {
      setError('Couldn’t start listening. Type instead.')
      setState('error')
    }
  }, [Ctor])

  /** Stop listening and keep what was heard. */
  const stop = useCallback(() => rec.current?.stop(), [])
  /** Stop and throw away what was heard. */
  const cancel = useCallback(() => {
    rec.current?.abort()
    setTranscript('')
    setState('idle')
  }, [])

  return { supported: Boolean(Ctor), state, transcript, confidence, error, start, stop, cancel }
}

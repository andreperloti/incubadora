'use client'

import { useEffect, useRef, useState } from 'react'

// Gera padrão de barras decorativas determinístico a partir de uma string
function generateBars(seed: string, count = 30): number[] {
  const bars: number[] = []
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0
  }
  for (let i = 0; i < count; i++) {
    // Combina hash com posição para variar as alturas
    const val = Math.abs(Math.sin(hash * 0.1 + i * 0.7) * 0.5 + Math.sin(i * 0.4 + hash * 0.3) * 0.5)
    // Centraliza: bordas mais baixas, meio mais alto (silhueta de voz)
    const envelope = Math.sin((i / (count - 1)) * Math.PI) * 0.6 + 0.4
    bars.push(Math.max(0.15, Math.min(1, val * envelope)))
  }
  return bars
}

function formatDuration(secs: number): string {
  if (!isFinite(secs) || isNaN(secs)) return '0:00'
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

type Props = {
  src: string        // URL via proxy /api/media?url=...
  seed: string       // para gerar waveform (ex: waMessageId)
  isOutgoing: boolean
  avatarUrl?: string | null
  contactName?: string
}

export function AudioPlayer({ src, seed, isOutgoing, avatarUrl, contactName }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)   // 0..1
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [loading, setLoading] = useState(false)

  const bars = generateBars(seed)
  const BAR_COUNT = bars.length

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const onLoaded = () => setDuration(audio.duration)
    const onTime = () => {
      setCurrentTime(audio.currentTime)
      setProgress(audio.duration ? audio.currentTime / audio.duration : 0)
    }
    const onEnded = () => { setPlaying(false); setProgress(0); setCurrentTime(0) }
    const onWaiting = () => setLoading(true)
    const onPlaying = () => setLoading(false)

    audio.addEventListener('loadedmetadata', onLoaded)
    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('waiting', onWaiting)
    audio.addEventListener('playing', onPlaying)
    return () => {
      audio.removeEventListener('loadedmetadata', onLoaded)
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('waiting', onWaiting)
      audio.removeEventListener('playing', onPlaying)
    }
  }, [src])

  function togglePlay() {
    const audio = audioRef.current
    if (!audio) return
    if (playing) {
      audio.pause()
      setPlaying(false)
    } else {
      audio.play()
      setPlaying(true)
    }
  }

  function handleBarClick(e: React.MouseEvent<HTMLDivElement>) {
    const audio = audioRef.current
    if (!audio || !audio.duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = (e.clientX - rect.left) / rect.width
    audio.currentTime = ratio * audio.duration
    setProgress(ratio)
  }

  const playedBars = Math.round(progress * BAR_COUNT)

  // Cores
  const playBtnBg = isOutgoing ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.1)'
  const barPlayed = isOutgoing ? '#ffffff' : '#00a884'
  const barUnplayed = isOutgoing ? 'rgba(255,255,255,0.35)' : '#3b5060'
  const timeColor = isOutgoing ? 'rgba(255,255,255,0.65)' : '#8696a0'

  const displayTime = playing || progress > 0 ? formatDuration(currentTime) : formatDuration(duration)

  return (
    <div className="flex items-center gap-2.5" style={{ minWidth: 220, maxWidth: 280 }}>
      <audio ref={audioRef} src={src} preload="metadata" />

      {/* Play/Pause button */}
      <button
        onClick={togglePlay}
        className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-opacity hover:opacity-80"
        style={{ background: playBtnBg }}
        aria-label={playing ? 'Pausar' : 'Reproduzir'}
      >
        {loading ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="animate-spin" style={{ color: isOutgoing ? '#fff' : '#00a884' }}>
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
          </svg>
        ) : playing ? (
          // Pause icon
          <svg width="16" height="16" viewBox="0 0 24 24" fill={isOutgoing ? '#fff' : '#00a884'}>
            <rect x="6" y="4" width="4" height="16" rx="1" />
            <rect x="14" y="4" width="4" height="16" rx="1" />
          </svg>
        ) : (
          // Play icon
          <svg width="16" height="16" viewBox="0 0 24 24" fill={isOutgoing ? '#fff' : '#00a884'}>
            <polygon points="5,3 19,12 5,21" />
          </svg>
        )}
      </button>

      {/* Waveform + time */}
      <div className="flex-1 flex items-center gap-2">
        {/* Waveform bars */}
        <div
          className="flex-1 flex items-center gap-px cursor-pointer"
          style={{ height: 28 }}
          onClick={handleBarClick}
        >
          {bars.map((h, i) => (
            <div
              key={i}
              style={{
                width: 3,
                height: `${Math.round(h * 100)}%`,
                minHeight: 3,
                borderRadius: 2,
                background: i < playedBars ? barPlayed : barUnplayed,
                transition: 'background 0.1s',
                flexShrink: 0,
              }}
            />
          ))}
        </div>

        {/* Timer */}
        <p className="text-xs leading-none flex-shrink-0" style={{ color: timeColor }}>
          {displayTime}
        </p>
      </div>

    </div>
  )
}

'use client'

import { useEffect, useState, useCallback, useRef } from 'react'

type SessionStatus = 'STOPPED' | 'STARTING' | 'SCAN_QR_CODE' | 'WORKING' | 'FAILED' | 'loading'

type SessionInfo = {
  sessionName: string
  status: SessionStatus
  me: { id: string; pushName: string } | null
}

type ImportProgress = {
  current: number
  total: number
  chatName: string
}

const STATUS_CONFIG: Record<string, { label: string; textColor: string; bg: string }> = {
  STOPPED:      { label: 'Desconectado',      textColor: '#8696a0', bg: '#2a3942' },
  STARTING:     { label: 'Iniciando...',       textColor: '#60a5fa', bg: '#1e3a5f' },
  SCAN_QR_CODE: { label: 'Aguardando QR Code', textColor: '#fbbf24', bg: '#3d2e00' },
  WORKING:      { label: 'Conectado',          textColor: '#34d399', bg: '#064e3b' },
  FAILED:       { label: 'Falha — reinicie',   textColor: '#f87171', bg: '#450a0a' },
  loading:      { label: 'Carregando...',      textColor: '#8696a0', bg: '#2a3942' },
}

// Spinner SVG inline
function Spinner({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg
      width={size} height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2.5"
      strokeLinecap="round"
      className="animate-spin"
      style={{ flexShrink: 0 }}
    >
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  )
}

// Skeleton pulsante para o QR
function QrSkeleton() {
  return (
    <div className="mx-auto w-56 h-56 rounded-xl overflow-hidden" style={{ background: '#2a3942' }}>
      <div className="w-full h-full animate-pulse" style={{ background: 'linear-gradient(90deg, #2a3942 25%, #374e5a 50%, #2a3942 75%)', backgroundSize: '200% 100%' }} />
    </div>
  )
}

export default function WhatsAppSetupPage() {
  const [info, setInfo] = useState<SessionInfo | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState('')
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null)
  const [importStatus, setImportStatus] = useState<string>('')
  const [importResult, setImportResult] = useState<{ conversations: number; messages: number } | null>(null)
  const [importError, setImportError] = useState('')
  const [qrCountdown, setQrCountdown] = useState(15)
  const [connecting, setConnecting] = useState(false)
  const importTriggeredRef = useRef(false)
  const prevStatusRef = useRef<SessionStatus | null>(null)

  const fetchStatus = useCallback(async () => {
    const res = await fetch('/api/admin/waha')
    if (res.ok) {
      const data = await res.json()
      setInfo(data)
    }
  }, [])

  const fetchQr = useCallback(async () => {
    setQrCountdown(15)
    const res = await fetch('/api/admin/waha/qr')
    if (res.ok) {
      const data = await res.json()
      setQr(data.qr)
    }
  }, [])

  const startImport = useCallback(async () => {
    if (importTriggeredRef.current) return
    importTriggeredRef.current = true
    setImportProgress(null)
    setImportResult(null)
    setImportError('')
    setImportStatus('Iniciando importação...')

    try {
      const res = await fetch('/api/admin/import-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatsLimit: 50, messagesPerChat: 100 }),
      })

      if (!res.ok || !res.body) {
        setImportError('Erro ao iniciar importação')
        importTriggeredRef.current = false
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const match = line.match(/^data: (.+)$/)
          if (!match) continue
          try {
            const data = JSON.parse(match[1])
            switch (data.type) {
              case 'status':
                setImportStatus(data.message)
                break
              case 'total':
                setImportStatus(`Encontradas ${data.total} conversas`)
                break
              case 'progress':
                setImportProgress({ current: data.current, total: data.total, chatName: data.chatName })
                setImportStatus(`Importando conversa ${data.current}/${data.total}`)
                break
              case 'done':
                setImportResult(data.imported)
                setImportProgress(null)
                setImportStatus('')
                break
              case 'error':
                setImportError(data.message)
                setImportProgress(null)
                setImportStatus('')
                break
            }
          } catch {}
        }
      }
    } catch {
      setImportError('Erro de conexão')
    } finally {
      importTriggeredRef.current = false
    }
  }, [])

  // Polling de status
  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 5000)
    return () => clearInterval(interval)
  }, [fetchStatus])

  // Busca QR e countdown quando em SCAN_QR_CODE
  useEffect(() => {
    if (info?.status !== 'SCAN_QR_CODE') {
      setQr(null)
      setQrCountdown(15)
      return
    }
    fetchQr()
    const refreshInterval = setInterval(fetchQr, 15000)

    // Countdown visual
    const countdownInterval = setInterval(() => {
      setQrCountdown((n) => (n <= 1 ? 15 : n - 1))
    }, 1000)

    return () => {
      clearInterval(refreshInterval)
      clearInterval(countdownInterval)
    }
  }, [info?.status, fetchQr])

  // Detecta transição para WORKING → mostra "Conectando" e dispara import
  useEffect(() => {
    const prev = prevStatusRef.current
    const current = info?.status
    prevStatusRef.current = current ?? null

    if (prev === 'SCAN_QR_CODE' && current === 'WORKING') {
      setConnecting(true)
      setTimeout(() => setConnecting(false), 3000)
      startImport()
    } else if (prev && prev !== 'WORKING' && current === 'WORKING') {
      startImport()
    }
  }, [info?.status, startImport])

  async function handleAction(action: 'start' | 'stop') {
    setActionLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/waha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Erro ao executar ação')
      } else {
        setTimeout(fetchStatus, 2000)
      }
    } catch {
      setError('Erro de conexão com o servidor')
    } finally {
      setActionLoading(false)
    }
  }

  const status = info?.status ?? 'loading'
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.loading
  const isImporting = !!importProgress || !!importStatus

  return (
    <div className="max-w-xl">
      <h1 className="text-lg font-bold mb-6" style={{ color: '#e9edef' }}>Conexão WhatsApp</h1>

      {/* Status card */}
      <div className="rounded-xl p-6 mb-6" style={{ background: '#202c33', border: '1px solid #2a3942' }}>
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#8696a0' }}>
            Status da sessão
          </p>
          {info && (
            <span className="text-xs font-mono" style={{ color: '#667781' }}>{info.sessionName}</span>
          )}
        </div>

        <div
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold"
          style={{ background: cfg.bg, color: cfg.textColor }}
        >
          {(status === 'STARTING' || status === 'loading') && <Spinner size={14} color={cfg.textColor} />}
          {status === 'SCAN_QR_CODE' && <span>📱</span>}
          {status === 'WORKING' && <span>✅</span>}
          {status === 'STOPPED' && <span>⭕</span>}
          {status === 'FAILED' && <span>❌</span>}
          <span>{cfg.label}</span>
        </div>

        {/* Conectando após scan */}
        {connecting && (
          <div className="mt-4 flex items-center gap-3 px-4 py-3 rounded-xl" style={{ background: '#064e3b' }}>
            <Spinner size={16} color="#34d399" />
            <p className="text-sm font-semibold" style={{ color: '#34d399' }}>
              WhatsApp conectado! Sincronizando conversas...
            </p>
          </div>
        )}

        {!connecting && status === 'WORKING' && info?.me && (
          <div className="mt-4 p-3 rounded-xl text-sm" style={{ background: '#064e3b', color: '#34d399' }}>
            <p className="font-semibold">WhatsApp conectado</p>
            <p className="text-xs mt-1 opacity-80">
              {info.me.pushName} · {info.me.id.replace('@c.us', '')}
            </p>
          </div>
        )}

        {error && (
          <p className="mt-3 text-xs px-3 py-2 rounded-lg" style={{ background: '#450a0a', color: '#f87171' }}>
            {error}
          </p>
        )}

        <div className="mt-5 flex gap-3">
          {(status === 'STOPPED' || status === 'FAILED') && (
            <button
              onClick={() => handleAction('start')}
              disabled={actionLoading}
              className="bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-5 py-2 rounded-lg transition disabled:opacity-60 flex items-center gap-2"
            >
              {actionLoading ? <><Spinner size={14} color="white" /> Iniciando...</> : '▶ Conectar WhatsApp'}
            </button>
          )}
          {(status === 'WORKING' || status === 'STARTING' || status === 'SCAN_QR_CODE') && (
            <button
              onClick={() => handleAction('stop')}
              disabled={actionLoading}
              className="text-sm font-semibold px-5 py-2 rounded-lg transition disabled:opacity-60 flex items-center gap-2"
              style={{ border: '1px solid #f87171', color: '#f87171' }}
            >
              {actionLoading ? <><Spinner size={14} color="#f87171" /> Parando...</> : '⏹ Desconectar'}
            </button>
          )}
        </div>
      </div>

      {/* QR Code */}
      {status === 'SCAN_QR_CODE' && (
        <div
          className="rounded-xl p-6 text-center"
          style={{ background: '#202c33', border: '1px solid #fbbf2440' }}
        >
          <p className="text-sm font-semibold mb-1" style={{ color: '#e9edef' }}>Escaneie o QR Code</p>
          <p className="text-xs mb-4" style={{ color: '#8696a0' }}>
            Abra o WhatsApp → Menu → Aparelhos conectados → Conectar aparelho
          </p>

          {qr ? (
            <div className="relative inline-block">
              <img
                src={qr}
                alt="QR Code WhatsApp"
                className="mx-auto w-56 h-56 rounded-xl"
                style={{ border: '1px solid #2a3942' }}
              />
              {/* Countdown badge */}
              <div
                className="absolute bottom-2 right-2 flex items-center gap-1 px-2 py-1 rounded-full text-xs font-mono"
                style={{ background: '#0b141acc', color: '#8696a0' }}
              >
                <Spinner size={10} color="#8696a0" />
                {qrCountdown}s
              </div>
            </div>
          ) : (
            <QrSkeleton />
          )}

          <p className="text-xs mt-3" style={{ color: '#667781' }}>
            O QR Code atualiza automaticamente a cada 15 segundos
          </p>
        </div>
      )}

      {/* Instruções */}
      {(status === 'STOPPED' || status === 'FAILED') && (
        <div
          className="rounded-xl p-5 text-sm"
          style={{ background: '#1e3a5f', border: '1px solid #1d4ed840' }}
        >
          <p className="font-semibold mb-2 text-blue-300">Como conectar</p>
          <ol className="space-y-1 text-xs list-decimal list-inside" style={{ color: '#93c5fd' }}>
            <li>Clique em <strong>Conectar WhatsApp</strong> acima</li>
            <li>Aguarde o QR Code aparecer</li>
            <li>Abra o WhatsApp no celular</li>
            <li>Acesse <strong>Menu → Aparelhos conectados → Conectar aparelho</strong></li>
            <li>Aponte a câmera para o QR Code</li>
          </ol>
        </div>
      )}

      {/* Importação */}
      {status === 'WORKING' && (
        <div className="rounded-xl p-6 mt-6" style={{ background: '#202c33', border: '1px solid #2a3942' }}>
          <p className="text-sm font-semibold mb-1" style={{ color: '#e9edef' }}>
            Sincronização de conversas
          </p>
          <p className="text-xs mb-4" style={{ color: '#8696a0' }}>
            As conversas do WhatsApp são importadas automaticamente ao conectar.
            Mensagens já importadas são ignoradas.
          </p>

          {isImporting && (
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <Spinner size={14} color="#53bdeb" />
                <p className="text-xs font-semibold" style={{ color: '#e9edef' }}>{importStatus}</p>
                {importProgress && (
                  <span className="text-xs font-mono ml-auto" style={{ color: '#53bdeb' }}>
                    {importProgress.current}/{importProgress.total}
                  </span>
                )}
              </div>
              {importProgress && (
                <>
                  <div className="w-full rounded-full h-2" style={{ background: '#2a3942' }}>
                    <div
                      className="h-2 rounded-full transition-all duration-500"
                      style={{
                        width: `${(importProgress.current / importProgress.total) * 100}%`,
                        background: '#00a884',
                      }}
                    />
                  </div>
                  <p className="text-xs mt-2 truncate" style={{ color: '#8696a0' }}>
                    {importProgress.chatName}
                  </p>
                </>
              )}
            </div>
          )}

          {importResult && (
            <div className="mb-4 px-4 py-3 rounded-lg text-xs" style={{ background: '#064e3b', color: '#34d399' }}>
              ✓ Importação concluída — <strong>{importResult.conversations}</strong> novas conversas,{' '}
              <strong>{importResult.messages}</strong> mensagens importadas.
            </div>
          )}

          {importError && (
            <p className="mb-4 text-xs px-3 py-2 rounded-lg" style={{ background: '#450a0a', color: '#f87171' }}>
              {importError}
            </p>
          )}

          {!isImporting && (
            <button
              onClick={startImport}
              className="text-sm font-semibold px-5 py-2 rounded-lg transition"
              style={{ border: '1px solid #00a884', color: '#00a884' }}
            >
              🔄 Reimportar conversas
            </button>
          )}
        </div>
      )}
    </div>
  )
}

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

const STATUS_CONFIG: Record<string, { label: string; textColor: string; bg: string; icon: string }> = {
  STOPPED:      { label: 'Desconectado',        textColor: '#8696a0', bg: '#2a3942', icon: '⭕' },
  STARTING:     { label: 'Iniciando...',         textColor: '#60a5fa', bg: '#1e3a5f', icon: '🔄' },
  SCAN_QR_CODE: { label: 'Aguardando QR Code',   textColor: '#fbbf24', bg: '#3d2e00', icon: '📱' },
  WORKING:      { label: 'Conectado',            textColor: '#34d399', bg: '#064e3b', icon: '✅' },
  FAILED:       { label: 'Falha — reinicie',     textColor: '#f87171', bg: '#450a0a', icon: '❌' },
  loading:      { label: 'Carregando...',        textColor: '#8696a0', bg: '#2a3942', icon: '⏳' },
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

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 5000)
    return () => clearInterval(interval)
  }, [fetchStatus])

  useEffect(() => {
    if (info?.status !== 'SCAN_QR_CODE') {
      setQr(null)
      return
    }
    fetchQr()
    const interval = setInterval(fetchQr, 15000)
    return () => clearInterval(interval)
  }, [info?.status, fetchQr])

  // Auto-import quando transita para WORKING (acabou de conectar)
  useEffect(() => {
    const prev = prevStatusRef.current
    const current = info?.status
    prevStatusRef.current = current ?? null

    if (prev && prev !== 'WORKING' && current === 'WORKING') {
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
      <div
        className="rounded-xl p-6 mb-6"
        style={{ background: '#202c33', border: '1px solid #2a3942' }}
      >
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
          <span>{cfg.icon}</span>
          <span>{cfg.label}</span>
        </div>

        {status === 'WORKING' && info?.me && (
          <div
            className="mt-4 p-3 rounded-xl text-sm"
            style={{ background: '#064e3b', color: '#34d399' }}
          >
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
              className="bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-5 py-2 rounded-lg transition disabled:opacity-60"
            >
              {actionLoading ? 'Iniciando...' : '▶ Conectar WhatsApp'}
            </button>
          )}
          {(status === 'WORKING' || status === 'STARTING' || status === 'SCAN_QR_CODE') && (
            <button
              onClick={() => handleAction('stop')}
              disabled={actionLoading}
              className="text-sm font-semibold px-5 py-2 rounded-lg transition disabled:opacity-60"
              style={{ border: '1px solid #f87171', color: '#f87171' }}
            >
              {actionLoading ? 'Parando...' : '⏹ Desconectar'}
            </button>
          )}
          {status === 'FAILED' && (
            <button
              onClick={() => handleAction('start')}
              disabled={actionLoading}
              className="text-sm px-5 py-2 rounded-lg transition disabled:opacity-60"
              style={{ border: '1px solid #2a3942', color: '#8696a0' }}
            >
              🔄 Tentar novamente
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
            Abra o WhatsApp no celular → Menu → Aparelhos conectados → Conectar aparelho
          </p>
          {qr ? (
            <img
              src={qr}
              alt="QR Code WhatsApp"
              className="mx-auto w-56 h-56 rounded-xl"
              style={{ border: '1px solid #2a3942' }}
            />
          ) : (
            <div
              className="mx-auto w-56 h-56 rounded-xl flex items-center justify-center"
              style={{ border: '2px dashed #2a3942' }}
            >
              <p className="text-xs" style={{ color: '#8696a0' }}>Carregando QR Code...</p>
            </div>
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

      {/* Importação de histórico (automática + manual) */}
      {status === 'WORKING' && (
        <div
          className="rounded-xl p-6 mt-6"
          style={{ background: '#202c33', border: '1px solid #2a3942' }}
        >
          <p className="text-sm font-semibold mb-1" style={{ color: '#e9edef' }}>
            Sincronização de conversas
          </p>
          <p className="text-xs mb-4" style={{ color: '#8696a0' }}>
            As conversas do WhatsApp são importadas automaticamente ao conectar.
            Mensagens já importadas são ignoradas.
          </p>

          {/* Progress bar */}
          {isImporting && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold" style={{ color: '#e9edef' }}>{importStatus}</p>
                {importProgress && (
                  <span className="text-xs font-mono" style={{ color: '#53bdeb' }}>
                    {importProgress.current}/{importProgress.total}
                  </span>
                )}
              </div>
              {importProgress && (
                <>
                  <div className="w-full rounded-full h-2" style={{ background: '#2a3942' }}>
                    <div
                      className="h-2 rounded-full transition-all duration-300"
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
            <div
              className="mb-4 px-4 py-3 rounded-lg text-xs"
              style={{ background: '#064e3b', color: '#34d399' }}
            >
              Importação concluída: <strong>{importResult.conversations}</strong> novas conversas,{' '}
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

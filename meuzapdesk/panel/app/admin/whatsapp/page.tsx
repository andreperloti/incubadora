'use client'

import { useEffect, useState, useCallback } from 'react'

type SessionStatus = 'STOPPED' | 'STARTING' | 'SCAN_QR_CODE' | 'WORKING' | 'FAILED' | 'loading'

type SessionInfo = {
  sessionName: string
  status: SessionStatus
  me: { id: string; pushName: string } | null
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  STOPPED:      { label: 'Desconectado',           color: 'text-gray-500 bg-gray-100',   icon: '⭕' },
  STARTING:     { label: 'Iniciando...',            color: 'text-blue-600 bg-blue-50',    icon: '🔄' },
  SCAN_QR_CODE: { label: 'Aguardando QR Code',      color: 'text-yellow-600 bg-yellow-50', icon: '📱' },
  WORKING:      { label: 'Conectado',               color: 'text-green-600 bg-green-50',  icon: '✅' },
  FAILED:       { label: 'Falha — reinicie',        color: 'text-red-600 bg-red-50',      icon: '❌' },
  loading:      { label: 'Carregando...',           color: 'text-gray-400 bg-gray-50',    icon: '⏳' },
}

export default function WhatsAppSetupPage() {
  const [info, setInfo] = useState<SessionInfo | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState('')

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

  // Poll status a cada 5s
  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 5000)
    return () => clearInterval(interval)
  }, [fetchStatus])

  // Quando estiver aguardando QR, faz poll do QR a cada 15s
  useEffect(() => {
    if (info?.status !== 'SCAN_QR_CODE') {
      setQr(null)
      return
    }
    fetchQr()
    const interval = setInterval(fetchQr, 15000)
    return () => clearInterval(interval)
  }, [info?.status, fetchQr])

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

  return (
    <div className="max-w-xl">
      <h1 className="text-xl font-bold text-gray-900 mb-6">Conexão WhatsApp</h1>

      {/* Status card */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm mb-6">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold text-gray-600">Status da sessão</p>
          {info && (
            <span className="text-xs text-gray-400 font-mono">{info.sessionName}</span>
          )}
        </div>

        <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold ${cfg.color}`}>
          <span>{cfg.icon}</span>
          <span>{cfg.label}</span>
        </div>

        {status === 'WORKING' && info?.me && (
          <div className="mt-4 p-3 bg-green-50 rounded-xl text-sm text-green-800">
            <p className="font-semibold">WhatsApp conectado</p>
            <p className="text-xs mt-1 text-green-600">
              {info.me.pushName} · {info.me.id.replace('@c.us', '')}
            </p>
          </div>
        )}

        {error && (
          <p className="mt-3 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
        )}

        {/* Ações */}
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
              className="border border-red-300 text-red-600 hover:bg-red-50 text-sm font-semibold px-5 py-2 rounded-lg transition disabled:opacity-60"
            >
              {actionLoading ? 'Parando...' : '⏹ Desconectar'}
            </button>
          )}
          {status === 'FAILED' && (
            <button
              onClick={() => handleAction('start')}
              disabled={actionLoading}
              className="border border-gray-300 text-gray-600 hover:bg-gray-50 text-sm px-5 py-2 rounded-lg transition disabled:opacity-60"
            >
              🔄 Tentar novamente
            </button>
          )}
        </div>
      </div>

      {/* QR Code */}
      {status === 'SCAN_QR_CODE' && (
        <div className="bg-white rounded-2xl border border-yellow-200 p-6 shadow-sm text-center">
          <p className="text-sm font-semibold text-gray-700 mb-1">Escaneie o QR Code</p>
          <p className="text-xs text-gray-500 mb-4">
            Abra o WhatsApp no celular → Menu → Aparelhos conectados → Conectar aparelho
          </p>

          {qr ? (
            <img
              src={qr}
              alt="QR Code WhatsApp"
              className="mx-auto w-56 h-56 rounded-xl border border-gray-200"
            />
          ) : (
            <div className="mx-auto w-56 h-56 rounded-xl border border-dashed border-gray-300 flex items-center justify-center">
              <p className="text-xs text-gray-400">Carregando QR Code...</p>
            </div>
          )}

          <p className="text-xs text-gray-400 mt-3">
            O QR Code atualiza automaticamente a cada 15 segundos
          </p>
        </div>
      )}

      {/* Instruções */}
      {(status === 'STOPPED' || status === 'FAILED') && (
        <div className="bg-blue-50 rounded-2xl border border-blue-100 p-5 text-sm text-blue-800">
          <p className="font-semibold mb-2">Como conectar</p>
          <ol className="space-y-1 text-xs list-decimal list-inside text-blue-700">
            <li>Clique em <strong>Conectar WhatsApp</strong> acima</li>
            <li>Aguarde o QR Code aparecer</li>
            <li>Abra o WhatsApp no celular</li>
            <li>Acesse <strong>Menu → Aparelhos conectados → Conectar aparelho</strong></li>
            <li>Aponte a câmera para o QR Code</li>
          </ol>
        </div>
      )}
    </div>
  )
}

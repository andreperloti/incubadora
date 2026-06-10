'use client'

import { useEffect, useState, useCallback } from 'react'

type LogLevel = 'error' | 'warn' | 'info'

type LogEntry = {
  id: number
  level: LogLevel
  context: string
  message: string
  details: Record<string, unknown> | null
  createdAt: string
}

const LEVEL_CONFIG: Record<LogLevel, { label: string; bg: string; color: string; dot: string }> = {
  error: { label: 'Erro',  bg: '#450a0a', color: '#f87171', dot: '#ef4444' },
  warn:  { label: 'Aviso', bg: '#431407', color: '#fb923c', dot: '#f97316' },
  info:  { label: 'Info',  bg: '#0c1a35', color: '#60a5fa', dot: '#3b82f6' },
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

export default function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<LogLevel | ''>('')
  const [expanded, setExpanded] = useState<number | null>(null)
  const [clearing, setClearing] = useState(false)

  const fetchLogs = useCallback(async () => {
    const url = filter ? `/api/admin/logs?level=${filter}&limit=200` : '/api/admin/logs?limit=200'
    const res = await fetch(url)
    if (res.ok) {
      setLogs(await res.json())
    }
    setLoading(false)
  }, [filter])

  useEffect(() => {
    setLoading(true)
    fetchLogs()
    const interval = setInterval(fetchLogs, 30000)
    return () => clearInterval(interval)
  }, [fetchLogs])

  async function clearLogs() {
    if (!confirm('Apagar todos os logs? Esta ação não pode ser desfeita.')) return
    setClearing(true)
    await fetch('/api/admin/logs', { method: 'DELETE' })
    setLogs([])
    setClearing(false)
  }

  const errorCount = logs.filter(l => l.level === 'error').length
  const warnCount  = logs.filter(l => l.level === 'warn').length

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-bold" style={{ color: '#e9edef' }}>Logs do sistema</h1>
          <p className="text-xs mt-1" style={{ color: '#8696a0' }}>
            Últimas 200 entradas · atualiza a cada 30s
          </p>
        </div>
        <button
          onClick={clearLogs}
          disabled={clearing || logs.length === 0}
          className="text-xs px-3 py-1.5 rounded-lg transition disabled:opacity-40"
          style={{ border: '1px solid #f87171', color: '#f87171' }}
        >
          {clearing ? 'Limpando...' : 'Limpar logs'}
        </button>
      </div>

      {/* Resumo */}
      <div className="flex gap-3 mb-5">
        {[
          { key: '' as const,       label: 'Todos',  count: logs.length,  color: '#8696a0' },
          { key: 'error' as const,  label: 'Erros',  count: errorCount,   color: '#f87171' },
          { key: 'warn' as const,   label: 'Avisos', count: warnCount,    color: '#fb923c' },
          { key: 'info' as const,   label: 'Info',   count: logs.filter(l => l.level === 'info').length, color: '#60a5fa' },
        ].map(({ key, label, count, color }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className="flex-1 py-3 rounded-xl text-center transition"
            style={{
              background: filter === key ? '#2a3942' : '#202c33',
              border: `1px solid ${filter === key ? color : '#2a3942'}`,
            }}
          >
            <p className="text-xl font-bold" style={{ color }}>{count}</p>
            <p className="text-xs mt-0.5" style={{ color: '#8696a0' }}>{label}</p>
          </button>
        ))}
      </div>

      {/* Lista */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #2a3942' }}>
        {loading ? (
          <div className="py-12 text-center text-sm" style={{ color: '#8696a0' }}>
            Carregando...
          </div>
        ) : logs.length === 0 ? (
          <div className="py-12 text-center text-sm" style={{ color: '#8696a0' }}>
            Nenhum log encontrado.
          </div>
        ) : (
          logs.map((log, i) => {
            const cfg = LEVEL_CONFIG[log.level] ?? LEVEL_CONFIG.info
            const isOpen = expanded === log.id
            const hasDetails = log.details && Object.keys(log.details).length > 0

            return (
              <div
                key={log.id}
                className="border-b last:border-b-0"
                style={{ borderColor: '#2a3942', background: i % 2 === 0 ? '#0d1f26' : '#0b141a' }}
              >
                <button
                  onClick={() => hasDetails ? setExpanded(isOpen ? null : log.id) : undefined}
                  className="w-full text-left px-4 py-3"
                  style={{ cursor: hasDetails ? 'pointer' : 'default' }}
                >
                  <div className="flex items-start gap-3">
                    {/* Dot de nível */}
                    <div
                      className="mt-1.5 w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: cfg.dot }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className="text-xs font-semibold px-1.5 py-0.5 rounded"
                          style={{ background: cfg.bg, color: cfg.color }}
                        >
                          {cfg.label}
                        </span>
                        <span
                          className="text-xs font-mono px-1.5 py-0.5 rounded"
                          style={{ background: '#2a3942', color: '#53bdeb' }}
                        >
                          {log.context}
                        </span>
                        <span className="text-xs ml-auto flex-shrink-0" style={{ color: '#667781' }}>
                          {formatDate(log.createdAt)}
                        </span>
                      </div>
                      <p className="text-sm mt-1 leading-snug break-words" style={{ color: '#e9edef' }}>
                        {log.message}
                      </p>
                    </div>
                    {hasDetails && (
                      <span className="text-xs mt-1 flex-shrink-0" style={{ color: '#8696a0' }}>
                        {isOpen ? '▲' : '▼'}
                      </span>
                    )}
                  </div>
                </button>

                {isOpen && hasDetails && (
                  <div className="px-4 pb-3 pl-9">
                    <pre
                      className="text-xs rounded-lg p-3 overflow-x-auto"
                      style={{ background: '#111b21', color: '#8696a0', maxHeight: '300px' }}
                    >
                      {JSON.stringify(log.details, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

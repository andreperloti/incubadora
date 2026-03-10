'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import type { Session } from 'next-auth'
import clsx from 'clsx'
import { LeftNavStrip } from '@/components/LeftNavStrip'

// ─── Types ───────────────────────────────────────────────────────────────────

type Alert = { alertLevel: string; minutesWaiting: number }

type ConvSummary = {
  id: number
  customerPhone: string
  customerName: string | null
  status: string
  optionSelected: number | null
  lastCustomerMessageAt: string | null
  customerWaitingSince: string | null
  assignedUser: { id: number; name: string } | null
  messages: { content: string; direction: string; sentAt: string }[]
  alerts: Alert[]
}

type Message = {
  id: number
  direction: 'in' | 'out'
  content: string
  sentAt: string
  senderUser: { id: number; name: string } | null
}

type ConvDetail = {
  id: number
  customerPhone: string
  customerName: string | null
  status: string
  messages: Message[]
  assignedUser: { id: number; name: string } | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  waiting_menu: 'Aguardando menu',
  in_queue: 'Na fila',
  in_progress: 'Em atendimento',
}

const OPTION_LABEL: Record<number, string> = {
  1: '🔧 Orçamento (peças)',
  2: '🔍 Diagnóstico',
  3: '📋 Status serviço',
  4: '📦 Fornecedores',
}

function minutesAgo(date: string | null): string {
  if (!date) return ''
  const mins = Math.floor((Date.now() - new Date(date).getTime()) / 60000)
  if (mins < 1) return 'agora'
  if (mins < 60) return `${mins}min`
  return `${Math.floor(mins / 60)}h`
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

// ─── ChatPanel ────────────────────────────────────────────────────────────────

function ChatPanel({
  conversation,
  userName,
  onResolve,
  onNewMessage,
}: {
  conversation: ConvDetail
  userName: string
  onResolve: () => void
  onNewMessage: (msg: Message) => void
}) {
  const [messages, setMessages] = useState<Message[]>(conversation.messages)
  const [status, setStatus] = useState(conversation.status)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'instant' })
  }, [messages])

  // Merge messages from parent (SSE updates) without duplicating by id
  useEffect(() => {
    setMessages((prev) => {
      const existingIds = new Set(prev.map((m) => m.id))
      const toAdd = conversation.messages.filter((m) => !existingIds.has(m.id))
      return toAdd.length > 0 ? [...prev, ...toAdd] : prev
    })
  }, [conversation.messages])

  // When conversation changes, reset entirely
  useEffect(() => {
    setMessages(conversation.messages)
    setStatus(conversation.status)
    setText('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id])

  async function handleSend() {
    if (!text.trim() || sending) return
    setSending(true)
    const body = text.trim()
    setText('')

    const res = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: conversation.id, message: body }),
    })

    if (res.ok) {
      const data = await res.json()
      if (data.message) {
        setMessages((prev) =>
          prev.some((m) => m.id === data.message.id) ? prev : [...prev, data.message]
        )
        setStatus('in_progress')
      }
    } else {
      setText(body)
    }
    setSending(false)
    textareaRef.current?.focus()
  }

  async function handleResolve() {
    await fetch(`/api/conversations/${conversation.id}/resolve`, { method: 'POST' })
    onResolve()
  }

  const displayName = conversation.customerName || conversation.customerPhone
  const isResolved = status === 'resolved'

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="flex-shrink-0 px-4 py-3 flex items-center gap-3 border-b"
        style={{ background: '#202c33', borderColor: '#2a3942' }}
      >
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0"
          style={{ background: isResolved ? '#3d5060' : '#15803d' }}
        >
          {displayName.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-gray-100 text-sm">{displayName}</p>
            {isResolved && (
              <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: '#2a3942', color: '#8696a0' }}>
                Encerrada
              </span>
            )}
          </div>
          <p className="text-xs" style={{ color: '#8696a0' }}>{conversation.customerPhone}</p>
        </div>
        {conversation.assignedUser && (
          <span className="text-xs hidden sm:block" style={{ color: '#8696a0' }}>
            {conversation.assignedUser.name}
          </span>
        )}
        {!isResolved && (
          <button
            onClick={handleResolve}
            className="flex-shrink-0 text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg transition"
          >
            Encerrar ✓
          </button>
        )}
      </div>

      {/* Messages */}
      <div
        className="flex-1 overflow-y-auto px-4 py-4 space-y-1"
        style={{
          background: '#0b141a',
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300' opacity='0.03'%3E%3Ctext x='10' y='60' font-size='40' fill='%23fff'%3E💬%3C/text%3E%3Ctext x='150' y='150' font-size='30' fill='%23fff'%3E🌿%3C/text%3E%3Ctext x='60' y='230' font-size='35' fill='%23fff'%3E💬%3C/text%3E%3Ctext x='220' y='280' font-size='28' fill='%23fff'%3E🌿%3C/text%3E%3C/svg%3E")`,
        }}
      >
        {messages.map((msg) => {
            let prefix: string | null = null
            let body = msg.content
            if (msg.direction === 'out') {
              // Formato novo: "*Nome:*\nmensagem"
              const newIdx = msg.content.indexOf(':*\n')
              if (msg.content.startsWith('*') && newIdx !== -1) {
                prefix = msg.content.slice(1, newIdx)       // "Nome"
                body = msg.content.slice(newIdx + 3)         // após ":*\n"
              } else {
                // Compatibilidade com formato antigo "Nome: mensagem"
                const colonIdx = msg.content.indexOf(': ')
                if (colonIdx !== -1) {
                  prefix = msg.content.slice(0, colonIdx)
                  body = msg.content.slice(colonIdx + 2)
                }
              }
            }

            return (
              <div
                key={msg.id}
                className={clsx('flex', msg.direction === 'out' ? 'justify-end' : 'justify-start')}
              >
                <div
                  className="max-w-xs lg:max-w-md xl:max-w-lg px-3 py-2 text-sm shadow-sm"
                  style={
                    msg.direction === 'out'
                      ? { background: '#005c4b', color: '#e9edef', borderRadius: '8px 8px 0 8px' }
                      : { background: '#202c33', color: '#e9edef', borderRadius: '8px 8px 8px 0' }
                  }
                >
                  {prefix && (
                    <p className="text-xs font-bold mb-0.5" style={{ color: '#53bdeb' }}>
                      {prefix}:
                    </p>
                  )}
                  <p className="whitespace-pre-wrap break-words leading-snug">{body}</p>
                  <p className="text-right text-xs mt-1 ml-4" style={{ color: '#8696a0' }}>
                    {formatTime(msg.sentAt)}
                  </p>
                </div>
              </div>
            )
          })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div
        className="flex-shrink-0 px-3 py-2.5 flex items-end gap-2"
        style={{ background: '#202c33' }}
      >
          <div
            className="flex-1 rounded-full px-4 py-2.5 flex items-end gap-2"
            style={{ background: '#2a3942', minHeight: '44px' }}
          >
            <span className="text-xs flex-shrink-0 pb-0.5 whitespace-nowrap" style={{ color: '#8696a0' }}>
              {userName}:
            </span>
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => {
                setText(e.target.value)
                e.target.style.height = 'auto'
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              placeholder="Digite uma mensagem"
              rows={1}
              className="flex-1 bg-transparent text-sm focus:outline-none resize-none leading-5"
              style={{ color: '#e9edef', maxHeight: '120px' }}
            />
          </div>
          <button
            onClick={handleSend}
            disabled={sending || !text.trim()}
            className="flex-shrink-0 w-10 h-10 rounded-full bg-green-600 hover:bg-green-700 flex items-center justify-center transition disabled:opacity-40"
          >
            {sending ? (
              <span className="text-white text-xs">...</span>
            ) : (
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white ml-0.5">
                <path d="M1.101 21.757L23.8 12.028 1.101 2.3l.011 7.912 13.623 1.816-13.623 1.817-.011 7.912z" />
              </svg>
            )}
          </button>
      </div>
    </div>
  )
}


// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div
      className="flex flex-col items-center justify-center h-full"
      style={{ background: '#0b141a' }}
    >
      <div
        className="w-20 h-20 rounded-full flex items-center justify-center text-4xl mb-4"
        style={{ background: 'rgba(255,255,255,0.05)' }}
      >
        💬
      </div>
      <p className="text-lg font-light" style={{ color: '#e9edef' }}>MeuZapDesk</p>
      <p className="text-sm mt-1" style={{ color: '#8696a0' }}>
        Selecione uma conversa para começar a atender
      </p>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function AtendimentoClient({
  conversations: initial,
  recentConversations: initialRecent,
  session,
}: {
  conversations: ConvSummary[]
  recentConversations: ConvSummary[]
  session: Session
}) {
  const user = session.user as any
  const isOwner = user.role === 'OWNER'

  const [conversations, setConversations] = useState<ConvSummary[]>(initial)
  const [recentConversations] = useState<ConvSummary[]>(initialRecent)
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [activeConv, setActiveConv] = useState<ConvDetail | null>(null)
  const [loadingConv, setLoadingConv] = useState(false)
  const activeIdRef = useRef<number | null>(null)

  useEffect(() => {
    activeIdRef.current = selectedId
  }, [selectedId])

  const loadConversation = useCallback(async (id: number) => {
    setLoadingConv(true)
    try {
      const res = await fetch(`/api/conversations/${id}`)
      if (res.ok) {
        const data = await res.json()
        setActiveConv(data)
      }
    } finally {
      setLoadingConv(false)
    }
  }, [])

  useEffect(() => {
    if (selectedId !== null) {
      loadConversation(selectedId)
    }
  }, [selectedId, loadConversation])

  const refreshList = useCallback(() => {
    fetch('/api/conversations')
      .then((r) => r.json())
      .then((data) => setConversations(data))
      .catch(() => {})
  }, [])

  useEffect(() => {
    let es: EventSource
    let closed = false

    function connect() {
      if (closed) return
      es = new EventSource('/api/sse')

      es.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data)

          if (event.type === 'new_message') {
            if (event.conversationId === activeIdRef.current) {
              setActiveConv((prev) =>
                prev ? { ...prev, messages: [...prev.messages, event.message] } : prev
              )
            }
            refreshList()
          }

          if (event.type === 'alert') {
            refreshList()
          }
        } catch {}
      }

      es.onerror = () => {
        es.close()
        if (!closed) {
          setTimeout(connect, 3000)
        }
      }
    }

    connect()

    return () => {
      closed = true
      es?.close()
    }
  }, [refreshList])

  function handleResolve() {
    setSelectedId(null)
    setActiveConv(null)
    refreshList()
  }

  const filtered = conversations.filter((c) => {
    const term = search.toLowerCase()
    if (!term) return true
    return (
      (c.customerName?.toLowerCase().includes(term) ?? false) ||
      c.customerPhone.includes(term)
    )
  })

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#111b21' }}>

      {/* ── Left nav strip ──────────────────────────────────────────────────── */}
      <LeftNavStrip
        user={{
          name: user.name,
          image: user.image,
          isOwner,
          businessName: user.businessName,
        }}
        activePage="atendimento"
      />

      {/* ── Sidebar (chat list) ──────────────────────────────────────────────── */}
      <div
        className="flex-shrink-0 w-[440px] flex flex-col overflow-hidden"
        style={{ background: '#111b21', borderRight: '1px solid #2a3942' }}
      >
        {/* Sidebar header */}
        <div
          className="flex-shrink-0 px-4 py-3"
          style={{ background: '#202c33', borderBottom: '1px solid #2a3942' }}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-gray-100">MeuZapDesk</span>
              <span className="text-xs" style={{ color: '#8696a0' }}>— {user.businessName}</span>
            </div>
            {conversations.length > 0 && (
              <span className="bg-green-600 text-white text-xs rounded-full px-2 py-0.5 font-medium">
                {conversations.length}
              </span>
            )}
          </div>
          {/* Search */}
          <div
            className="flex items-center gap-2 rounded-lg px-3 py-1.5"
            style={{ background: '#2a3942' }}
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 flex-shrink-0 fill-current" style={{ color: '#8696a0' }}>
              <path d="M15.009 13.805h-.636l-.22-.219a5.184 5.184 0 0 0 1.256-3.386 5.207 5.207 0 1 0-5.207 5.208 5.183 5.183 0 0 0 3.385-1.255l.221.22v.635l4.004 3.999 1.194-1.195-3.997-4.007zm-4.808 0a3.605 3.605 0 1 1 0-7.21 3.605 3.605 0 0 1 0 7.21z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar conversa"
              className="flex-1 bg-transparent text-sm focus:outline-none"
              style={{ color: '#e9edef' }}
            />
          </div>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 && recentConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-sm py-8" style={{ color: '#8696a0' }}>
              <p className="text-2xl mb-2">✅</p>
              <p>Sem conversas em aberto</p>
            </div>
          ) : (
            <>
              {filtered.length === 0 && (
                <div className="flex flex-col items-center py-6 text-sm" style={{ color: '#8696a0' }}>
                  <p className="text-2xl mb-1">✅</p>
                  <p>Sem conversas em aberto</p>
                </div>
              )}

              {filtered.map((conv) => {
                const lastMsg = conv.messages[0]
                const isSelected = conv.id === selectedId
                const hasUrgent = conv.alerts.some((a) => a.alertLevel === 'urgent')
                const hasWarn = conv.alerts.some((a) => a.alertLevel === 'warning')
                const displayName = conv.customerName || conv.customerPhone

                return (
                  <button
                    key={conv.id}
                    onClick={() => setSelectedId(conv.id)}
                    className={clsx(
                      'w-full text-left px-3 py-3 flex items-start gap-3 transition-colors border-b',
                      isSelected ? 'bg-gray-700' : 'hover:bg-gray-800',
                      hasUrgent
                        ? 'border-l-4 border-l-red-500'
                        : hasWarn
                        ? 'border-l-4 border-l-yellow-400'
                        : 'border-l-4 border-l-transparent'
                    )}
                    style={{ borderBottomColor: '#2a3942' }}
                  >
                    <div className="flex-shrink-0 w-11 h-11 rounded-full bg-teal-700 flex items-center justify-center text-white font-semibold text-base">
                      {displayName.charAt(0).toUpperCase()}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <p className="font-semibold text-sm text-gray-100 truncate">{displayName}</p>
                        <span className="text-xs flex-shrink-0" style={{ color: '#8696a0' }}>
                          {minutesAgo(conv.customerWaitingSince || conv.lastCustomerMessageAt)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-1 mt-0.5">
                        <p className="text-xs truncate" style={{ color: '#8696a0' }}>
                          {lastMsg
                            ? (lastMsg.direction === 'out' ? '↪ ' : '') + lastMsg.content
                            : STATUS_LABEL[conv.status] || conv.status}
                        </p>
                        {hasUrgent && (
                          <span className="flex-shrink-0 min-w-[18px] h-[18px] text-xs bg-red-500 text-white rounded-full flex items-center justify-center font-bold">
                            !
                          </span>
                        )}
                        {!hasUrgent && hasWarn && (
                          <span className="flex-shrink-0 min-w-[18px] h-[18px] text-xs bg-yellow-500 text-white rounded-full flex items-center justify-center font-bold">
                            !
                          </span>
                        )}
                      </div>
                      {conv.optionSelected && (
                        <p className="text-xs truncate mt-0.5" style={{ color: '#667781' }}>
                          {OPTION_LABEL[conv.optionSelected]}
                        </p>
                      )}
                    </div>
                  </button>
                )
              })}

              {/* Recentes separator */}
              {recentConversations.length > 0 && (
                <>
                  <div
                    className="flex items-center gap-2 px-3 py-2 mt-1"
                    style={{ borderTop: filtered.length > 0 ? '1px solid #2a3942' : undefined }}
                  >
                    <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#3d5060' }}>
                      Histórico recente
                    </span>
                  </div>

                  {recentConversations.map((conv) => {
                    const lastMsg = conv.messages[0]
                    const isSelected = conv.id === selectedId
                    const displayName = conv.customerName || conv.customerPhone

                    return (
                      <button
                        key={conv.id}
                        onClick={() => setSelectedId(conv.id)}
                        className={clsx(
                          'w-full text-left px-3 py-3 flex items-start gap-3 transition-colors border-b border-l-4 border-l-transparent',
                          isSelected ? 'bg-gray-800' : 'hover:bg-gray-900'
                        )}
                        style={{ borderBottomColor: '#2a3942', opacity: 0.75 }}
                      >
                        <div
                          className="flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center text-white font-semibold text-base"
                          style={{ background: '#3d5060' }}
                        >
                          {displayName.charAt(0).toUpperCase()}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <p className="font-medium text-sm truncate" style={{ color: '#aebac1' }}>
                              {displayName}
                            </p>
                            <span
                              className="text-xs flex-shrink-0 px-1.5 py-0.5 rounded-full"
                              style={{ background: '#2a3942', color: '#667781', fontSize: '10px' }}
                            >
                              Encerrada
                            </span>
                          </div>
                          <p className="text-xs truncate mt-0.5" style={{ color: '#667781' }}>
                            {lastMsg
                              ? (lastMsg.direction === 'out' ? '↪ ' : '') + lastMsg.content
                              : '—'}
                          </p>
                        </div>
                      </button>
                    )
                  })}
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Chat panel ──────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {loadingConv ? (
          <div className="flex items-center justify-center h-full" style={{ background: '#0b141a' }}>
            <p className="text-sm" style={{ color: '#8696a0' }}>Carregando...</p>
          </div>
        ) : activeConv ? (
          <ChatPanel
            key={activeConv.id}
            conversation={activeConv}
            userName={user.name}
            onResolve={handleResolve}
            onNewMessage={(msg) =>
              setActiveConv((prev) =>
                prev ? { ...prev, messages: [...prev.messages, msg] } : prev
              )
            }
          />
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  )
}

'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Session } from 'next-auth'
import clsx from 'clsx'

type Message = {
  id: number
  direction: 'in' | 'out'
  content: string
  sentAt: string
  senderUser: { id: number; name: string } | null
}

type Conversation = {
  id: number
  customerPhone: string
  customerName: string | null
  status: string
  messages: Message[]
}

export function ChatClient({
  conversation: initial,
  session,
}: {
  conversation: Conversation
  session: Session
}) {
  const router = useRouter()
  const [messages, setMessages] = useState(initial.messages)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const user = session.user as any

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    const es = new EventSource('/api/sse')

    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data)
        if (event.type === 'new_message' && event.conversationId === initial.id) {
          setMessages((prev) => [...prev, event.message])
        }
      } catch {}
    }

    return () => es.close()
  }, [initial.id])

  async function handleSend() {
    if (!text.trim() || sending) return
    setSending(true)

    const res = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationId: initial.id,
        message: text.trim(),
      }),
    })

    if (res.ok) {
      setText('')
    }

    setSending(false)
  }

  async function handleResolve() {
    await fetch(`/api/conversations/${initial.id}/resolve`, { method: 'POST' })
    router.push('/atendimento')
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => router.push('/atendimento')}
          className="text-gray-500 hover:text-gray-800 transition"
        >
          ← Voltar
        </button>
        <div className="flex-1">
          <p className="font-semibold text-gray-900">
            {initial.customerName || initial.customerPhone}
          </p>
          <p className="text-xs text-gray-500">{initial.customerPhone}</p>
        </div>
        <button
          onClick={handleResolve}
          className="text-sm bg-brand-600 hover:bg-brand-700 text-white px-3 py-1.5 rounded-lg transition"
        >
          Encerrar
        </button>
      </header>

      {/* Mensagens */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={clsx('flex', msg.direction === 'out' ? 'justify-end' : 'justify-start')}
          >
            <div
              className={clsx(
                'max-w-xs lg:max-w-md px-4 py-2 rounded-2xl text-sm',
                msg.direction === 'out'
                  ? 'bg-brand-600 text-white rounded-br-sm'
                  : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm'
              )}
            >
              {msg.direction === 'out' && msg.senderUser && (
                <p className="text-xs text-brand-100 mb-0.5">{msg.senderUser.name}</p>
              )}
              <p>{msg.content}</p>
              <p className={clsx('text-xs mt-1', msg.direction === 'out' ? 'text-brand-100' : 'text-gray-400')}>
                {new Date(msg.sentAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="bg-white border-t border-gray-200 px-4 py-3">
        <div className="flex items-center gap-2 bg-gray-50 border border-gray-300 rounded-xl px-4 py-2">
          <span className="text-xs text-gray-400 whitespace-nowrap">{user.name}:</span>
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="Digite sua mensagem..."
            className="flex-1 bg-transparent text-sm text-gray-800 focus:outline-none"
          />
          <button
            onClick={handleSend}
            disabled={sending || !text.trim()}
            className="bg-brand-600 hover:bg-brand-700 text-white text-sm px-3 py-1.5 rounded-lg transition disabled:opacity-50"
          >
            {sending ? '...' : 'Enviar'}
          </button>
        </div>
      </div>
    </div>
  )
}

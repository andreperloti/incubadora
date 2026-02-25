'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { signOut } from 'next-auth/react'
import type { Session } from 'next-auth'
import clsx from 'clsx'
import dynamic from 'next/dynamic'

const MetricsSection = dynamic(
  () => import('./MetricsSection').then((m) => m.MetricsSection),
  { ssr: false, loading: () => <div className="mt-8 py-8 text-center text-gray-400 text-sm">Carregando métricas...</div> }
)

const STATUS_LABEL: Record<string, string> = {
  waiting_menu: 'Aguardando menu',
  in_queue: 'Na fila',
  in_progress: 'Em atendimento',
}

const OPTION_LABEL: Record<number, string> = {
  1: '🔧 Orçamento (sabe peças)',
  2: '🔍 Orçamento (diagnóstico)',
  3: '📋 Status serviço',
  4: '📦 Fornecedores',
}

type Conversation = {
  id: number
  customerPhone: string
  customerName: string | null
  status: string
  optionSelected: number | null
  lastCustomerMessageAt: string | null
  assignedUser: { id: number; name: string } | null
  messages: { content: string; direction: string; sentAt: string }[]
  alerts: { alertLevel: string; minutesWaiting: number }[]
}

function minutesAgo(date: string | null): number {
  if (!date) return 0
  return Math.floor((Date.now() - new Date(date).getTime()) / 60000)
}

function getAlertClass(alerts: Conversation['alerts']): string {
  if (alerts.some((a) => a.alertLevel === 'urgent')) return 'border-red-500 bg-red-50'
  if (alerts.some((a) => a.alertLevel === 'warning')) return 'border-yellow-400 bg-yellow-50'
  return 'border-gray-200 bg-white'
}

export function DashboardClient({
  conversations: initial,
  session,
}: {
  conversations: Conversation[]
  session: Session
}) {
  const router = useRouter()
  const [conversations, setConversations] = useState(initial)
  const isOwner = (session.user as any).role === 'OWNER'

  useEffect(() => {
    const es = new EventSource('/api/sse')

    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data)
        if (event.type === 'alert' || event.type === 'new_message') {
          // Recarrega a lista do servidor
          router.refresh()
        }
      } catch {}
    }

    return () => es.close()
  }, [router])

  const userName = session.user?.name || 'Mecânico'

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">💬</span>
          <span className="font-bold text-gray-800">MeuZapDesk</span>
          <span className="text-sm text-gray-500 ml-2">
            — {(session.user as any).businessName}
          </span>
        </div>
        <div className="flex items-center gap-4">
          {isOwner && (
            <Link
              href="/admin/users"
              className="text-sm font-medium text-green-700 bg-green-50 hover:bg-green-100 px-3 py-1.5 rounded-lg transition"
            >
              ⚙️ Admin
            </Link>
          )}
          <span className="text-sm text-gray-600">Olá, {userName}</span>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="text-sm text-gray-500 hover:text-gray-800 transition"
          >
            Sair
          </button>
        </div>
      </header>

      {/* Conteúdo */}
      <main className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-800">
            Fila de atendimento
            <span className="ml-2 bg-gray-200 text-gray-700 text-xs px-2 py-0.5 rounded-full">
              {conversations.length}
            </span>
          </h2>
        </div>

        {conversations.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-2">✅</p>
            <p>Nenhuma conversa em aberto!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {conversations.map((conv) => {
              const mins = minutesAgo(conv.lastCustomerMessageAt)
              const alertClass = getAlertClass(conv.alerts)
              const lastMsg = conv.messages[0]

              return (
                <div
                  key={conv.id}
                  onClick={() => router.push(`/chat/${conv.id}`)}
                  className={clsx(
                    'border rounded-xl p-4 cursor-pointer hover:shadow-md transition',
                    alertClass
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-gray-900">
                        {conv.customerName || conv.customerPhone}
                      </p>
                      <p className="text-xs text-gray-500">{conv.customerPhone}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-gray-500">
                        {mins > 0 ? `${mins}min atrás` : 'Agora'}
                      </span>
                      {conv.alerts.some((a) => a.alertLevel === 'urgent') && (
                        <p className="text-xs text-red-600 font-bold">🚨 URGENTE</p>
                      )}
                      {conv.alerts.some((a) => a.alertLevel === 'warning') && !conv.alerts.some((a) => a.alertLevel === 'urgent') && (
                        <p className="text-xs text-yellow-600 font-medium">⚠️ Alerta</p>
                      )}
                    </div>
                  </div>

                  <div className="mt-2 flex items-center gap-3">
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                      {STATUS_LABEL[conv.status] || conv.status}
                    </span>
                    {conv.optionSelected && (
                      <span className="text-xs text-gray-600">
                        {OPTION_LABEL[conv.optionSelected]}
                      </span>
                    )}
                  </div>

                  {lastMsg && (
                    <p className="mt-2 text-sm text-gray-600 truncate">
                      {lastMsg.direction === 'out' ? '↪ ' : ''}
                      {lastMsg.content}
                    </p>
                  )}

                  {conv.assignedUser && (
                    <p className="mt-1 text-xs text-gray-400">
                      Atribuído a: {conv.assignedUser.name}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Métricas — visíveis apenas para OWNER */}
        {isOwner && <MetricsSection />}
      </main>
    </div>
  )
}

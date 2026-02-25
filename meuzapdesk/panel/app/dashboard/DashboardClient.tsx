'use client'

import Link from 'next/link'
import { signOut } from 'next-auth/react'
import type { Session } from 'next-auth'
import dynamic from 'next/dynamic'

const MetricsSection = dynamic(
  () => import('./MetricsSection').then((m) => m.MetricsSection),
  { ssr: false, loading: () => <div className="mt-8 py-8 text-center text-gray-400 text-sm">Carregando métricas...</div> }
)

export function DashboardClient({ session }: { session: Session }) {
  const user = session.user as any

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">💬</span>
          <span className="font-bold text-gray-800">MeuZapDesk</span>
          <span className="text-sm text-gray-500 ml-2">— {user.businessName}</span>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/atendimento"
            className="text-sm font-medium text-green-700 bg-green-50 hover:bg-green-100 px-3 py-1.5 rounded-lg transition"
          >
            💬 Atendimento
          </Link>
          <Link
            href="/admin/users"
            className="text-sm font-medium text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition"
          >
            ⚙️ Admin
          </Link>
          <span className="text-sm text-gray-600">{user.name}</span>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="text-sm text-gray-500 hover:text-gray-800 transition"
          >
            Sair
          </button>
        </div>
      </header>

      {/* Conteúdo */}
      <main className="max-w-5xl mx-auto px-4 py-6">
        <h1 className="text-xl font-bold text-gray-800 mb-1">Dashboard</h1>
        <p className="text-sm text-gray-500 mb-6">Visão geral de hoje</p>
        <MetricsSection />
      </main>
    </div>
  )
}

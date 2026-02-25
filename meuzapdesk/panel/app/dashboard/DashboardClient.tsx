'use client'

import Link from 'next/link'
import { signOut } from 'next-auth/react'
import type { Session } from 'next-auth'
import dynamic from 'next/dynamic'

const MetricsSection = dynamic(
  () => import('./MetricsSection').then((m) => m.MetricsSection),
  {
    ssr: false,
    loading: () => (
      <div className="mt-8 py-8 text-center text-sm" style={{ color: '#8696a0' }}>
        Carregando métricas...
      </div>
    ),
  }
)

export function DashboardClient({ session }: { session: Session }) {
  const user = session.user as any

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#111b21' }}>
      {/* Top bar — igual ao /atendimento */}
      <header
        className="flex-shrink-0 flex items-center justify-between px-4 py-2"
        style={{ background: '#202c33', borderBottom: '1px solid #2a3942' }}
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">💬</span>
          <span className="font-bold text-sm text-gray-100">MeuZapDesk</span>
          <span className="text-xs ml-1" style={{ color: '#8696a0' }}>— {user.businessName}</span>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/atendimento"
            className="text-xs text-green-400 hover:text-green-300 transition"
          >
            💬 Atendimento
          </Link>
          <Link
            href="/admin/users"
            className="text-xs hover:text-white transition"
            style={{ color: '#8696a0' }}
          >
            ⚙️ Admin
          </Link>
          <span className="text-xs" style={{ color: '#8696a0' }}>{user.name}</span>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="text-xs hover:text-white transition"
            style={{ color: '#8696a0' }}
          >
            Sair
          </button>
        </div>
      </header>

      {/* Conteúdo */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6">
        <h1 className="text-lg font-bold mb-0.5" style={{ color: '#e9edef' }}>Dashboard</h1>
        <p className="text-sm mb-6" style={{ color: '#8696a0' }}>Visão geral de hoje</p>
        <MetricsSection />
      </main>
    </div>
  )
}

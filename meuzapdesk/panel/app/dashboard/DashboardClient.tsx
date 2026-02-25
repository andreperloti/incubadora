'use client'

import type { Session } from 'next-auth'
import dynamic from 'next/dynamic'
import { LeftNavStrip } from '@/components/LeftNavStrip'

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
    <div className="flex h-screen overflow-hidden" style={{ background: '#111b21' }}>
      <LeftNavStrip
        user={{
          name: user.name,
          image: user.image,
          isOwner: user.role === 'OWNER',
          businessName: user.businessName,
        }}
        activePage="dashboard"
      />

      <main className="flex-1 overflow-y-auto px-6 py-6">
        <h1 className="text-lg font-bold mb-0.5" style={{ color: '#e9edef' }}>Dashboard</h1>
        <p className="text-sm mb-6" style={{ color: '#8696a0' }}>
          {user.businessName} — Visão geral de hoje
        </p>
        <MetricsSection />
      </main>
    </div>
  )
}

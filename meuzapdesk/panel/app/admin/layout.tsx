import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { SignOutButton } from '@/components/SignOutButton'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'OWNER') {
    redirect('/atendimento')
  }

  const user = session.user as any

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#111b21' }}>
      {/* Top bar */}
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
            href="/dashboard"
            className="text-xs hover:text-white transition"
            style={{ color: '#8696a0' }}
          >
            📊 Métricas
          </Link>
          <span className="text-xs" style={{ color: '#8696a0' }}>{user.name}</span>
          <SignOutButton />
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside
          className="w-48 flex-shrink-0 py-4"
          style={{ background: '#111b21', borderRight: '1px solid #2a3942' }}
        >
          <p className="px-4 pb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: '#667781' }}>
            Administração
          </p>
          <nav className="space-y-0.5 px-2">
            <Link
              href="/admin/users"
              className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition"
              style={{ color: '#8696a0' }}
            >
              👥 Usuários
            </Link>
            <Link
              href="/admin/whatsapp"
              className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition"
              style={{ color: '#8696a0' }}
            >
              📱 WhatsApp
            </Link>
          </nav>
        </aside>

        {/* Content */}
        <main className="flex-1 p-6 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}

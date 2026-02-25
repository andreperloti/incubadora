import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { LeftNavStrip } from '@/components/LeftNavStrip'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'OWNER') {
    redirect('/atendimento')
  }

  const user = session.user as any

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#111b21' }}>
      {/* Left nav strip */}
      <LeftNavStrip
        user={{
          name: user.name,
          image: user.image,
          isOwner: true,
          businessName: user.businessName,
        }}
        activePage="admin"
      />

      {/* Admin section sidebar */}
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
            className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition hover:bg-gray-800"
            style={{ color: '#8696a0' }}
          >
            👥 Usuários
          </Link>
          <Link
            href="/admin/whatsapp"
            className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition hover:bg-gray-800"
            style={{ color: '#8696a0' }}
          >
            📱 WhatsApp
          </Link>
        </nav>
      </aside>

      {/* Content */}
      <main className="flex-1 p-6 overflow-y-auto">{children}</main>
    </div>
  )
}

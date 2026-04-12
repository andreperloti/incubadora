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

  const navLinks = [
    { href: '/admin/users',     label: 'Usuários',   icon: '👥' },
    { href: '/admin/whatsapp',  label: 'WhatsApp',   icon: '📱' },
    { href: '/admin/menus',     label: 'Menus',      icon: '🤖' },
  ]

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

      {/* Coluna principal: sub-nav + conteúdo */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Sub-nav horizontal — mobile/tablet */}
        <nav
          className="md:hidden flex-shrink-0 flex items-center gap-1 px-3 py-2 overflow-x-auto"
          style={{ background: '#202c33', borderBottom: '1px solid #2a3942' }}
        >
          <p className="text-xs font-semibold uppercase tracking-wider mr-2 whitespace-nowrap" style={{ color: '#667781' }}>
            Admin
          </p>
          {navLinks.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg whitespace-nowrap transition hover:bg-white/10"
              style={{ color: '#aebac1' }}
            >
              {l.icon} {l.label}
            </Link>
          ))}
        </nav>

        {/* Layout desktop: aside vertical + conteúdo */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sub-nav vertical — desktop */}
          <aside
            className="hidden md:block w-48 flex-shrink-0 py-4"
            style={{ background: '#111b21', borderRight: '1px solid #2a3942' }}
          >
            <p className="px-4 pb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: '#667781' }}>
              Administração
            </p>
            <nav className="space-y-0.5 px-2">
              {navLinks.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition hover:bg-gray-800"
                  style={{ color: '#8696a0' }}
                >
                  {l.icon} {l.label}
                </Link>
              ))}
            </nav>
          </aside>

          {/* Conteúdo */}
          <main className="flex-1 p-4 md:p-6 overflow-y-auto min-w-0">{children}</main>
        </div>
      </div>
    </div>
  )
}

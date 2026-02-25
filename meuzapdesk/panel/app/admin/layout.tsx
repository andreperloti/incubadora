import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'OWNER') {
    redirect('/dashboard')
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="text-2xl">💬</span>
            <span className="font-bold text-gray-800">MeuZapDesk</span>
          </Link>
          <span className="text-gray-300">|</span>
          <span className="text-sm font-semibold text-green-700 bg-green-50 px-3 py-1 rounded-full">
            Área Admin
          </span>
        </div>
        <Link
          href="/dashboard"
          className="text-sm text-gray-500 hover:text-gray-800 transition"
        >
          ← Voltar ao painel
        </Link>
      </header>

      <div className="flex flex-1">
        {/* Sidebar */}
        <aside className="w-48 bg-white border-r border-gray-200 py-6 px-4">
          <nav className="space-y-1">
            <Link
              href="/admin/users"
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-100 transition"
            >
              👥 Usuários
            </Link>
          </nav>
        </aside>

        {/* Conteúdo */}
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  )
}

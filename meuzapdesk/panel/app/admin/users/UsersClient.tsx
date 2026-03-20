'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { UserModal } from './UserModal'

type User = {
  id: number
  name: string
  email: string
  role: string
  active: boolean
  createdAt: string
}

export function UsersClient({ users: initial }: { users: User[] }) {
  const router = useRouter()
  const [users, setUsers] = useState(initial)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    const res = await fetch('/api/admin/users')
    if (res.ok) {
      const data = await res.json()
      setUsers(data)
    }
    router.refresh()
  }, [router])

  async function handleToggleActive(user: User) {
    setLoading(true)
    await fetch(`/api/admin/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !user.active }),
    })
    await refresh()
    setLoading(false)
  }

  function openNew() {
    setEditingUser(null)
    setModalOpen(true)
  }

  function openEdit(user: User) {
    setEditingUser(user)
    setModalOpen(true)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-bold" style={{ color: '#e9edef' }}>Usuários</h1>
        <button
          onClick={openNew}
          className="bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
        >
          + Novo usuário
        </button>
      </div>

      <div className="rounded-xl overflow-hidden" style={{ background: '#202c33', border: '1px solid #2a3942' }}>
        <table className="w-full text-sm">
          <thead style={{ borderBottom: '1px solid #2a3942' }}>
            <tr>
              {['Nome', 'E-mail', 'Perfil', 'Status', 'Ações'].map((h) => (
                <th
                  key={h}
                  className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide"
                  style={{ color: '#8696a0' }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr
                key={user.id}
                className="border-b last:border-0 transition"
                style={{ borderColor: '#2a3942' }}
              >
                <td className="px-4 py-3 font-medium" style={{ color: '#e9edef' }}>{user.name}</td>
                <td className="px-4 py-3" style={{ color: '#8696a0' }}>{user.email}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${
                      user.role === 'OWNER'
                        ? 'bg-purple-900 text-purple-300'
                        : 'bg-blue-900 text-blue-300'
                    }`}
                  >
                    {user.role === 'OWNER' ? 'Admin' : 'Operador'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${
                      user.active
                        ? 'bg-green-900 text-green-400'
                        : 'bg-gray-800 text-gray-500'
                    }`}
                  >
                    {user.active ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => openEdit(user)}
                      className="text-xs text-blue-400 hover:text-blue-300 transition"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => handleToggleActive(user)}
                      disabled={loading}
                      className={`text-xs transition disabled:opacity-50 ${
                        user.active
                          ? 'text-red-400 hover:text-red-300'
                          : 'text-green-400 hover:text-green-300'
                      }`}
                    >
                      {user.active ? 'Desativar' : 'Ativar'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm" style={{ color: '#8696a0' }}>
                  Nenhum usuário cadastrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <UserModal
          user={editingUser}
          onClose={() => setModalOpen(false)}
          onSaved={refresh}
        />
      )}
    </div>
  )
}

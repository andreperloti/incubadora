'use client'

import { useEffect, useState } from 'react'
import { Session } from 'next-auth'
import Link from 'next/link'
import { LeftNavStrip } from '@/components/LeftNavStrip'

type User = {
  id: number
  name: string
  email: string
  role: string
  active: boolean
  createdAt: string
}

type Business = {
  id: number
  name: string
  whatsappNumber: string
  wahaSession: string
  createdAt: string
  users: User[]
  _count: { conversations: number }
}

type NewUserForm = { name: string; email: string; password: string; role: string }
const emptyUserForm: NewUserForm = { name: '', email: '', password: '', role: 'MECHANIC' }

export function BusinessDetailClient({ session, businessId }: { session: Session; businessId: number }) {
  const user = session.user as any
  const [business, setBusiness] = useState<Business | null>(null)
  const [loading, setLoading] = useState(true)
  const [showUserForm, setShowUserForm] = useState(false)
  const [userForm, setUserForm] = useState<NewUserForm>(emptyUserForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [editName, setEditName] = useState('')
  const [editMode, setEditMode] = useState(false)

  async function loadBusiness() {
    const res = await fetch(`/api/master/businesses/${businessId}`)
    const data = await res.json()
    setBusiness(data)
    setEditName(data.name)
    setLoading(false)
  }

  useEffect(() => { loadBusiness() }, [])

  async function handleSaveName() {
    await fetch(`/api/master/businesses/${businessId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName }),
    })
    setEditMode(false)
    loadBusiness()
  }

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const res = await fetch(`/api/master/businesses/${businessId}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userForm),
    })
    if (res.ok) {
      setShowUserForm(false)
      setUserForm(emptyUserForm)
      loadBusiness()
    } else {
      const d = await res.json()
      setError(d.error ?? 'Erro ao criar usuário')
    }
    setSaving(false)
  }

  const roleLabel: Record<string, string> = { OWNER: 'Admin', MECHANIC: 'Operador', SUPER_ADMIN: 'Master' }
  const roleColor: Record<string, string> = { OWNER: '#00a884', MECHANIC: '#8696a0', SUPER_ADMIN: '#53bdeb' }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ background: '#0b141a', color: '#8696a0' }}>
        Carregando...
      </div>
    )
  }

  if (!business) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ background: '#0b141a', color: '#ef4444' }}>
        Empresa não encontrada.
      </div>
    )
  }

  return (
    <div className="flex h-screen" style={{ background: '#0b141a', color: '#e9edef' }}>
      <LeftNavStrip
        user={{ name: user.name, image: user.image, isOwner: false, isSuperAdmin: true, businessName: 'Master Admin' }}
        activePage="master"
      />

      <div className="flex-1 overflow-auto p-8">
        <div className="max-w-3xl mx-auto">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 mb-6 text-sm" style={{ color: '#8696a0' }}>
            <Link href="/master" style={{ color: '#00a884' }}>Master Admin</Link>
            <span>/</span>
            <span>{business.name}</span>
          </div>

          {/* Header empresa */}
          <div className="rounded-xl p-6 mb-6" style={{ background: '#202c33', border: '1px solid #2a3942' }}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                {editMode ? (
                  <div className="flex items-center gap-2">
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="rounded-lg px-3 py-1.5 text-base font-semibold outline-none"
                      style={{ background: '#2a3942', color: '#e9edef', border: '1px solid #3a4a54' }}
                    />
                    <button
                      onClick={handleSaveName}
                      className="px-3 py-1.5 rounded-lg text-sm"
                      style={{ background: '#00a884', color: '#fff' }}
                    >
                      Salvar
                    </button>
                    <button
                      onClick={() => { setEditMode(false); setEditName(business.name) }}
                      className="px-3 py-1.5 rounded-lg text-sm"
                      style={{ background: '#2a3942', color: '#aebac1' }}
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <h1 className="text-xl font-bold" style={{ color: '#e9edef' }}>{business.name}</h1>
                    <button
                      onClick={() => setEditMode(true)}
                      className="text-xs px-2 py-0.5 rounded"
                      style={{ color: '#8696a0', background: '#2a3942' }}
                    >
                      Editar
                    </button>
                  </div>
                )}
                <div className="flex gap-4 mt-2 text-xs" style={{ color: '#667781' }}>
                  <span>Sessão WAHA: <strong style={{ color: '#aebac1' }}>{business.wahaSession}</strong></span>
                  {business.whatsappNumber && <span>{business.whatsappNumber}</span>}
                  <span>{business._count.conversations} conversas no total</span>
                  <span>desde {new Date(business.createdAt).toLocaleDateString('pt-BR')}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Usuários */}
          <div className="rounded-xl p-6" style={{ background: '#202c33', border: '1px solid #2a3942' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold" style={{ color: '#e9edef' }}>
                Usuários ({business.users.length})
              </h2>
              <button
                onClick={() => setShowUserForm(true)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{ background: '#00a884', color: '#fff' }}
              >
                + Adicionar
              </button>
            </div>

            {business.users.length === 0 ? (
              <p className="text-sm" style={{ color: '#8696a0' }}>Nenhum usuário.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {business.users.map((u) => (
                  <div
                    key={u.id}
                    className="flex items-center justify-between rounded-lg px-4 py-3"
                    style={{ background: '#2a3942' }}
                  >
                    <div>
                      <span className="text-sm font-medium" style={{ color: '#e9edef' }}>{u.name}</span>
                      <span className="text-xs ml-2" style={{ color: '#667781' }}>{u.email}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {!u.active && (
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#3a2a2a', color: '#ef4444' }}>
                          inativo
                        </span>
                      )}
                      <span
                        className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{ background: 'rgba(0,0,0,0.3)', color: roleColor[u.role] ?? '#8696a0' }}
                      >
                        {roleLabel[u.role] ?? u.role}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal adicionar usuário */}
      {showUserForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={() => setShowUserForm(false)}
        >
          <div
            className="rounded-xl p-6 w-full max-w-sm flex flex-col gap-4"
            style={{ background: '#202c33', border: '1px solid #2a3942' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-semibold" style={{ color: '#e9edef' }}>Adicionar usuário</h2>
            <form onSubmit={handleAddUser} className="flex flex-col gap-3">
              {[
                { label: 'Nome *', key: 'name', type: 'text' },
                { label: 'E-mail *', key: 'email', type: 'email' },
                { label: 'Senha *', key: 'password', type: 'text' },
              ].map(({ label, key, type }) => (
                <div key={key} className="flex flex-col gap-1">
                  <label className="text-xs" style={{ color: '#8696a0' }}>{label}</label>
                  <input
                    required
                    type={type}
                    value={(userForm as any)[key]}
                    onChange={(e) => setUserForm({ ...userForm, [key]: e.target.value })}
                    className="rounded-lg px-3 py-2 text-sm outline-none"
                    style={{ background: '#2a3942', color: '#e9edef', border: '1px solid #3a4a54' }}
                  />
                </div>
              ))}
              <div className="flex flex-col gap-1">
                <label className="text-xs" style={{ color: '#8696a0' }}>Papel</label>
                <select
                  value={userForm.role}
                  onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
                  className="rounded-lg px-3 py-2 text-sm outline-none"
                  style={{ background: '#2a3942', color: '#e9edef', border: '1px solid #3a4a54' }}
                >
                  <option value="MECHANIC">Operador</option>
                  <option value="OWNER">Admin</option>
                </select>
              </div>
              {error && <p className="text-xs" style={{ color: '#ef4444' }}>{error}</p>}
              <div className="flex gap-2 justify-end mt-1">
                <button
                  type="button"
                  onClick={() => setShowUserForm(false)}
                  className="px-4 py-2 rounded-lg text-sm"
                  style={{ background: '#2a3942', color: '#aebac1' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-lg text-sm font-medium"
                  style={{ background: '#00a884', color: '#fff', opacity: saving ? 0.7 : 1 }}
                >
                  {saving ? 'Salvando...' : 'Adicionar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

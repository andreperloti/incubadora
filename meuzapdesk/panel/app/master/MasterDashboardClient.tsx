'use client'

import { useEffect, useState } from 'react'
import { Session } from 'next-auth'
import Link from 'next/link'
import { LeftNavStrip } from '@/components/LeftNavStrip'

type Business = {
  id: number
  name: string
  whatsappNumber: string
  wahaSession: string
  createdAt: string
  _count: { users: number; conversations: number }
}

type NewBusinessForm = {
  businessName: string
  whatsappNumber: string
  wahaSession: string
  ownerName: string
  ownerEmail: string
  ownerPassword: string
}

const emptyForm: NewBusinessForm = {
  businessName: '',
  whatsappNumber: '',
  wahaSession: '',
  ownerName: '',
  ownerEmail: '',
  ownerPassword: '',
}

export function MasterDashboardClient({ session }: { session: Session }) {
  const user = session.user as any
  const [businesses, setBusinesses] = useState<Business[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<NewBusinessForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [deleting, setDeleting] = useState(false)

  async function loadBusinesses() {
    const res = await fetch('/api/master/businesses')
    const data = await res.json()
    setBusinesses(data)
    setLoading(false)
  }

  useEffect(() => { loadBusinesses() }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const res = await fetch('/api/master/businesses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (res.ok) {
      setShowForm(false)
      setForm(emptyForm)
      loadBusinesses()
    } else {
      const d = await res.json()
      setError(d.error ?? 'Erro ao criar empresa')
    }
    setSaving(false)
  }

  async function handleDelete(id: number) {
    setDeleting(true)
    setDeleteError('')
    const res = await fetch(`/api/master/businesses/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: deletePassword }),
    })
    if (res.ok) {
      setDeleteConfirm(null)
      setDeletePassword('')
      loadBusinesses()
    } else {
      const d = await res.json()
      setDeleteError(d.error ?? 'Erro ao excluir')
    }
    setDeleting(false)
  }

  return (
    <div className="flex h-screen" style={{ background: '#0b141a', color: '#e9edef' }}>
      <LeftNavStrip
        user={{ name: user.name, image: user.image, isOwner: false, isSuperAdmin: true, businessName: 'Master Admin' }}
        activePage="master"
      />

      <div className="flex-1 overflow-auto p-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold" style={{ color: '#e9edef' }}>Master Admin</h1>
              <p className="text-sm mt-1" style={{ color: '#8696a0' }}>Gerencie todas as empresas do sistema</p>
            </div>
            <button
              onClick={() => setShowForm(true)}
              className="px-4 py-2 rounded-lg text-sm font-medium"
              style={{ background: '#00a884', color: '#fff' }}
            >
              + Nova empresa
            </button>
          </div>

          {/* Lista de empresas */}
          {loading ? (
            <p style={{ color: '#8696a0' }}>Carregando...</p>
          ) : businesses.length === 0 ? (
            <div className="rounded-xl p-8 text-center" style={{ background: '#202c33', border: '1px solid #2a3942' }}>
              <p style={{ color: '#8696a0' }}>Nenhuma empresa cadastrada ainda.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {businesses.map((b) => (
                <div
                  key={b.id}
                  className="rounded-xl p-5 flex items-center justify-between"
                  style={{ background: '#202c33', border: '1px solid #2a3942' }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-base" style={{ color: '#e9edef' }}>{b.name}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#2a3942', color: '#8696a0' }}>
                        {b.wahaSession}
                      </span>
                    </div>
                    <div className="flex gap-4 mt-1.5 text-xs" style={{ color: '#667781' }}>
                      {b.whatsappNumber && <span>{b.whatsappNumber}</span>}
                      <span>{b._count.users} usuário{b._count.users !== 1 ? 's' : ''}</span>
                      <span>{b._count.conversations} conversa{b._count.conversations !== 1 ? 's' : ''} ativas</span>
                      <span>desde {new Date(b.createdAt).toLocaleDateString('pt-BR')}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <Link
                      href={`/master/businesses/${b.id}`}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium"
                      style={{ background: '#2a3942', color: '#aebac1' }}
                    >
                      Detalhes
                    </Link>
                    <button
                      onClick={() => { setDeleteConfirm(b.id); setDeletePassword(''); setDeleteError('') }}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium"
                      style={{ background: '#3a2a2a', color: '#ef4444' }}
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal nova empresa */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={() => setShowForm(false)}
        >
          <div
            className="rounded-xl p-6 w-full max-w-md flex flex-col gap-4"
            style={{ background: '#202c33', border: '1px solid #2a3942' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-semibold" style={{ color: '#e9edef' }}>Nova empresa</h2>
            <form onSubmit={handleCreate} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs" style={{ color: '#8696a0' }}>Nome da empresa *</label>
                <input
                  required
                  value={form.businessName}
                  onChange={(e) => setForm({ ...form, businessName: e.target.value })}
                  className="rounded-lg px-3 py-2 text-sm outline-none"
                  style={{ background: '#2a3942', color: '#e9edef', border: '1px solid #3a4a54' }}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs" style={{ color: '#8696a0' }}>Número WhatsApp</label>
                <input
                  value={form.whatsappNumber}
                  onChange={(e) => setForm({ ...form, whatsappNumber: e.target.value })}
                  placeholder="+55 11 99999-9999"
                  className="rounded-lg px-3 py-2 text-sm outline-none"
                  style={{ background: '#2a3942', color: '#e9edef', border: '1px solid #3a4a54' }}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs" style={{ color: '#8696a0' }}>Sessão WAHA (slug)</label>
                <input
                  value={form.wahaSession}
                  onChange={(e) => setForm({ ...form, wahaSession: e.target.value })}
                  placeholder="gerado automaticamente se vazio"
                  className="rounded-lg px-3 py-2 text-sm outline-none"
                  style={{ background: '#2a3942', color: '#e9edef', border: '1px solid #3a4a54' }}
                />
              </div>
              <hr style={{ borderColor: '#2a3942' }} />
              <p className="text-xs font-medium" style={{ color: '#8696a0' }}>Usuário Admin inicial</p>
              <div className="flex flex-col gap-1">
                <label className="text-xs" style={{ color: '#8696a0' }}>Nome *</label>
                <input
                  required
                  value={form.ownerName}
                  onChange={(e) => setForm({ ...form, ownerName: e.target.value })}
                  className="rounded-lg px-3 py-2 text-sm outline-none"
                  style={{ background: '#2a3942', color: '#e9edef', border: '1px solid #3a4a54' }}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs" style={{ color: '#8696a0' }}>E-mail *</label>
                <input
                  required
                  type="email"
                  value={form.ownerEmail}
                  onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })}
                  className="rounded-lg px-3 py-2 text-sm outline-none"
                  style={{ background: '#2a3942', color: '#e9edef', border: '1px solid #3a4a54' }}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs" style={{ color: '#8696a0' }}>Senha inicial *</label>
                <input
                  required
                  type="text"
                  value={form.ownerPassword}
                  onChange={(e) => setForm({ ...form, ownerPassword: e.target.value })}
                  className="rounded-lg px-3 py-2 text-sm outline-none"
                  style={{ background: '#2a3942', color: '#e9edef', border: '1px solid #3a4a54' }}
                />
              </div>
              {error && <p className="text-xs" style={{ color: '#ef4444' }}>{error}</p>}
              <div className="flex gap-2 justify-end mt-1">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
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
                  {saving ? 'Criando...' : 'Criar empresa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal confirmação exclusão */}
      {deleteConfirm !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={() => { setDeleteConfirm(null); setDeletePassword(''); setDeleteError('') }}
        >
          <div
            className="rounded-xl p-6 w-96 flex flex-col gap-4"
            style={{ background: '#202c33', border: '1px solid #2a3942' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h3 className="text-base font-semibold mb-1" style={{ color: '#ef4444' }}>Excluir empresa</h3>
              <p className="text-sm" style={{ color: '#aebac1' }}>
                Esta ação é <strong>irreversível</strong>. Todos os usuários, conversas e mensagens serão apagados permanentemente.
              </p>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs" style={{ color: '#8696a0' }}>Confirme sua senha para continuar</label>
              <input
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                placeholder="Sua senha"
                autoFocus
                className="rounded-lg px-3 py-2 text-sm outline-none"
                style={{ background: '#2a3942', color: '#e9edef', border: '1px solid #3a4a54' }}
                onKeyDown={(e) => e.key === 'Enter' && deletePassword && handleDelete(deleteConfirm)}
              />
            </div>
            {deleteError && <p className="text-xs" style={{ color: '#ef4444' }}>{deleteError}</p>}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setDeleteConfirm(null); setDeletePassword(''); setDeleteError('') }}
                className="px-4 py-2 rounded-lg text-sm"
                style={{ background: '#2a3942', color: '#aebac1' }}
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                disabled={!deletePassword || deleting}
                className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{ background: '#ef4444', color: '#fff', opacity: !deletePassword || deleting ? 0.5 : 1 }}
              >
                {deleting ? 'Excluindo...' : 'Excluir empresa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

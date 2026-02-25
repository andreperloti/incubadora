'use client'

import { useState } from 'react'

type User = {
  id: number
  name: string
  email: string
  role: string
  active: boolean
}

type Props = {
  user?: User | null
  onClose: () => void
  onSaved: () => void
}

export function UserModal({ user, onClose, onSaved }: Props) {
  const isEdit = !!user
  const [name, setName] = useState(user?.name ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState(user?.role ?? 'MECHANIC')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const url = isEdit ? `/api/admin/users/${user!.id}` : '/api/admin/users'
      const method = isEdit ? 'PATCH' : 'POST'
      const body: any = { name, email, role }
      if (!isEdit) body.password = password

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Erro ao salvar')
        return
      }

      onSaved()
      onClose()
    } catch {
      setError('Erro de conexão')
    } finally {
      setLoading(false)
    }
  }

  const inputClass = "w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
  const inputStyle = { background: '#2a3942', border: '1px solid #3d5060', color: '#e9edef' }
  const labelStyle = { color: '#8696a0' }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div
        className="w-full max-w-md mx-4 p-6 rounded-2xl shadow-2xl"
        style={{ background: '#202c33', border: '1px solid #2a3942' }}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-bold" style={{ color: '#e9edef' }}>
            {isEdit ? 'Editar usuário' : 'Novo usuário'}
          </h3>
          <button
            onClick={onClose}
            className="text-xl leading-none hover:text-white transition"
            style={{ color: '#8696a0' }}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1" style={labelStyle}>Nome</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className={inputClass}
              style={inputStyle}
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1" style={labelStyle}>E-mail</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className={inputClass}
              style={inputStyle}
            />
          </div>

          {!isEdit && (
            <div>
              <label className="block text-xs font-medium mb-1" style={labelStyle}>Senha</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className={inputClass}
                style={inputStyle}
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium mb-1" style={labelStyle}>Perfil</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className={inputClass}
              style={inputStyle}
            >
              <option value="MECHANIC">Atendente</option>
              <option value="OWNER">Admin (Owner)</option>
            </select>
          </div>

          {error && (
            <p className="text-xs bg-red-900 text-red-300 px-3 py-2 rounded-lg">{error}</p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg py-2 text-sm transition"
              style={{ border: '1px solid #2a3942', color: '#8696a0' }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white rounded-lg py-2 text-sm font-semibold transition disabled:opacity-60"
            >
              {loading ? 'Salvando...' : isEdit ? 'Salvar' : 'Criar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

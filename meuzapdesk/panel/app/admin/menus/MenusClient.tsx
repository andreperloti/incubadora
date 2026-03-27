'use client'

import { useState } from 'react'

type BotMenuOption = {
  id: number
  menuId: number
  order: number
  label: string
  nextMenuId: number | null
  finalMessage: string | null
  sectorName: string | null
}

type BotMenu = {
  id: number
  name: string
  message: string
  isRoot: boolean
  options: BotMenuOption[]
}

type Props = {
  initialMenus: BotMenu[]
}

export function MenusClient({ initialMenus }: Props) {
  const [menus, setMenus] = useState<BotMenu[]>(initialMenus)

  // Modal state
  const [showMenuModal, setShowMenuModal] = useState(false)
  const [editingMenu, setEditingMenu] = useState<BotMenu | null>(null)
  const [menuForm, setMenuForm] = useState({ name: '', message: '', isRoot: false })

  const [showOptionModal, setShowOptionModal] = useState(false)
  const [editingOption, setEditingOption] = useState<BotMenuOption | null>(null)
  const [optionMenuId, setOptionMenuId] = useState<number | null>(null)
  const [optionForm, setOptionForm] = useState({
    label: '',
    type: 'final' as 'submenu' | 'final',
    nextMenuId: '',
    finalMessage: '',
    sectorName: '',
  })

  async function reloadMenus() {
    const res = await fetch('/api/admin/menus')
    if (res.ok) setMenus(await res.json())
  }

  // ── Menu CRUD ──────────────────────────────────────────────────────────────

  function openCreateMenu() {
    setEditingMenu(null)
    setMenuForm({ name: '', message: '', isRoot: false })
    setShowMenuModal(true)
  }

  function openEditMenu(menu: BotMenu) {
    setEditingMenu(menu)
    setMenuForm({ name: menu.name, message: menu.message, isRoot: menu.isRoot })
    setShowMenuModal(true)
  }

  async function saveMenu() {
    if (!menuForm.name.trim() || !menuForm.message.trim()) return

    if (editingMenu) {
      await fetch(`/api/admin/menus/${editingMenu.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(menuForm),
      })
    } else {
      await fetch('/api/admin/menus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(menuForm),
      })
    }

    setShowMenuModal(false)
    await reloadMenus()
  }

  async function deleteMenu(id: number) {
    if (!confirm('Remover este menu? As conversas atuais neste menu voltarão ao menu raiz.')) return
    await fetch(`/api/admin/menus/${id}`, { method: 'DELETE' })
    await reloadMenus()
  }

  // ── Option CRUD ────────────────────────────────────────────────────────────

  function openCreateOption(menuId: number) {
    setEditingOption(null)
    setOptionMenuId(menuId)
    setOptionForm({ label: '', type: 'final', nextMenuId: '', finalMessage: '', sectorName: '' })
    setShowOptionModal(true)
  }

  function openEditOption(option: BotMenuOption) {
    setEditingOption(option)
    setOptionMenuId(option.menuId)
    setOptionForm({
      label: option.label,
      type: option.nextMenuId ? 'submenu' : 'final',
      nextMenuId: option.nextMenuId ? String(option.nextMenuId) : '',
      finalMessage: option.finalMessage ?? '',
      sectorName: option.sectorName ?? '',
    })
    setShowOptionModal(true)
  }

  async function saveOption() {
    if (!optionForm.label.trim()) return

    const payload: any = {
      label: optionForm.label,
      nextMenuId: optionForm.type === 'submenu' && optionForm.nextMenuId ? parseInt(optionForm.nextMenuId) : null,
      finalMessage: optionForm.type === 'final' ? optionForm.finalMessage : null,
      sectorName: optionForm.type === 'final' ? optionForm.sectorName : null,
    }

    if (editingOption) {
      await fetch(`/api/admin/menus/options/${editingOption.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    } else {
      await fetch(`/api/admin/menus/${optionMenuId}/options`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    }

    setShowOptionModal(false)
    await reloadMenus()
  }

  async function deleteOption(optionId: number) {
    if (!confirm('Remover esta opção?')) return
    await fetch(`/api/admin/menus/options/${optionId}`, { method: 'DELETE' })
    await reloadMenus()
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  function menuName(id: number | null) {
    if (!id) return '—'
    return menus.find((m) => m.id === id)?.name ?? String(id)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto" style={{ color: '#e9edef' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Menus de Atendimento</h1>
          <p className="text-sm mt-1" style={{ color: '#8696a0' }}>
            Configure a árvore de respostas automáticas do bot
          </p>
        </div>
        <button
          onClick={openCreateMenu}
          className="px-4 py-2 rounded-lg text-sm font-medium transition"
          style={{ background: '#00a884', color: '#111b21' }}
        >
          + Criar menu
        </button>
      </div>

      {menus.length === 0 && (
        <div
          className="text-center py-16 rounded-xl text-sm"
          style={{ background: '#1f2c33', color: '#8696a0' }}
        >
          Nenhum menu criado. Clique em "Criar menu" para começar.
        </div>
      )}

      {/* Menu list */}
      <div className="space-y-4">
        {menus.map((menu) => (
          <div
            key={menu.id}
            className="rounded-xl overflow-hidden"
            style={{ background: '#1f2c33', border: '1px solid #2a3942' }}
          >
            {/* Menu header */}
            <div className="flex items-start justify-between px-5 py-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{menu.name}</span>
                  {menu.isRoot && (
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ background: '#005c4b', color: '#00a884' }}
                    >
                      RAIZ
                    </span>
                  )}
                </div>
                <p
                  className="mt-1 text-sm whitespace-pre-wrap"
                  style={{ color: '#8696a0' }}
                >
                  {menu.message}
                </p>
              </div>
              <div className="flex gap-2 ml-4 flex-shrink-0">
                <button
                  onClick={() => openEditMenu(menu)}
                  className="text-xs px-3 py-1.5 rounded-lg transition"
                  style={{ background: '#2a3942', color: '#8696a0' }}
                >
                  Editar
                </button>
                <button
                  onClick={() => deleteMenu(menu.id)}
                  className="text-xs px-3 py-1.5 rounded-lg transition"
                  style={{ background: '#2a3942', color: '#e74c3c' }}
                >
                  Remover
                </button>
              </div>
            </div>

            {/* Options */}
            <div style={{ borderTop: '1px solid #2a3942' }}>
              {menu.options.length === 0 ? (
                <p className="px-5 py-3 text-xs" style={{ color: '#667781' }}>
                  Sem opções ainda.
                </p>
              ) : (
                <div className="divide-y" style={{ borderColor: '#2a3942' }}>
                  {menu.options.map((opt) => (
                    <div key={opt.id} className="flex items-center justify-between px-5 py-3 gap-3">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <span
                          className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold"
                          style={{ background: '#2a3942', color: '#00a884' }}
                        >
                          {opt.order}
                        </span>
                        <div className="min-w-0">
                          <span className="text-sm">{opt.label}</span>
                          {opt.nextMenuId ? (
                            <span className="ml-2 text-xs" style={{ color: '#53bdeb' }}>
                              → {menuName(opt.nextMenuId)}
                            </span>
                          ) : opt.finalMessage ? (
                            <span className="ml-2 text-xs" style={{ color: '#667781' }}>
                              → mensagem final{opt.sectorName ? ` · ${opt.sectorName}` : ''}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <button
                          onClick={() => openEditOption(opt)}
                          className="text-xs px-2 py-1 rounded transition"
                          style={{ background: '#2a3942', color: '#8696a0' }}
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => deleteOption(opt.id)}
                          className="text-xs px-2 py-1 rounded transition"
                          style={{ background: '#2a3942', color: '#e74c3c' }}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ borderTop: menu.options.length > 0 ? '1px solid #2a3942' : undefined }}>
                <button
                  onClick={() => openCreateOption(menu.id)}
                  className="w-full text-left px-5 py-3 text-xs transition"
                  style={{ color: '#00a884' }}
                >
                  + Adicionar opção
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Modal: Menu ── */}
      {showMenuModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div
            className="w-full max-w-md rounded-2xl p-6 space-y-4"
            style={{ background: '#1f2c33', border: '1px solid #2a3942', color: '#e9edef' }}
          >
            <h2 className="font-semibold text-base">
              {editingMenu ? 'Editar menu' : 'Criar menu'}
            </h2>

            <div className="space-y-3">
              <div>
                <label className="block text-xs mb-1" style={{ color: '#8696a0' }}>Nome interno</label>
                <input
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ background: '#2a3942', color: '#e9edef', border: '1px solid #3b4a54' }}
                  placeholder="Ex: Menu principal"
                  value={menuForm.name}
                  onChange={(e) => setMenuForm({ ...menuForm, name: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs mb-1" style={{ color: '#8696a0' }}>Mensagem enviada ao cliente</label>
                <textarea
                  rows={5}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
                  style={{ background: '#2a3942', color: '#e9edef', border: '1px solid #3b4a54' }}
                  placeholder={"Olá! Como posso ajudar?\n\n1️⃣ Opção um\n2️⃣ Opção dois"}
                  value={menuForm.message}
                  onChange={(e) => setMenuForm({ ...menuForm, message: e.target.value })}
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={menuForm.isRoot}
                  onChange={(e) => setMenuForm({ ...menuForm, isRoot: e.target.checked })}
                  className="rounded"
                />
                <span className="text-sm">Menu raiz (enviado quando a conversa começa)</span>
              </label>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowMenuModal(false)}
                className="px-4 py-2 text-sm rounded-lg"
                style={{ background: '#2a3942', color: '#8696a0' }}
              >
                Cancelar
              </button>
              <button
                onClick={saveMenu}
                className="px-4 py-2 text-sm rounded-lg font-medium"
                style={{ background: '#00a884', color: '#111b21' }}
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Option ── */}
      {showOptionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div
            className="w-full max-w-md rounded-2xl p-6 space-y-4"
            style={{ background: '#1f2c33', border: '1px solid #2a3942', color: '#e9edef' }}
          >
            <h2 className="font-semibold text-base">
              {editingOption ? 'Editar opção' : 'Adicionar opção'}
            </h2>

            <div className="space-y-3">
              <div>
                <label className="block text-xs mb-1" style={{ color: '#8696a0' }}>Texto da opção</label>
                <input
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ background: '#2a3942', color: '#e9edef', border: '1px solid #3b4a54' }}
                  placeholder="Ex: Orçamento de peças"
                  value={optionForm.label}
                  onChange={(e) => setOptionForm({ ...optionForm, label: e.target.value })}
                />
              </div>

              {/* Type selector */}
              <div>
                <label className="block text-xs mb-2" style={{ color: '#8696a0' }}>O que acontece ao escolher esta opção?</label>
                <div className="flex gap-3">
                  <label className="flex items-center gap-2 cursor-pointer text-sm">
                    <input
                      type="radio"
                      name="optionType"
                      value="submenu"
                      checked={optionForm.type === 'submenu'}
                      onChange={() => setOptionForm({ ...optionForm, type: 'submenu' })}
                    />
                    Ir para sub-menu
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-sm">
                    <input
                      type="radio"
                      name="optionType"
                      value="final"
                      checked={optionForm.type === 'final'}
                      onChange={() => setOptionForm({ ...optionForm, type: 'final' })}
                    />
                    Mensagem final
                  </label>
                </div>
              </div>

              {optionForm.type === 'submenu' && (
                <div>
                  <label className="block text-xs mb-1" style={{ color: '#8696a0' }}>Sub-menu destino</label>
                  <select
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ background: '#2a3942', color: '#e9edef', border: '1px solid #3b4a54' }}
                    value={optionForm.nextMenuId}
                    onChange={(e) => setOptionForm({ ...optionForm, nextMenuId: e.target.value })}
                  >
                    <option value="">Selecione um menu...</option>
                    {menus
                      .filter((m) => m.id !== optionMenuId)
                      .map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                  </select>
                </div>
              )}

              {optionForm.type === 'final' && (
                <>
                  <div>
                    <label className="block text-xs mb-1" style={{ color: '#8696a0' }}>Mensagem de encaminhamento</label>
                    <textarea
                      rows={3}
                      className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
                      style={{ background: '#2a3942', color: '#e9edef', border: '1px solid #3b4a54' }}
                      placeholder="Ex: Ótimo! Um atendente já vai te ajudar em breve."
                      value={optionForm.finalMessage}
                      onChange={(e) => setOptionForm({ ...optionForm, finalMessage: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs mb-1" style={{ color: '#8696a0' }}>Setor (opcional)</label>
                    <input
                      className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                      style={{ background: '#2a3942', color: '#e9edef', border: '1px solid #3b4a54' }}
                      placeholder="Ex: Suporte, Vendas..."
                      value={optionForm.sectorName}
                      onChange={(e) => setOptionForm({ ...optionForm, sectorName: e.target.value })}
                    />
                  </div>
                </>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowOptionModal(false)}
                className="px-4 py-2 text-sm rounded-lg"
                style={{ background: '#2a3942', color: '#8696a0' }}
              >
                Cancelar
              </button>
              <button
                onClick={saveOption}
                className="px-4 py-2 text-sm rounded-lg font-medium"
                style={{ background: '#00a884', color: '#111b21' }}
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

'use client'

import { useState, useCallback } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// ── Types ─────────────────────────────────────────────────────────────────────

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

// ── Sortable Option Row ────────────────────────────────────────────────────────

function SortableOptionRow({
  opt,
  onEdit,
  onDelete,
}: {
  opt: BotMenuOption
  onEdit: (opt: BotMenuOption) => void
  onDelete: (id: number) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: opt.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 px-4 py-3"
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="flex-shrink-0 cursor-grab active:cursor-grabbing touch-none text-lg leading-none"
        style={{ color: '#3b4a54' }}
        title="Arrastar para reordenar"
      >
        ⠿
      </button>

      {/* Order badge */}
      <span
        className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-full text-xs font-bold"
        style={{ background: '#2a3942', color: '#00a884' }}
      >
        {opt.order}
      </span>

      {/* Label + sector */}
      <div className="flex-1 min-w-0">
        <span className="text-sm" style={{ color: '#e9edef' }}>{opt.label}</span>
        {opt.sectorName && (
          <span
            className="ml-2 text-xs px-1.5 py-0.5 rounded-full"
            style={{ background: '#1a3a4a', color: '#53bdeb', fontSize: '10px' }}
          >
            {opt.sectorName}
          </span>
        )}
        {opt.finalMessage && (
          <p className="text-xs mt-0.5 truncate" style={{ color: '#667781' }}>
            {opt.finalMessage}
          </p>
        )}
      </div>

      {/* Actions */}
      <button
        onClick={() => onEdit(opt)}
        className="flex-shrink-0 text-xs px-2.5 py-1.5 rounded-lg transition"
        style={{ background: '#2a3942', color: '#8696a0' }}
      >
        Editar
      </button>
      <button
        onClick={() => onDelete(opt.id)}
        className="flex-shrink-0 text-xs px-2.5 py-1.5 rounded-lg transition"
        style={{ background: '#2a3942', color: '#e74c3c' }}
      >
        ✕
      </button>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function MenusClient({ initialMenus }: { initialMenus: BotMenu[] }) {
  const [menus, setMenus] = useState<BotMenu[]>(initialMenus)

  // Menu modal
  const [showMenuModal, setShowMenuModal] = useState(false)
  const [editingMenu, setEditingMenu] = useState<BotMenu | null>(null)
  const [menuForm, setMenuForm] = useState({ name: '', message: '' })

  // Option modal
  const [showOptionModal, setShowOptionModal] = useState(false)
  const [editingOption, setEditingOption] = useState<BotMenuOption | null>(null)
  const [optionForm, setOptionForm] = useState({
    label: '',
    finalMessage: '',
    sectorName: '',
  })

  const reloadMenus = useCallback(async () => {
    const res = await fetch('/api/admin/menus')
    if (res.ok) setMenus(await res.json())
  }, [])

  const rootMenu = menus.find((m) => m.isRoot) ?? null

  // ── Menu CRUD ──────────────────────────────────────────────────────────────

  function openCreateMenu() {
    setEditingMenu(null)
    setMenuForm({ name: 'Menu principal', message: '' })
    setShowMenuModal(true)
  }

  function openEditMenu(menu: BotMenu) {
    setEditingMenu(menu)
    setMenuForm({ name: menu.name, message: menu.message })
    setShowMenuModal(true)
  }

  async function saveMenu() {
    if (!menuForm.message.trim()) return
    if (editingMenu) {
      await fetch(`/api/admin/menus/${editingMenu.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...menuForm, isRoot: true }),
      })
    } else {
      await fetch('/api/admin/menus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...menuForm, isRoot: true }),
      })
    }
    setShowMenuModal(false)
    await reloadMenus()
  }

  async function deleteMenu(id: number) {
    if (!confirm('Remover o menu de atendimento? O bot não enviará mais mensagens automáticas.')) return
    await fetch(`/api/admin/menus/${id}`, { method: 'DELETE' })
    await reloadMenus()
  }

  // ── Option CRUD ────────────────────────────────────────────────────────────

  function openAddOption() {
    setEditingOption(null)
    setOptionForm({ label: '', finalMessage: '', sectorName: '' })
    setShowOptionModal(true)
  }

  function openEditOption(opt: BotMenuOption) {
    setEditingOption(opt)
    setOptionForm({
      label: opt.label,
      finalMessage: opt.finalMessage ?? '',
      sectorName: opt.sectorName ?? '',
    })
    setShowOptionModal(true)
  }

  async function saveOption() {
    if (!optionForm.label.trim() || !rootMenu) return
    const payload = {
      label: optionForm.label,
      nextMenuId: null,
      finalMessage: optionForm.finalMessage || null,
      sectorName: optionForm.sectorName.trim() || null,
    }
    if (editingOption) {
      await fetch(`/api/admin/menus/options/${editingOption.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    } else {
      await fetch(`/api/admin/menus/${rootMenu.id}/options`, {
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

  // ── Drag-and-drop reorder ──────────────────────────────────────────────────

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  async function handleDragEnd(event: DragEndEvent) {
    if (!rootMenu) return
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = rootMenu.options.findIndex((o) => o.id === active.id)
    const newIndex = rootMenu.options.findIndex((o) => o.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const reordered = arrayMove(rootMenu.options, oldIndex, newIndex).map((o, i) => ({
      ...o,
      order: i + 1,
    }))
    // Optimistic update
    setMenus((prev) =>
      prev.map((m) => (m.id === rootMenu.id ? { ...m, options: reordered } : m))
    )
    await fetch(`/api/admin/menus/${rootMenu.id}/options/reorder`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: reordered.map((o) => o.id) }),
    })
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ color: '#e9edef' }}>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Menu de Atendimento</h1>
          <p className="text-sm mt-1" style={{ color: '#8696a0' }}>
            Configure as respostas automáticas enviadas pelo bot
          </p>
        </div>
        {!rootMenu && (
          <button
            onClick={openCreateMenu}
            className="px-4 py-2 rounded-lg text-sm font-medium transition hover:opacity-90 flex-shrink-0"
            style={{ background: '#00a884', color: '#111b21' }}
          >
            + Criar menu
          </button>
        )}
      </div>

      {/* Empty state */}
      {!rootMenu && (
        <div
          className="text-center py-16 rounded-xl text-sm"
          style={{ background: '#1f2c33', border: '1px solid #2a3942', color: '#8696a0' }}
        >
          <p className="mb-1">Nenhum menu configurado.</p>
          <p>Sem menu, o bot não responde automaticamente — as mensagens chegam direto na fila.</p>
        </div>
      )}

      {/* Root menu card */}
      {rootMenu && (
        <div
          className="rounded-xl overflow-hidden"
          style={{ background: '#1f2c33', border: '1px solid #2a3942' }}
        >
          {/* Header do menu */}
          <div className="flex items-start justify-between px-5 py-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium text-sm" style={{ color: '#e9edef' }}>{rootMenu.name}</span>
                <span
                  className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{ background: '#005c4b', color: '#00a884' }}
                >
                  ATIVO
                </span>
              </div>
              <p className="text-xs" style={{ color: '#8696a0' }}>
                Mensagem enviada ao cliente quando inicia conversa:
              </p>
              <p
                className="mt-1 text-sm whitespace-pre-wrap p-3 rounded-lg"
                style={{ background: '#0b141a', color: '#e9edef', border: '1px solid #2a3942' }}
              >
                {rootMenu.message}
              </p>
            </div>
            <div className="flex gap-2 ml-4 flex-shrink-0">
              <button
                onClick={() => openEditMenu(rootMenu)}
                className="text-xs px-3 py-1.5 rounded-lg transition"
                style={{ background: '#2a3942', color: '#8696a0' }}
              >
                Editar mensagem
              </button>
              <button
                onClick={() => deleteMenu(rootMenu.id)}
                className="text-xs px-3 py-1.5 rounded-lg transition"
                style={{ background: '#2a3942', color: '#e74c3c' }}
              >
                Remover
              </button>
            </div>
          </div>

          {/* Options */}
          <div style={{ borderTop: '1px solid #2a3942' }}>
            <div className="px-5 py-3 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#667781' }}>
                Opções ({rootMenu.options.length})
              </p>
              <button
                onClick={openAddOption}
                className="text-xs px-3 py-1.5 rounded-lg transition hover:opacity-80"
                style={{ background: '#005c4b', color: '#00a884' }}
              >
                + Adicionar opção
              </button>
            </div>

            {rootMenu.options.length === 0 ? (
              <p className="px-5 pb-4 text-xs" style={{ color: '#667781' }}>
                Sem opções. Adicione pelo menos uma para o menu funcionar.
              </p>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext
                  items={rootMenu.options.map((o) => o.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="divide-y pb-2" style={{ borderColor: '#2a3942' }}>
                    {rootMenu.options.map((opt) => (
                      <SortableOptionRow
                        key={opt.id}
                        opt={opt}
                        onEdit={openEditOption}
                        onDelete={deleteOption}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>
        </div>
      )}

      {/* ── Modal: Menu ── */}
      {showMenuModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div
            className="w-full max-w-md rounded-2xl p-6 space-y-4"
            style={{ background: '#1f2c33', border: '1px solid #2a3942', color: '#e9edef' }}
          >
            <h2 className="font-semibold text-base">
              {editingMenu ? 'Editar mensagem do menu' : 'Criar menu de atendimento'}
            </h2>

            <div className="space-y-3">
              <div>
                <label className="block text-xs mb-1" style={{ color: '#8696a0' }}>
                  Mensagem enviada ao cliente ao iniciar a conversa
                </label>
                <textarea
                  rows={6}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
                  style={{ background: '#2a3942', color: '#e9edef', border: '1px solid #3b4a54' }}
                  placeholder={"Olá! Bem-vindo. Como posso ajudar?\n\n1 - Suporte técnico\n2 - Vendas\n3 - Outros"}
                  value={menuForm.message}
                  onChange={(e) => setMenuForm({ ...menuForm, message: e.target.value })}
                  autoFocus
                />
                <p className="mt-1 text-xs" style={{ color: '#667781' }}>
                  Dica: inclua os números das opções no texto para o cliente saber o que digitar.
                </p>
              </div>
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
                disabled={!menuForm.message.trim()}
                className="px-4 py-2 text-sm rounded-lg font-medium disabled:opacity-40"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
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
                  placeholder="Ex: Suporte técnico"
                  value={optionForm.label}
                  onChange={(e) => setOptionForm({ ...optionForm, label: e.target.value })}
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs mb-1" style={{ color: '#8696a0' }}>
                  Mensagem de confirmação <span style={{ color: '#667781' }}>(opcional)</span>
                </label>
                <textarea
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
                  style={{ background: '#2a3942', color: '#e9edef', border: '1px solid #3b4a54' }}
                  placeholder="Ex: Certo! Um atendente de suporte vai te ajudar em breve."
                  value={optionForm.finalMessage}
                  onChange={(e) => setOptionForm({ ...optionForm, finalMessage: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs mb-1" style={{ color: '#8696a0' }}>
                  Setor <span style={{ color: '#667781' }}>(opcional — aparece como badge na fila)</span>
                </label>
                <input
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ background: '#2a3942', color: '#e9edef', border: '1px solid #3b4a54' }}
                  placeholder="Ex: Suporte, Vendas, Financeiro..."
                  value={optionForm.sectorName}
                  onChange={(e) => setOptionForm({ ...optionForm, sectorName: e.target.value })}
                />
              </div>
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
                disabled={!optionForm.label.trim()}
                className="px-4 py-2 text-sm rounded-lg font-medium disabled:opacity-40"
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

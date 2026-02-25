'use client'

import Link from 'next/link'
import { signOut } from 'next-auth/react'
import { useState } from 'react'

export type NavUser = {
  name: string
  image?: string | null
  isOwner: boolean
  businessName: string
}

type Page = 'atendimento' | 'dashboard' | 'admin'

// ─── Icons ────────────────────────────────────────────────────────────────────

function IconChat() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
      <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
    </svg>
  )
}

function IconMetrics() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
      <path d="M9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4zm2.5 2.1h-15V5h15v14.1zm0-16.1h-15C3.12 3 2 4.12 2 5.5v13C2 19.88 3.12 21 4.5 21h15c1.38 0 2.5-1.12 2.5-2.5v-13C22 4.12 20.88 3 19.5 3z" />
    </svg>
  )
}

function IconAdmin() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
      <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
    </svg>
  )
}

function IconLogout() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
      <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z" />
    </svg>
  )
}

// ─── Nav Item ─────────────────────────────────────────────────────────────────

function NavItem({
  href,
  title,
  active,
  children,
}: {
  href: string
  title: string
  active?: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      title={title}
      className="w-10 h-10 rounded-xl flex items-center justify-center transition"
      style={{
        color: active ? '#00a884' : '#aebac1',
        background: active ? 'rgba(0,168,132,0.12)' : 'transparent',
      }}
      onMouseEnter={(e) => {
        if (!active) (e.currentTarget as HTMLElement).style.background = '#2a3942'
      }}
      onMouseLeave={(e) => {
        if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'
      }}
    >
      {children}
    </Link>
  )
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function UserAvatar({ name, image }: { name: string; image?: string | null }) {
  const [imgFailed, setImgFailed] = useState(false)
  const initial = name.charAt(0).toUpperCase()

  if (image && !imgFailed) {
    return (
      <img
        src={image}
        alt={name}
        title={name}
        className="w-10 h-10 rounded-full flex-shrink-0 object-cover"
        onError={() => setImgFailed(true)}
      />
    )
  }

  return (
    <div
      className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
      style={{ background: '#00a884' }}
      title={name}
    >
      {initial}
    </div>
  )
}

// ─── LeftNavStrip ─────────────────────────────────────────────────────────────

export function LeftNavStrip({ user, activePage }: { user: NavUser; activePage?: Page }) {
  return (
    <nav
      className="flex-shrink-0 flex flex-col items-center py-3 gap-1"
      style={{ width: '62px', background: '#202c33', borderRight: '1px solid #2a3942' }}
    >
      {/* User avatar */}
      <UserAvatar name={user.name} image={user.image} />

      {/* Spacer */}
      <div className="flex-1" />

      {/* Nav links */}
      <div className="flex flex-col items-center gap-1 pb-1">
        <NavItem href="/atendimento" title="Atendimento" active={activePage === 'atendimento'}>
          <IconChat />
        </NavItem>
        {user.isOwner && (
          <NavItem href="/dashboard" title="Métricas" active={activePage === 'dashboard'}>
            <IconMetrics />
          </NavItem>
        )}
        {user.isOwner && (
          <NavItem href="/admin/users" title="Admin" active={activePage === 'admin'}>
            <IconAdmin />
          </NavItem>
        )}
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          title="Sair"
          className="w-10 h-10 rounded-xl flex items-center justify-center transition"
          style={{ color: '#8696a0' }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = '#2a3942')}
          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
        >
          <IconLogout />
        </button>
      </div>
    </nav>
  )
}

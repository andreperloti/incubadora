'use client'

import { signOut } from 'next-auth/react'

export function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: '/login' })}
      className="text-xs hover:text-white transition"
      style={{ color: '#8696a0' }}
    >
      Sair
    </button>
  )
}

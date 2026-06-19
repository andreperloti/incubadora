import type { NextAuthOptions, Session } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db'

// Extrai e valida businessId da sessão com segurança.
// Retorna null para SUPER_ADMIN (businessId = null) ou sessão inválida.
export function getSessionBusinessId(session: Session | null): number | null {
  if (!session?.user) return null
  const raw = (session.user as any).businessId
  if (!raw) return null
  const id = parseInt(raw, 10)
  return isNaN(id) ? null : id
}

export function getSessionRole(session: Session | null): string | null {
  if (!session?.user) return null
  return (session.user as any).role ?? null
}

export function getSessionUserId(session: Session | null): number | null {
  if (!session?.user) return null
  const raw = (session.user as any).id
  if (!raw) return null
  const id = parseInt(raw, 10)
  return isNaN(id) ? null : id
}


export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'E-mail', type: 'email' },
        password: { label: 'Senha', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
          include: { business: true },
        })

        if (!user) return null

        const passwordMatch = await bcrypt.compare(credentials.password, user.passwordHash)
        if (!passwordMatch) return null

        return {
          id: String(user.id),
          name: user.name,
          email: user.email,
          role: user.role,
          businessId: user.businessId ? String(user.businessId) : null,
          businessName: user.business?.name ?? 'Master Admin',
          image: null,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = (user as any).role
        token.businessId = (user as any).businessId
        token.businessName = (user as any).businessName
        token.picture = (user as any).image
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id
        ;(session.user as any).role = token.role
        ;(session.user as any).businessId = token.businessId
        ;(session.user as any).businessName = token.businessName
        ;(session.user as any).image = token.picture
      }
      return session
    },
  },
  pages: {
    signIn: '/login',
  },
  events: {
    async signIn({ user }) {
      const rawBusinessId = (user as any).businessId
      if (!rawBusinessId) return
      const businessId = parseInt(rawBusinessId, 10)
      if (isNaN(businessId)) return

      try {
        const business = await prisma.business.findUnique({
          where: { id: businessId },
          select: { wahaSession: true },
        })
        if (!business?.wahaSession) return

        const { getWahaSession } = await import('@/lib/whatsapp')
        const wahaStatus = await getWahaSession(business.wahaSession)
        if (wahaStatus?.status !== 'WORKING') return

        const { importQueue, ensureImportWorker } = await import('@/lib/import-queue')
        ensureImportWorker()
        await importQueue.add(
          'import',
          { businessId, wahaSession: business.wahaSession, chatsLimit: 25, messagesPerChat: 20 },
          { jobId: `login-import-${businessId}` }
        )
      } catch {
        // Silencia erros — falha no reimport não pode impedir o login
      }
    },
  },
  session: {
    strategy: 'jwt',
    maxAge: 14 * 24 * 60 * 60, // 2 semanas
  },
  secret: process.env.NEXTAUTH_SECRET,
}

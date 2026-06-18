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
  session: {
    strategy: 'jwt',
    maxAge: 8 * 60 * 60, // 8 horas
  },
  secret: process.env.NEXTAUTH_SECRET,
}

import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token
    const pathname = req.nextUrl.pathname

    // Rotas /admin/* exigem role OWNER
    if (pathname.startsWith('/admin')) {
      if (!token || token.role !== 'OWNER') {
        return NextResponse.redirect(new URL('/atendimento', req.url))
      }
    }

    // /dashboard exige role OWNER — redireciona MECHANICs para /atendimento
    if (pathname.startsWith('/dashboard')) {
      if (token?.role !== 'OWNER') {
        return NextResponse.redirect(new URL('/atendimento', req.url))
      }
    }

    return NextResponse.next()
  },
  {
    callbacks: {
      authorized({ token }) {
        return !!token
      },
    },
  }
)

export const config = {
  matcher: ['/dashboard/:path*', '/admin/:path*', '/chat/:path*', '/atendimento/:path*'],
}

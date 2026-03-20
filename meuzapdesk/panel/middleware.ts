import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token
    const pathname = req.nextUrl.pathname

    // SUPER_ADMIN só acessa /master — redireciona qualquer outra rota protegida
    if (token?.role === 'SUPER_ADMIN' && !pathname.startsWith('/master')) {
      return NextResponse.redirect(new URL('/master', req.url))
    }

    // /master/* exige SUPER_ADMIN
    if (pathname.startsWith('/master')) {
      if (token?.role !== 'SUPER_ADMIN') {
        return NextResponse.redirect(new URL('/atendimento', req.url))
      }
    }

    // Rotas /admin/* e /dashboard/* exigem role OWNER
    if (pathname.startsWith('/admin') || pathname.startsWith('/dashboard')) {
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
  matcher: ['/dashboard/:path*', '/admin/:path*', '/chat/:path*', '/atendimento/:path*', '/master/:path*'],
}

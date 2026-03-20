import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import bcrypt from 'bcryptjs'

function superAdminOnly(role: string | undefined) {
  return role === 'SUPER_ADMIN'
}

// GET /api/master/businesses — lista todas as empresas
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!superAdminOnly((session?.user as any)?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const businesses = await prisma.business.findMany({
    orderBy: { createdAt: 'asc' },
    include: {
      _count: {
        select: {
          users: true,
          conversations: { where: { status: { in: ['in_queue', 'in_progress', 'waiting_menu'] } } },
        },
      },
    },
  })

  return NextResponse.json(businesses)
}

// POST /api/master/businesses — cria empresa + owner inicial
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!superAdminOnly((session?.user as any)?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { businessName, whatsappNumber, wahaSession, ownerName, ownerEmail, ownerPassword } =
    await req.json()

  if (!businessName || !ownerName || !ownerEmail || !ownerPassword) {
    return NextResponse.json({ error: 'Campos obrigatórios faltando' }, { status: 400 })
  }

  const slug = wahaSession || businessName.toLowerCase().replace(/[^a-z0-9]/g, '_')

  const business = await prisma.business.create({
    data: {
      name: businessName,
      whatsappNumber: whatsappNumber ?? '',
      wahaSession: slug,
      users: {
        create: {
          name: ownerName,
          email: ownerEmail,
          passwordHash: await bcrypt.hash(ownerPassword, 10),
          role: 'OWNER',
        },
      },
    },
    include: { users: { select: { id: true, email: true, role: true } } },
  })

  return NextResponse.json(business, { status: 201 })
}

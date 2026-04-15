import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

const WAHA_API_URL = process.env.WAHA_API_URL || 'http://localhost:3002'
const WAHA_API_KEY = process.env.WAHA_API_KEY || ''

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const user = session.user as any
  const businessId = parseInt(user.businessId)

  const business = await prisma.business.findUnique({ where: { id: businessId } })
  if (!business?.wahaSession) return NextResponse.json([])

  const wahaSession = business.wahaSession

  let chats: any[] = []
  try {
    const res = await fetch(
      `${WAHA_API_URL}/api/${wahaSession}/chats/overview?limit=200&offset=0`,
      { headers: { 'X-Api-Key': WAHA_API_KEY } }
    )
    if (res.ok) chats = await res.json()
  } catch {
    return NextResponse.json([])
  }

  const contacts = chats
    .filter((c: any) => {
      const id: string = c.id ?? ''
      return id.endsWith('@c.us') || id.endsWith('@lid')
    })
    .map((c: any) => {
      const id: string = c.id ?? ''
      const name: string = c.name || c.id || ''
      const phone: string = id.endsWith('@c.us') ? id.replace('@c.us', '') : id
      return { id, name, phone }
    })

  return NextResponse.json(contacts)
}

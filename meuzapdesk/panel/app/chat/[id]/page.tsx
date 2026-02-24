import { getServerSession } from 'next-auth'
import { redirect, notFound } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { ChatClient } from './ChatClient'

export const dynamic = 'force-dynamic'

export default async function ChatPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const conversationId = parseInt(params.id)
  const businessId = parseInt((session.user as any).businessId)

  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, businessId },
    include: {
      messages: {
        orderBy: { sentAt: 'asc' },
        include: {
          senderUser: { select: { id: true, name: true } },
        },
      },
      assignedUser: { select: { id: true, name: true } },
    },
  })

  if (!conversation) notFound()

  return (
    <ChatClient
      conversation={JSON.parse(JSON.stringify(conversation))}
      session={session}
    />
  )
}

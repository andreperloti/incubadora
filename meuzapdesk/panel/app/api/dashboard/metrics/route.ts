import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

const OPTION_LABEL: Record<number, string> = {
  1: 'Orçamento (sabe peças)',
  2: 'Orçamento (diagnóstico)',
  3: 'Status do serviço',
  4: 'Fornecedores',
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'OWNER') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const businessId = parseInt((session.user as any).businessId)

  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)

  // KPIs
  const [abertas, resolvidasHoje, alertasAtivos, mensagensHoje] = await Promise.all([
    prisma.conversation.count({
      where: {
        businessId,
        status: { in: ['in_queue', 'in_progress', 'waiting_menu'] },
      },
    }),
    prisma.conversation.count({
      where: {
        businessId,
        resolvedAt: { gte: hoje },
      },
    }),
    prisma.conversationAlert.count({
      where: {
        conversation: { businessId },
        alertLevel: { in: ['warning', 'urgent'] },
      },
    }),
    prisma.message.findMany({
      where: {
        conversation: { businessId },
        sentAt: { gte: hoje },
        direction: 'in',
      },
      select: { conversationId: true, sentAt: true },
    }),
  ])

  // Tempo médio de resposta (em minutos) — só conversas resolvidas hoje
  const convsResolvidas = await prisma.conversation.findMany({
    where: {
      businessId,
      resolvedAt: { gte: hoje },
      lastCustomerMessageAt: { not: null },
    },
    select: { createdAt: true, resolvedAt: true },
  })

  let tempoMedioResposta = 0
  if (convsResolvidas.length > 0) {
    const total = convsResolvidas.reduce((acc, c) => {
      const diff = (c.resolvedAt!.getTime() - c.createdAt.getTime()) / 60000
      return acc + diff
    }, 0)
    tempoMedioResposta = Math.round((total / convsResolvidas.length) * 10) / 10
  }

  // Ranking de atendentes
  const convsComAtendente = await prisma.conversation.findMany({
    where: {
      businessId,
      resolvedAt: { gte: hoje },
      assignedUserId: { not: null },
    },
    select: {
      assignedUserId: true,
      assignedUser: { select: { name: true } },
      createdAt: true,
      resolvedAt: true,
    },
  })

  const rankingMap = new Map<number, { name: string; atendidas: number; totalMin: number }>()
  for (const c of convsComAtendente) {
    if (!c.assignedUserId || !c.assignedUser) continue
    const entry = rankingMap.get(c.assignedUserId) ?? {
      name: c.assignedUser.name,
      atendidas: 0,
      totalMin: 0,
    }
    entry.atendidas++
    entry.totalMin += (c.resolvedAt!.getTime() - c.createdAt.getTime()) / 60000
    rankingMap.set(c.assignedUserId, entry)
  }

  const ranking = Array.from(rankingMap.values())
    .map((e) => ({
      name: e.name,
      atendidas: e.atendidas,
      tempoMedio: e.atendidas > 0 ? Math.round((e.totalMin / e.atendidas) * 10) / 10 : 0,
    }))
    .sort((a, b) => b.atendidas - a.atendidas)

  // Serviços mais solicitados (optionSelected)
  const convsComOpcao = await prisma.conversation.groupBy({
    by: ['optionSelected'],
    where: {
      businessId,
      createdAt: { gte: hoje },
      optionSelected: { not: null },
    },
    _count: { optionSelected: true },
    orderBy: { _count: { optionSelected: 'desc' } },
  })

  const servicos = convsComOpcao.map((row) => ({
    label: OPTION_LABEL[row.optionSelected!] ?? `Opção ${row.optionSelected}`,
    count: row._count.optionSelected,
  }))

  // Volume por hora (últimas 24h)
  const agora = new Date()
  const h24atras = new Date(agora.getTime() - 24 * 60 * 60 * 1000)

  const convsUlt24h = await prisma.conversation.findMany({
    where: {
      businessId,
      createdAt: { gte: h24atras },
    },
    select: { createdAt: true },
  })

  // Agrupa por hora
  const volumeMap = new Map<string, number>()
  for (const c of convsUlt24h) {
    const h = c.createdAt.getHours()
    const label = `${String(h).padStart(2, '0')}:00`
    volumeMap.set(label, (volumeMap.get(label) ?? 0) + 1)
  }

  // Gera todas as 24 horas (para o gráfico não ter buracos)
  const volumePorHora = Array.from({ length: 24 }, (_, i) => {
    const label = `${String(i).padStart(2, '0')}:00`
    return { hora: label, conversas: volumeMap.get(label) ?? 0 }
  })

  return NextResponse.json({
    kpis: { abertas, resolvidasHoje, tempoMedioResposta, alertasAtivos },
    ranking,
    servicos,
    volumePorHora,
  })
}

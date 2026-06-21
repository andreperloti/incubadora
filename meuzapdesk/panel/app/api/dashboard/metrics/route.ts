import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions, getSessionBusinessId } from '@/lib/auth'
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

  const businessId = getSessionBusinessId(session)
  if (!businessId) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const agora = new Date()

  // KPIs: status separados para diferenciar quem espera de quem está sendo atendido
  const [emFila, emAtendimento, resolvidasHoje, alertasAtivos] = await Promise.all([
    prisma.conversation.count({
      where: { businessId, status: { in: ['in_queue', 'waiting_menu'] } },
    }),
    prisma.conversation.count({
      where: { businessId, status: 'in_progress' },
    }),
    prisma.conversation.count({
      where: { businessId, resolvedAt: { gte: hoje } },
    }),
    prisma.conversationAlert.count({
      where: {
        conversation: { businessId },
        alertLevel: { in: ['warning', 'urgent'] },
      },
    }),
  ])

  // Taxa de resolução do dia: quanto da demanda total foi encerrada
  const totalHoje = emFila + emAtendimento + resolvidasHoje
  const taxaResolucao = totalHoje > 0 ? Math.round((resolvidasHoje / totalHoje) * 1000) / 10 : 0

  // Tempo médio de espera atual — apenas in_queue com customerWaitingSince definido
  const convsEmFila = await prisma.conversation.findMany({
    where: {
      businessId,
      status: 'in_queue',
      customerWaitingSince: { not: null },
    },
    select: { customerWaitingSince: true },
  })

  let tempoMedioEsperaAtual = 0
  if (convsEmFila.length > 0) {
    const totalMs = convsEmFila.reduce(
      (acc, c) => acc + (agora.getTime() - c.customerWaitingSince!.getTime()),
      0
    )
    tempoMedioEsperaAtual = Math.round((totalMs / convsEmFila.length / 60000) * 10) / 10
  }

  // Ranking: agentes com conversas resolvidas hoje + agentes com in_progress agora
  const [convsResolvidasComAtendente, convsEmAndamento] = await Promise.all([
    prisma.conversation.findMany({
      where: { businessId, resolvedAt: { gte: hoje }, assignedUserId: { not: null } },
      select: {
        assignedUserId: true,
        assignedUser: { select: { name: true } },
        createdAt: true,
        resolvedAt: true,
      },
    }),
    prisma.conversation.findMany({
      where: { businessId, status: 'in_progress', assignedUserId: { not: null } },
      select: { assignedUserId: true, assignedUser: { select: { name: true } } },
    }),
  ])

  const ativosAgoraIds = new Set(convsEmAndamento.map((c) => c.assignedUserId))

  const rankingMap = new Map<number, { name: string; atendidas: number; totalMin: number }>()
  for (const c of convsResolvidasComAtendente) {
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

  // Inclui agentes ativos agora que ainda não encerraram nenhuma conversa hoje
  for (const c of convsEmAndamento) {
    if (!c.assignedUserId || !c.assignedUser) continue
    if (!rankingMap.has(c.assignedUserId)) {
      rankingMap.set(c.assignedUserId, { name: c.assignedUser.name, atendidas: 0, totalMin: 0 })
    }
  }

  const ranking = Array.from(rankingMap.entries())
    .map(([userId, e]) => ({
      name: e.name,
      atendidas: e.atendidas,
      tempoMedio: e.atendidas > 0 ? Math.round((e.totalMin / e.atendidas) * 10) / 10 : 0,
      ativoAgora: ativosAgoraIds.has(userId),
    }))
    .sort((a, b) => {
      // Ativos agora aparecem primeiro; empate desfeito por conversas encerradas
      if (a.ativoAgora !== b.ativoAgora) return a.ativoAgora ? -1 : 1
      return b.atendidas - a.atendidas
    })

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
  const h24atras = new Date(agora.getTime() - 24 * 60 * 60 * 1000)

  const convsUlt24h = await prisma.conversation.findMany({
    where: { businessId, createdAt: { gte: h24atras } },
    select: { createdAt: true },
  })

  const volumeMap = new Map<string, number>()
  for (const c of convsUlt24h) {
    const label = `${String(c.createdAt.getHours()).padStart(2, '0')}:00`
    volumeMap.set(label, (volumeMap.get(label) ?? 0) + 1)
  }

  const volumePorHora = Array.from({ length: 24 }, (_, i) => {
    const label = `${String(i).padStart(2, '0')}:00`
    return { hora: label, conversas: volumeMap.get(label) ?? 0 }
  })

  return NextResponse.json({
    kpis: { emFila, emAtendimento, resolvidasHoje, taxaResolucao, tempoMedioEsperaAtual, alertasAtivos },
    ranking,
    servicos,
    volumePorHora,
  })
}

// Job de alertas SLA — roda a cada 60s em background
// Verifica conversas aguardando além dos limites configurados e cria alertas
import { prisma } from './db'
import { broadcastToBusinessClients } from './sse'

const WARN_MINUTES = parseInt(process.env.ALERT_WARN_MINUTES ?? '5')
const URGENT_MINUTES = parseInt(process.env.ALERT_URGENT_MINUTES ?? '15')

let started = false

export function startSlaJob() {
  if (started) return
  started = true
  runSlaCheck()
  setInterval(runSlaCheck, 60_000)
}

async function runSlaCheck() {
  try {
    const now = new Date()

    const waiting = await prisma.conversation.findMany({
      where: {
        status: { in: ['waiting_menu', 'in_queue'] },
        customerWaitingSince: { not: null },
      },
      select: {
        id: true,
        businessId: true,
        customerWaitingSince: true,
        alerts: { select: { alertLevel: true } },
      },
    })

    for (const conv of waiting) {
      const minutesWaiting =
        (now.getTime() - conv.customerWaitingSince!.getTime()) / 60_000
      const existing = new Set(conv.alerts.map((a) => a.alertLevel))

      const toCreate: { level: string }[] = []
      if (minutesWaiting >= URGENT_MINUTES && !existing.has('URGENT'))
        toCreate.push({ level: 'URGENT' })
      if (minutesWaiting >= WARN_MINUTES && !existing.has('WARN'))
        toCreate.push({ level: 'WARN' })

      for (const { level } of toCreate) {
        await prisma.conversationAlert.create({
          data: { conversationId: conv.id, alertLevel: level, minutesWaiting },
        }).catch(() => {}) // ignora conflito de unique se duas instâncias rodarem

        broadcastToBusinessClients(String(conv.businessId), {
          type: 'alert',
          conversationId: conv.id,
          alertLevel: level,
          minutesWaiting,
        })
      }
    }
  } catch (err) {
    console.error('[SLA Job] Erro:', err)
  }
}

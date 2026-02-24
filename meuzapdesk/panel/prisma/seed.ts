import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Iniciando seed...')

  // Cria a oficina de teste
  const business = await prisma.business.upsert({
    where: { id: 1 },
    update: {},
    create: {
      name: 'Oficina Teste',
      whatsappNumber: '5511999999999',
      waApiToken: 'dev-token-placeholder',
      waPhoneNumberId: 'dev-phone-id-placeholder',
    },
  })

  console.log(`✅ Business criado: ${business.name} (id: ${business.id})`)

  // Usuário dono/admin
  const ownerHash = await bcrypt.hash('admin123', 12)
  const owner = await prisma.user.upsert({
    where: { email: 'admin@teste.com' },
    update: {},
    create: {
      businessId: business.id,
      name: 'André (Admin)',
      email: 'admin@teste.com',
      passwordHash: ownerHash,
      role: 'OWNER',
    },
  })

  console.log(`✅ OWNER criado: ${owner.name} — ${owner.email} / admin123`)

  // Usuário mecânico
  const mechanicHash = await bcrypt.hash('mecanico123', 12)
  const mechanic = await prisma.user.upsert({
    where: { email: 'mecanico@teste.com' },
    update: {},
    create: {
      businessId: business.id,
      name: 'João (Mecânico)',
      email: 'mecanico@teste.com',
      passwordHash: mechanicHash,
      role: 'MECHANIC',
    },
  })

  console.log(`✅ MECHANIC criado: ${mechanic.name} — ${mechanic.email} / mecanico123`)

  // Conversa de exemplo para visualizar a fila
  const conv = await prisma.conversation.create({
    data: {
      businessId: business.id,
      customerPhone: '5511888888888',
      customerName: 'Cliente Teste',
      status: 'in_queue',
      optionSelected: 1,
      lastCustomerMessageAt: new Date(Date.now() - 7 * 60 * 1000), // 7 min atrás
    },
  })

  await prisma.message.createMany({
    data: [
      {
        conversationId: conv.id,
        direction: 'out',
        content: 'Olá! Bem-vindo à Oficina Teste. Como podemos ajudar?\n\n1️⃣ Orçamento — Já sei as peças e serviço\n2️⃣ Orçamento — Preciso de diagnóstico\n3️⃣ Status do meu serviço\n4️⃣ Fornecedores e outros assuntos',
        sentAt: new Date(Date.now() - 8 * 60 * 1000),
      },
      {
        conversationId: conv.id,
        direction: 'in',
        content: '1',
        sentAt: new Date(Date.now() - 7 * 60 * 1000),
      },
    ],
  })

  console.log(`✅ Conversa de exemplo criada (${conv.customerName} — na fila há 7min)`)

  console.log('\n🎉 Seed concluído!')
  console.log('   Acesse: http://localhost:3000')
  console.log('   Login admin:    admin@teste.com    / admin123')
  console.log('   Login mecânico: mecanico@teste.com / mecanico123')
}

main()
  .catch((e) => {
    console.error('❌ Erro no seed:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())

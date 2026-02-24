import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: 'MeuZapDesk — Atendimento WhatsApp Profissional para seu Negócio',
  description:
    'Organize o atendimento do seu negócio pelo WhatsApp. Fila de prioridades, assinatura automática por atendente, alertas de SLA e painel em tempo real. Para qualquer tipo de empresa.',
  openGraph: {
    title: 'MeuZapDesk — Atendimento WhatsApp Profissional',
    description:
      'Chega de perder clientes no WhatsApp. Organize sua equipe com fila, prioridade e assinatura automática.',
    type: 'website',
    locale: 'pt_BR',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={inter.variable}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  )
}

'use client'

import { useState } from 'react'

const faqs = [
  {
    q: 'Funciona para qualquer tipo de negócio?',
    a: 'Sim! O MeuZapDesk é totalmente agnóstico ao segmento. Qualquer empresa que atenda clientes pelo WhatsApp pode usar — oficinas, clínicas, pet shops, imobiliárias, restaurantes, salões e muito mais.',
  },
  {
    q: 'Preciso de um número de WhatsApp Business API?',
    a: 'Sim, o sistema utiliza a API oficial do WhatsApp Business (Meta Cloud API), que garante estabilidade e segurança. Nossa equipe ajuda no processo de ativação durante o onboarding.',
  },
  {
    q: 'Quantos atendentes posso ter?',
    a: 'Depende do plano escolhido. O Starter suporta até 3 atendentes, o Pro até 10, e o Enterprise é ilimitado. Todos acessam o mesmo painel simultaneamente.',
  },
  {
    q: 'O cliente percebe que está falando com um sistema?',
    a: 'Apenas no primeiro contato, quando recebe o menu automático. A partir daí, toda comunicação é feita por um atendente real — a assinatura automática (ex: "André: mensagem") deixa claro quem está respondendo.',
  },
  {
    q: 'Posso cancelar a qualquer momento?',
    a: 'Sim. Não há fidelidade nem multa de cancelamento. Você pode encerrar o serviço quando quiser, sem burocracia.',
  },
]

export function FAQ() {
  const [open, setOpen] = useState<number | null>(null)

  return (
    <section id="faq" className="py-20 bg-white">
      <div className="max-w-3xl mx-auto px-6">
        <div className="text-center mb-14">
          <span className="text-wa-green font-semibold text-sm uppercase tracking-widest">FAQ</span>
          <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 mt-2">
            Perguntas frequentes
          </h2>
        </div>

        <div className="space-y-3">
          {faqs.map((faq, i) => (
            <div key={i} className="border border-gray-100 rounded-2xl overflow-hidden">
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="w-full flex items-center justify-between px-6 py-5 text-left font-semibold text-gray-900 hover:bg-gray-50 transition"
              >
                <span>{faq.q}</span>
                <span className={`ml-4 text-wa-green text-xl transition-transform ${open === i ? 'rotate-45' : ''}`}>
                  +
                </span>
              </button>
              {open === i && (
                <div className="px-6 pb-5 text-gray-500 text-sm leading-relaxed border-t border-gray-100">
                  <p className="pt-4">{faq.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

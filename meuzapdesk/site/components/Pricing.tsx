import Link from 'next/link'

const WA_LINK =
  'https://wa.me/5511999999999?text=Ol%C3%A1!%20Quero%20assinar%20o%20MeuZapDesk'

const plans = [
  {
    name: 'Essencial',
    price: 'R$ 99',
    cents: ',90',
    period: '/mês',
    description: 'Ideal para oficinas e negócios com até 5 atendentes.',
    features: [
      '5 atendentes',
      'Fila de prioridade',
      'Menu automático configurável',
      'Alertas de SLA',
      'Painel em tempo real',
      'Suporte por WhatsApp',
    ],
    highlight: false,
    cta: 'Começar agora',
  },
  {
    name: 'Avançado',
    price: 'R$ 139',
    cents: ',90',
    period: '/mês',
    description: 'Para equipes maiores que precisam de mais capacidade.',
    features: [
      '10 atendentes',
      'Tudo do Essencial',
      'Histórico completo de conversas',
      'Relatórios de atendimento',
      'SLA configurável',
      'Suporte prioritário',
    ],
    highlight: true,
    cta: 'Escolher Avançado',
  },
]

export function Pricing() {
  return (
    <section id="planos" className="py-20 bg-gray-50">
      <div className="max-w-4xl mx-auto px-6">
        <div className="text-center mb-14">
          <span className="text-wa-green font-semibold text-sm uppercase tracking-widest">
            Planos e preços
          </span>
          <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 mt-2">
            Simples, transparente e sem surpresas
          </h2>
          <p className="text-gray-500 mt-4 max-w-xl mx-auto">
            Sem contrato de fidelidade. Cancele quando quiser.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {plans.map((plan, i) => (
            <div
              key={i}
              className={`rounded-2xl p-8 flex flex-col ${
                plan.highlight
                  ? 'bg-[#0b141a] text-white shadow-2xl border-0'
                  : 'bg-white border border-gray-100 shadow-sm'
              }`}
            >
              {plan.highlight && (
                <span className="self-start bg-[#25D366] text-[#0b141a] text-xs font-bold px-3 py-1 rounded-full mb-4">
                  ⭐ Mais popular
                </span>
              )}
              <h3 className={`text-xl font-bold mb-1 ${plan.highlight ? 'text-[#e9edef]' : 'text-gray-900'}`}>
                {plan.name}
              </h3>
              <p className={`text-sm mb-5 ${plan.highlight ? 'text-[#aebac1]' : 'text-gray-500'}`}>
                {plan.description}
              </p>
              <div className="mb-6 flex items-end gap-0.5">
                <span className={`text-4xl font-extrabold ${plan.highlight ? 'text-[#e9edef]' : 'text-gray-900'}`}>
                  {plan.price}
                </span>
                <span className={`text-xl font-bold mb-0.5 ${plan.highlight ? 'text-[#e9edef]' : 'text-gray-900'}`}>
                  {plan.cents}
                </span>
                <span className={`text-sm mb-1 ml-1 ${plan.highlight ? 'text-[#aebac1]' : 'text-gray-400'}`}>
                  {plan.period}
                </span>
              </div>
              <ul className="space-y-3 mb-8 flex-1">
                {plan.features.map((f, j) => (
                  <li key={j} className="flex items-center gap-2 text-sm">
                    <span className="text-[#25D366] font-bold">✓</span>
                    <span className={plan.highlight ? 'text-[#aebac1]' : 'text-gray-600'}>{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                href={WA_LINK}
                target="_blank"
                className={`block text-center font-bold py-3 rounded-full transition text-sm ${
                  plan.highlight
                    ? 'bg-[#25D366] text-[#0b141a] hover:bg-[#20bd5a]'
                    : 'bg-[#0b141a] text-white hover:bg-[#202c33]'
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>

        <p className="text-center text-gray-400 text-sm mt-8">
          Precisa de mais de 10 atendentes?{' '}
          <Link href={WA_LINK} target="_blank" className="text-wa-green font-semibold hover:underline">
            Fale com a gente
          </Link>
        </p>
      </div>
    </section>
  )
}

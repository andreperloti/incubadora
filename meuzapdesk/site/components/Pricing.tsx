import Link from 'next/link'

const WA_LINK =
  'https://wa.me/5511999999999?text=Ol%C3%A1!%20Quero%20assinar%20o%20MeuZapDesk'

const plans = [
  {
    name: 'Starter',
    price: 'R$ 197',
    period: '/mês',
    description: 'Ideal para negócios com até 3 atendentes.',
    features: [
      '3 atendentes',
      'Fila de prioridade',
      'Menu automático',
      'Alertas de SLA',
      'Painel em tempo real',
      'Suporte por WhatsApp',
    ],
    highlight: false,
    cta: 'Começar agora',
  },
  {
    name: 'Pro',
    price: 'R$ 347',
    period: '/mês',
    description: 'Para equipes maiores que precisam de mais controle.',
    features: [
      'Até 10 atendentes',
      'Tudo do Starter',
      'Relatórios de atendimento',
      'Histórico completo',
      'SLA configurável por plano',
      'Suporte prioritário',
    ],
    highlight: true,
    cta: 'Escolher Pro',
  },
  {
    name: 'Enterprise',
    price: 'Sob consulta',
    period: '',
    description: 'Para grandes operações com necessidades específicas.',
    features: [
      'Atendentes ilimitados',
      'Tudo do Pro',
      'Múltiplos números WhatsApp',
      'Integração via API',
      'Onboarding dedicado',
      'SLA garantido em contrato',
    ],
    highlight: false,
    cta: 'Falar com comercial',
  },
]

export function Pricing() {
  return (
    <section id="planos" className="py-20 bg-gray-50">
      <div className="max-w-6xl mx-auto px-6">
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

        <div className="grid md:grid-cols-3 gap-6">
          {plans.map((plan, i) => (
            <div
              key={i}
              className={`rounded-2xl p-8 flex flex-col ${
                plan.highlight
                  ? 'bg-wa-dark text-white shadow-2xl scale-105 border-0'
                  : 'bg-white border border-gray-100'
              }`}
            >
              {plan.highlight && (
                <span className="self-start bg-wa-green text-white text-xs font-bold px-3 py-1 rounded-full mb-4">
                  ⭐ Mais popular
                </span>
              )}
              <h3 className={`text-xl font-bold mb-1 ${plan.highlight ? 'text-white' : 'text-gray-900'}`}>
                {plan.name}
              </h3>
              <p className={`text-sm mb-4 ${plan.highlight ? 'text-white/70' : 'text-gray-500'}`}>
                {plan.description}
              </p>
              <div className="mb-6">
                <span className={`text-4xl font-extrabold ${plan.highlight ? 'text-white' : 'text-gray-900'}`}>
                  {plan.price}
                </span>
                <span className={`text-sm ${plan.highlight ? 'text-white/70' : 'text-gray-400'}`}>
                  {plan.period}
                </span>
              </div>
              <ul className="space-y-3 mb-8 flex-1">
                {plan.features.map((f, j) => (
                  <li key={j} className="flex items-center gap-2 text-sm">
                    <span className={`text-base ${plan.highlight ? 'text-wa-green' : 'text-wa-green'}`}>✓</span>
                    <span className={plan.highlight ? 'text-white/90' : 'text-gray-600'}>{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                href={WA_LINK}
                target="_blank"
                className={`block text-center font-bold py-3 rounded-full transition ${
                  plan.highlight
                    ? 'bg-white text-wa-dark hover:bg-wa-light'
                    : 'bg-wa-green text-white hover:bg-wa-dark'
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

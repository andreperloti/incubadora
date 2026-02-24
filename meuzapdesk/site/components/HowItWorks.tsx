const steps = [
  {
    icon: '📱',
    title: 'Cliente manda mensagem',
    description:
      'O cliente entra em contato pelo WhatsApp e recebe automaticamente um menu de opções personalizado para o seu negócio.',
  },
  {
    icon: '🤖',
    title: 'Bot faz a triagem',
    description:
      'O sistema identifica o tipo de atendimento, cria a conversa na fila com a opção escolhida e notifica sua equipe em tempo real.',
  },
  {
    icon: '✍️',
    title: 'Equipe atende com profissionalismo',
    description:
      'Cada atendente responde pelo painel e a mensagem é enviada com assinatura automática — o cliente sabe exatamente com quem está falando.',
  },
]

export function HowItWorks() {
  return (
    <section id="como-funciona" className="py-20 bg-white">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-14">
          <span className="text-wa-green font-semibold text-sm uppercase tracking-widest">
            Simples assim
          </span>
          <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 mt-2">
            Como funciona o MeuZapDesk
          </h2>
          <p className="text-gray-500 mt-4 max-w-xl mx-auto">
            Em minutos sua equipe está organizada e seus clientes recebendo atendimento de qualidade.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 relative">
          {/* Linha conectora (desktop) */}
          <div className="hidden md:block absolute top-10 left-1/4 right-1/4 h-0.5 bg-gradient-to-r from-wa-green to-wa-dark" />

          {steps.map((step, i) => (
            <div key={i} className="relative text-center">
              <div className="relative inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-wa-green/10 border-2 border-wa-green/30 text-4xl mb-6 mx-auto">
                {step.icon}
                <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-wa-green text-white text-xs font-bold flex items-center justify-center">
                  {i + 1}
                </span>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-3">{step.title}</h3>
              <p className="text-gray-500 text-sm leading-relaxed">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

const features = [
  {
    icon: '📋',
    title: 'Menu automático',
    description:
      'Ao receber uma mensagem nova, o bot envia automaticamente um menu de opções personalizável para o seu negócio.',
  },
  {
    icon: '⏱️',
    title: 'Fila por prioridade',
    description:
      'Conversas são ordenadas pelo tempo sem resposta. Quem espera mais fica no topo — nunca mais clientes esquecidos.',
  },
  {
    icon: '✍️',
    title: 'Assinatura automática',
    description:
      'Cada resposta é enviada com o nome do atendente. O cliente sabe com quem fala, sem nenhum esforço extra.',
  },
  {
    icon: '🚨',
    title: 'Alertas de SLA',
    description:
      'Avisos automáticos quando uma conversa passa de 5 ou 15 minutos sem resposta. Configure os limites do seu negócio.',
  },
  {
    icon: '⚡',
    title: 'Painel em tempo real',
    description:
      'Novas mensagens aparecem instantaneamente sem recarregar a página, via Server-Sent Events.',
  },
  {
    icon: '👥',
    title: 'Multi-atendente',
    description:
      'Toda a equipe acessa o mesmo painel. Atribua conversas, acompanhe quem está atendendo e distribua a carga.',
  },
]

export function Features() {
  return (
    <section id="funcionalidades" className="py-20 bg-gray-50">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-14">
          <span className="text-wa-green font-semibold text-sm uppercase tracking-widest">
            Funcionalidades
          </span>
          <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 mt-2">
            Tudo que sua equipe precisa
          </h2>
          <p className="text-gray-500 mt-4 max-w-xl mx-auto">
            Desenvolvido para equipes de atendimento reais — sem complicação, sem treinamento longo.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f, i) => (
            <div
              key={i}
              className="bg-white rounded-2xl p-6 border border-gray-100 hover:border-wa-green/30 hover:shadow-md transition"
            >
              <div className="text-4xl mb-4">{f.icon}</div>
              <h3 className="font-bold text-gray-900 mb-2">{f.title}</h3>
              <p className="text-gray-500 text-sm leading-relaxed">{f.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

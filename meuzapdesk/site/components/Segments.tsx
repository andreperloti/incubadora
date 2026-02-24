const segments = [
  { icon: '🔧', name: 'Oficinas Mecânicas' },
  { icon: '🏥', name: 'Clínicas e Consultórios' },
  { icon: '🐾', name: 'Pet Shops e Veterinários' },
  { icon: '🏠', name: 'Imobiliárias' },
  { icon: '🍕', name: 'Restaurantes e Delivery' },
  { icon: '🛍️', name: 'Lojas e E-commerces' },
  { icon: '💇', name: 'Salões e Barbearias' },
  { icon: '⚖️', name: 'Escritórios e Advocacias' },
]

export function Segments() {
  return (
    <section id="segmentos" className="py-20 bg-white">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-14">
          <span className="text-wa-green font-semibold text-sm uppercase tracking-widest">
            Para qualquer negócio
          </span>
          <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 mt-2">
            Se o seu negócio atende pelo WhatsApp,<br className="hidden md:block" /> o MeuZapDesk é para você
          </h2>
          <p className="text-gray-500 mt-4 max-w-xl mx-auto">
            Não importa o segmento — se você tem uma equipe que responde clientes pelo WhatsApp, nós organizamos isso.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {segments.map((s, i) => (
            <div
              key={i}
              className="flex flex-col items-center gap-3 p-6 rounded-2xl bg-gray-50 border border-gray-100 hover:border-wa-green/40 hover:bg-wa-green/5 transition text-center group"
            >
              <span className="text-4xl group-hover:scale-110 transition-transform">{s.icon}</span>
              <span className="text-sm font-semibold text-gray-700">{s.name}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

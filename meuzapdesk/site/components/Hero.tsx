import Link from 'next/link'

const WA_LINK =
  'https://wa.me/5511999999999?text=Ol%C3%A1!%20Quero%20saber%20mais%20sobre%20o%20MeuZapDesk'

export function Hero() {
  return (
    <section className="relative bg-gradient-to-br from-wa-dark via-wa-green to-emerald-400 text-white overflow-hidden">
      {/* Navbar */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-5 max-w-6xl mx-auto">
        <div className="flex items-center gap-2 text-xl font-bold">
          <span className="text-2xl">💬</span> MeuZapDesk
        </div>
        <Link
          href={WA_LINK}
          target="_blank"
          className="bg-white text-wa-dark font-semibold px-4 py-2 rounded-full text-sm hover:bg-wa-light transition"
        >
          Falar com especialista
        </Link>
      </nav>

      {/* Conteúdo Hero */}
      <div className="relative z-10 max-w-6xl mx-auto px-6 pt-16 pb-24 grid md:grid-cols-2 gap-12 items-center">
        <div>
          <span className="inline-block bg-white/20 text-white text-xs font-medium px-3 py-1 rounded-full mb-6">
            🚀 Atendimento profissional no WhatsApp
          </span>
          <h1 className="text-4xl md:text-5xl font-extrabold leading-tight mb-6">
            Nunca mais perca um cliente no WhatsApp
          </h1>
          <p className="text-lg text-white/90 mb-8 leading-relaxed">
            Organize sua equipe de atendimento com fila de prioridades, assinatura automática por
            atendente e alertas de tempo de resposta — para qualquer tipo de negócio.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <Link
              href={WA_LINK}
              target="_blank"
              className="inline-flex items-center justify-center gap-2 bg-white text-wa-dark font-bold px-8 py-4 rounded-full hover:bg-wa-light transition text-base shadow-lg"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                <path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.121 1.532 5.849L.057 23.547a.5.5 0 0 0 .609.61l5.765-1.498A11.944 11.944 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.891 0-3.667-.498-5.2-1.37l-.372-.215-3.865 1.004 1.028-3.756-.234-.387A9.944 9.944 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z" />
              </svg>
              Falar com especialista
            </Link>
            <a
              href="#como-funciona"
              className="inline-flex items-center justify-center gap-2 border-2 border-white text-white font-semibold px-8 py-4 rounded-full hover:bg-white/10 transition text-base"
            >
              Ver como funciona ↓
            </a>
          </div>
        </div>

        {/* Mockup do painel */}
        <div className="hidden md:block">
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 border border-white/20 shadow-2xl">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-3 h-3 rounded-full bg-red-400" />
              <div className="w-3 h-3 rounded-full bg-yellow-400" />
              <div className="w-3 h-3 rounded-full bg-green-400" />
              <span className="text-white/60 text-xs ml-2">painel.meuzapdesk.com.br</span>
            </div>
            <div className="space-y-2">
              {[
                { name: 'Maria — Pet Shop', time: '2min', alert: 'warning', option: '🔍 Diagnóstico' },
                { name: 'João — Clínica', time: '5min', alert: 'urgent', option: '📋 Status' },
                { name: 'Carlos — Imobiliária', time: '8min', alert: 'urgent', option: '🔧 Orçamento' },
              ].map((c, i) => (
                <div
                  key={i}
                  className={`rounded-xl p-3 ${
                    c.alert === 'urgent'
                      ? 'bg-red-500/20 border border-red-400/40'
                      : 'bg-yellow-400/20 border border-yellow-300/40'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <p className="text-white font-semibold text-sm">{c.name}</p>
                    <span className="text-white/70 text-xs">{c.time} atrás</span>
                  </div>
                  <p className="text-white/70 text-xs mt-1">{c.option}</p>
                  {c.alert === 'urgent' && (
                    <p className="text-red-300 text-xs font-bold mt-1">🚨 URGENTE</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Onda decorativa */}
      <div className="absolute bottom-0 left-0 right-0">
        <svg viewBox="0 0 1440 60" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M0 60L1440 60L1440 0C1200 50 960 60 720 40C480 20 240 0 0 30L0 60Z" fill="white" />
        </svg>
      </div>
    </section>
  )
}

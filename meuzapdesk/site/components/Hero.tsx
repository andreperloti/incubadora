import Link from 'next/link'

const WA_LINK =
  'https://wa.me/5511999999999?text=Ol%C3%A1!%20Quero%20saber%20mais%20sobre%20o%20MeuZapDesk'

export function Hero() {
  return (
    <section className="relative bg-[#0b141a] text-white overflow-hidden">
      {/* Navbar */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-5 max-w-6xl mx-auto border-b border-white/5">
        <div className="flex items-center gap-2 text-xl font-bold text-[#e9edef]">
          <svg className="w-6 h-6 text-[#25D366]" fill="currentColor" viewBox="0 0 24 24">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
            <path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.121 1.532 5.849L.057 23.547a.5.5 0 0 0 .609.61l5.765-1.498A11.944 11.944 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.891 0-3.667-.498-5.2-1.37l-.372-.215-3.865 1.004 1.028-3.756-.234-.387A9.944 9.944 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z" />
          </svg>
          MeuZapDesk
        </div>
        <Link
          href={WA_LINK}
          target="_blank"
          className="bg-[#25D366] text-[#0b141a] font-semibold px-5 py-2 rounded-full text-sm hover:bg-[#20bd5a] transition"
        >
          Falar com especialista
        </Link>
      </nav>

      {/* Conteúdo Hero */}
      <div className="relative z-10 max-w-6xl mx-auto px-6 pt-16 pb-28 grid md:grid-cols-2 gap-16 items-center">
        <div>
          <span className="inline-flex items-center gap-2 bg-[#25D366]/10 border border-[#25D366]/20 text-[#25D366] text-xs font-semibold px-3 py-1 rounded-full mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-[#25D366] animate-pulse" />
            Atendimento profissional no WhatsApp
          </span>
          <h1 className="text-4xl md:text-5xl font-extrabold leading-tight mb-6 text-[#e9edef]">
            Nunca mais perca um cliente no WhatsApp
          </h1>
          <p className="text-base text-[#aebac1] mb-8 leading-relaxed">
            Organize sua equipe com fila de prioridades, menu automático configurável, assinatura por atendente e alertas de SLA — tudo em um painel que parece o próprio WhatsApp.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <Link
              href={WA_LINK}
              target="_blank"
              className="inline-flex items-center justify-center gap-2 bg-[#25D366] text-[#0b141a] font-bold px-7 py-3.5 rounded-full hover:bg-[#20bd5a] transition text-sm shadow-lg"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                <path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.121 1.532 5.849L.057 23.547a.5.5 0 0 0 .609.61l5.765-1.498A11.944 11.944 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.891 0-3.667-.498-5.2-1.37l-.372-.215-3.865 1.004 1.028-3.756-.234-.387A9.944 9.944 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z" />
              </svg>
              Falar com especialista
            </Link>
            <a
              href="#como-funciona"
              className="inline-flex items-center justify-center gap-2 border border-white/15 text-[#aebac1] font-semibold px-7 py-3.5 rounded-full hover:bg-white/5 transition text-sm"
            >
              Ver como funciona ↓
            </a>
          </div>
        </div>

        {/* Mockup do painel — tema escuro real */}
        <div className="hidden md:block">
          <div className="rounded-2xl overflow-hidden border border-white/10 shadow-2xl" style={{ background: '#111b21' }}>
            {/* Barra de título */}
            <div className="flex items-center gap-2 px-4 py-3 bg-[#202c33] border-b border-white/5">
              <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
              <div className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
              <div className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
              <span className="text-[#aebac1] text-xs ml-2">MeuZapDesk — Atendimento</span>
            </div>

            <div className="flex h-64">
              {/* Sidebar */}
              <div className="w-48 bg-[#111b21] border-r border-white/5 flex flex-col">
                <div className="px-3 py-2 text-[#aebac1] text-[10px] font-semibold uppercase tracking-wider">
                  Fila de espera
                </div>
                {[
                  { name: 'Maria S.', msg: 'Preciso de orçamento', time: '2min', alert: 'warn' },
                  { name: 'João P.', msg: 'Qual o status?', time: '7min', alert: 'urgent' },
                  { name: 'Carlos M.', msg: 'Boa tarde!', time: '12min', alert: 'urgent' },
                ].map((c, i) => (
                  <div
                    key={i}
                    className={`px-3 py-2.5 border-l-2 ${
                      i === 0
                        ? 'bg-[#202c33] border-[#25D366]'
                        : 'border-transparent hover:bg-[#202c33]/50'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="text-[#e9edef] text-xs font-semibold truncate">{c.name}</span>
                      <span className={`text-[9px] font-bold ml-1 ${c.alert === 'urgent' ? 'text-red-400' : 'text-yellow-400'}`}>
                        {c.time}
                      </span>
                    </div>
                    <p className="text-[#aebac1] text-[10px] truncate mt-0.5">{c.msg}</p>
                  </div>
                ))}
              </div>

              {/* Chat */}
              <div className="flex-1 flex flex-col bg-[#0b141a]">
                {/* Header do chat */}
                <div className="px-4 py-2.5 bg-[#202c33] flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-[#25D366]/20 flex items-center justify-center text-[10px] text-[#25D366] font-bold">M</div>
                  <div>
                    <p className="text-[#e9edef] text-xs font-semibold">Maria S.</p>
                    <p className="text-[#aebac1] text-[9px]">online</p>
                  </div>
                </div>

                {/* Mensagens */}
                <div className="flex-1 p-3 space-y-2 overflow-hidden">
                  <div className="flex justify-start">
                    <div className="bg-[#202c33] rounded-lg rounded-tl-none px-3 py-1.5 max-w-[80%]">
                      <p className="text-[#e9edef] text-[10px]">Boa tarde! Preciso de um orçamento</p>
                      <p className="text-[#aebac1] text-[8px] text-right mt-0.5">14:32</p>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <div className="bg-[#005c4b] rounded-lg rounded-tr-none px-3 py-1.5 max-w-[80%]">
                      <p className="text-[#53bdeb] text-[9px] font-semibold">André (Admin):</p>
                      <p className="text-[#e9edef] text-[10px]">Olá Maria! Vou verificar agora.</p>
                      <p className="text-[#aebac1] text-[8px] text-right mt-0.5">14:33 ✓✓</p>
                    </div>
                  </div>
                </div>

                {/* Input */}
                <div className="px-3 py-2 bg-[#202c33] flex items-center gap-2">
                  <div className="flex-1 bg-[#2a3942] rounded-full px-3 py-1.5">
                    <span className="text-[#aebac1] text-[10px]">Digite uma mensagem...</span>
                  </div>
                  <div className="w-6 h-6 rounded-full bg-[#25D366] flex items-center justify-center">
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M2 21l21-9L2 3v7l15 2-15 2v7z"/>
                    </svg>
                  </div>
                </div>
              </div>
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

import Link from 'next/link'

const WA_LINK =
  'https://wa.me/5511999999999?text=Ol%C3%A1!%20Quero%20saber%20mais%20sobre%20o%20MeuZapDesk'

export function Footer() {
  return (
    <footer className="bg-gray-900 text-white py-16">
      <div className="max-w-6xl mx-auto px-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-8 mb-12">
          <div>
            <div className="flex items-center gap-2 text-xl font-bold mb-2">
              <span className="text-2xl">💬</span> MeuZapDesk
            </div>
            <p className="text-gray-400 text-sm max-w-xs">
              Atendimento WhatsApp profissional para qualquer tipo de negócio.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4">
            <a href="#como-funciona" className="text-gray-400 hover:text-white text-sm transition">
              Como funciona
            </a>
            <a href="#funcionalidades" className="text-gray-400 hover:text-white text-sm transition">
              Funcionalidades
            </a>
            <a href="#planos" className="text-gray-400 hover:text-white text-sm transition">
              Planos
            </a>
            <a href="#faq" className="text-gray-400 hover:text-white text-sm transition">
              FAQ
            </a>
          </div>

          <Link
            href={WA_LINK}
            target="_blank"
            className="inline-flex items-center gap-2 bg-wa-green hover:bg-wa-dark text-white font-bold px-6 py-3 rounded-full transition"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
              <path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.121 1.532 5.849L.057 23.547a.5.5 0 0 0 .609.61l5.765-1.498A11.944 11.944 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.891 0-3.667-.498-5.2-1.37l-.372-.215-3.865 1.004 1.028-3.756-.234-.387A9.944 9.944 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z" />
            </svg>
            Falar conosco
          </Link>
        </div>

        <div className="border-t border-gray-800 pt-8 text-center text-gray-500 text-xs">
          © {new Date().getFullYear()} MeuZapDesk. Todos os direitos reservados.
        </div>
      </div>
    </footer>
  )
}

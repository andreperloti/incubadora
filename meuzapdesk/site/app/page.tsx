import { Hero } from '@/components/Hero'
import { HowItWorks } from '@/components/HowItWorks'
import { Features } from '@/components/Features'
import { Segments } from '@/components/Segments'
import { Pricing } from '@/components/Pricing'
import { FAQ } from '@/components/FAQ'
import { Footer } from '@/components/Footer'
import { WhatsAppButton } from '@/components/WhatsAppButton'

export default function Home() {
  return (
    <>
      <Hero />
      <HowItWorks />
      <Features />
      <Segments />
      <Pricing />
      <FAQ />
      <Footer />
      <WhatsAppButton />
    </>
  )
}

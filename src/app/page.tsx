import { Shell } from '@/components/layout/Shell';
import { HeroSection } from '@/components/features/landing/HeroSection';
import { PartnerLogos } from '@/components/features/landing/PartnerLogos';
import { LandingBackground } from '@/components/features/landing/LandingBackground';
import { WhyTrustThis } from '@/components/features/landing/WhyTrustThis';

export default function HomePage() {
  return (
    <>
      <LandingBackground />
      <Shell>
        <HeroSection />
        <WhyTrustThis />
        <PartnerLogos />
      </Shell>
    </>
  );
}

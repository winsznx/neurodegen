import { Shell } from '@/components/layout/Shell';
import { HeroSection } from '@/components/features/landing/HeroSection';
import { PartnerLogos } from '@/components/features/landing/PartnerLogos';

export default function HomePage() {
  return (
    <Shell>
      <HeroSection />
      <PartnerLogos />
    </Shell>
  );
}

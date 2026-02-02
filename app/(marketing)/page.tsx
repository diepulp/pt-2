import { CapabilitiesSection } from '@/components/marketing/sections/capabilities';
import { FAQSection } from '@/components/marketing/sections/faq';
import { FinalCTASection } from '@/components/marketing/sections/final-cta';
import { HeroSection } from '@/components/marketing/sections/hero';
import { HowItWorksSection } from '@/components/marketing/sections/how-it-works';
import { PricingTeaserSection } from '@/components/marketing/sections/pricing-teaser';
import { ProblemsSection } from '@/components/marketing/sections/problems';
import { SocialProofSection } from '@/components/marketing/sections/social-proof';

export const dynamic = 'force-static';

export default function LandingPage() {
  return (
    <>
      <HeroSection />
      <ProblemsSection />
      <CapabilitiesSection />
      <HowItWorksSection />
      <SocialProofSection />
      <PricingTeaserSection />
      <FAQSection />
      <FinalCTASection />
    </>
  );
}

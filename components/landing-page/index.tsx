"use client";

import dynamic from "next/dynamic";

import { Navbar } from "./navbar";
import { HeroSection } from "./sections/hero-section";

// Lazy load below-the-fold sections with no SSR
const FeaturesSection = dynamic(
  () =>
    import("./sections/features-section").then((mod) => ({
      default: mod.FeaturesSection,
    })),
  {
    ssr: false,
    loading: () => <div className="h-96" />,
  },
);

const BenefitsSection = dynamic(
  () =>
    import("./sections/benefits-section").then((mod) => ({
      default: mod.BenefitsSection,
    })),
  {
    ssr: false,
    loading: () => <div className="h-96" />,
  },
);

const TestimonialsSection = dynamic(
  () =>
    import("./sections/testimonials-section").then((mod) => ({
      default: mod.TestimonialsSection,
    })),
  {
    ssr: false,
    loading: () => <div className="h-96" />,
  },
);

const PricingSection = dynamic(
  () =>
    import("./sections/pricing-section").then((mod) => ({
      default: mod.PricingSection,
    })),
  {
    ssr: false,
    loading: () => <div className="h-96" />,
  },
);

const ContactSection = dynamic(
  () =>
    import("./sections/contact-section").then((mod) => ({
      default: mod.ContactSection,
    })),
  {
    ssr: false,
    loading: () => <div className="h-96" />,
  },
);

const Footer = dynamic(
  () => import("./footer").then((mod) => ({ default: mod.Footer })),
  {
    ssr: false,
    loading: () => <div className="h-32" />,
  },
);

const LandingPage = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <HeroSection />
      <FeaturesSection />
      <BenefitsSection />
      <TestimonialsSection />
      <PricingSection />
      <ContactSection />
      <Footer />
    </div>
  );
};

export default LandingPage;

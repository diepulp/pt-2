import dynamic from "next/dynamic";

const LandingPage = dynamic(() => import("@/components/landing-page"), {
  ssr: true,
});

export default function Page() {
  return <LandingPage />;
}

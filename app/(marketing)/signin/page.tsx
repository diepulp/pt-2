import Link from 'next/link';

import { LoginForm } from '@/components/login-form';

export default function SignInPage() {
  return (
    <div className="relative min-h-[70vh] overflow-hidden bg-[#000212]">
      {/* Dot grid texture */}
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
        style={{
          backgroundImage:
            'radial-gradient(circle, rgba(255,255,255,0.4) 0.5px, transparent 0.5px)',
          backgroundSize: '24px 24px',
          opacity: 0.04,
        }}
      />

      {/* Ambient glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
        style={{
          background:
            'radial-gradient(ellipse 50% 50% at 50% 20%, hsl(189 94% 43% / 0.06), transparent)',
        }}
      />

      <div className="relative flex min-h-[70vh] items-center justify-center px-5 py-16 sm:px-6">
        <div className="w-full max-w-[420px] space-y-6">
          <LoginForm />
          <p className="text-center text-[13px] text-[#95A2B3]/60">
            Not sure where to start?{' '}
            <Link
              href="/contact"
              className="text-[#95A2B3] transition-colors duration-300 hover:text-[#F7F8F8]"
            >
              Request a demo
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

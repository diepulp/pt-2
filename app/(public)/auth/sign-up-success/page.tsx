import Link from 'next/link';

export default function Page() {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 sm:p-8">
      <div className="mb-4">
        <h1
          className="text-2xl font-bold"
          style={{
            background:
              'linear-gradient(to right bottom, rgb(247 248 248) 30%, rgba(247 248 248 / 0.38))',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          Check your email
        </h1>
        <p className="mt-2 text-[15px] text-[#95A2B3]">
          Account created successfully
        </p>
      </div>

      <p className="text-sm leading-relaxed text-[#95A2B3]/70">
        You&apos;ve successfully signed up. Please check your email to confirm
        your account before signing in.
      </p>

      <div className="mt-6">
        <Link
          href="/auth/login"
          className="text-sm text-[#95A2B3] transition-colors duration-300 hover:text-[#F7F8F8]"
        >
          &larr; Back to sign in
        </Link>
      </div>
    </div>
  );
}

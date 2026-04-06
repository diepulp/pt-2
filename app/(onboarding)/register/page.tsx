import { redirect } from 'next/navigation';

import { RegisterForm } from '@/components/onboarding/register-form';
import { createClient } from '@/lib/supabase/server';

export default async function RegisterPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/signin?redirect=/register');
  }

  // If user already has a pending registration, skip to bootstrap
  const { data: registration } = await supabase
    .from('onboarding_registration')
    .select('id')
    .eq('status', 'pending')
    .maybeSingle();

  if (registration) {
    redirect('/bootstrap');
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">Register Your Company</h1>
        <p className="mt-2 text-muted-foreground">
          Tell us about your company before setting up your first casino.
        </p>
      </div>
      <RegisterForm />
    </div>
  );
}

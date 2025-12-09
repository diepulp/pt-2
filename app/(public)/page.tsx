import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export default async function LandingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/pit");
  }

  // Show landing page for unauthenticated users
  return (
    <div className="flex min-h-screen flex-col items-center justify-center">
      <h1 className="text-4xl font-mono font-bold">PT-2 Pit Station</h1>
      <p className="mt-4 text-muted-foreground">Casino pit management system</p>
      <a href="/auth/login" className="mt-8 underline">
        Sign in
      </a>
    </div>
  );
}

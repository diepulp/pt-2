"use client";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { createBrowserComponentClient } from "@/lib/supabase/client";

export function LogoutButton() {
  const router = useRouter();

  const logout = async () => {
    const supabase = createBrowserComponentClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
  };

  return <Button onClick={logout}>Logout</Button>;
}

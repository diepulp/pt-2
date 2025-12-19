import { redirect } from "next/navigation";

import { AppSidebar } from "@/components/layout/app-sidebar";
import { Header } from "@/components/layout/header";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // TODO: Re-enable auth when ready
  // const supabase = await createClient();
  // const {
  //   data: { user },
  // } = await supabase.auth.getUser();
  //
  // if (!user) {
  //   redirect("/auth/login");
  // }

  // Main sidebar collapsed width: 56px (3.5rem / w-14)
  return (
    <div className="flex min-h-screen w-full flex-col bg-background">
      <AppSidebar />
      {/* Main content offset by collapsed sidebar width */}
      <div className="flex flex-1 flex-col ml-14">
        <Header />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}

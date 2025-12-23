import { AppSidebar } from "@/components/layout/app-sidebar";
import { Header } from "@/components/layout/header";

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
      <div className="flex w-full">
        {/* Placeholder for PT logo svg */}
        <div className="flex h-15 w-16 items-center justify-center gap-1.5 border-b bg-background">
          <div className="w-2 h-2 rounded-full bg-red-500/60" />
          <div className="w-2 h-2 rounded-full bg-amber-500/60" />
          <div className="w-2 h-2 rounded-full bg-emerald-500/60" />
        </div>
        <div className="flex-1">
          <Header />
        </div>
      </div>
      <AppSidebar />
      {/* Main content offset by collapsed sidebar width */}
      <div className="flex flex-1 flex-col ml-14">
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}

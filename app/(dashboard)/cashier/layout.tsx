import { CashierTabNav } from '@/components/cashier/cashier-tab-nav';

export default function CashierLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Cashier Console
        </h1>
        <p className="text-muted-foreground">
          Confirm operational events and patron transactions
        </p>
      </div>
      <CashierTabNav />
      {children}
    </div>
  );
}

import { redirect } from 'next/navigation';

export default function LoyaltyIndexPage() {
  redirect('/admin/loyalty/rewards');
}

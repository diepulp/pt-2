import { redirect } from 'next/navigation';

export default function LoyaltySettingsRedirect() {
  redirect('/admin/loyalty/economics');
}

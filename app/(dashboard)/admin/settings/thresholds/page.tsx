import { redirect } from 'next/navigation';

export default function ThresholdsRedirect() {
  redirect('/admin/settings/anomaly-detection');
}

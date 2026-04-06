import { redirect } from 'next/navigation';

export default function ThresholdsRedirect() {
  redirect('/admin/anomaly-detection/settings');
}

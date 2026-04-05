import { redirect } from 'next/navigation';

export default function AnomalyDetectionIndexPage() {
  redirect('/admin/anomaly-detection/alerts');
}

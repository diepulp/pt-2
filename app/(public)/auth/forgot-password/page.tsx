// DEC-4: Password infrastructure retired. Soft-redirect to /auth/login.
// File kept on disk for safe handling of bookmarked URLs.
import { redirect } from 'next/navigation';

export default function Page() {
  redirect('/auth/login');
}

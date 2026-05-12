// DEC-2: /auth/sign-up replaced in place — renders RequestAccessForm instead of
// calling signUp(). Route stays alive to avoid broken bookmarks; signUp() never fires.
import { RequestAccessForm } from '@/components/request-access-form';

export default function Page() {
  return <RequestAccessForm />;
}

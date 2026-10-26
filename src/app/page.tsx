import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function Home() {
  const cookieStore = await cookies();
  const session = cookieStore.get('spid_session')?.value;

  if (session) {
    redirect('/admin/dashboard');
  } else {
    redirect('/auth/sign-in');
  }
}

import type { Metadata } from 'next';
import LoginPage from '@/components/LoginPage';
export const metadata: Metadata = { title: 'Entrar · Letria', robots: { index: false, follow: false } };
export default async function Login({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const mode = params.modo === 'cadastro' ? 'register' : params.modo === 'estudante' ? 'student' : 'login';
  return <LoginPage initialMode={mode} />;
}

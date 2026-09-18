import type { Metadata } from 'next';
import Letria from '@/components/Letria';
export const metadata: Metadata = { title: 'Minha aventura · Letria', robots: { index: false, follow: false } };
export default async function Platform({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  return <Letria allowDemo={params.demo === '1'} />;
}

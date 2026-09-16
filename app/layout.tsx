import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import './globals.css';
export async function generateMetadata():Promise<Metadata>{const h=await headers();const host=h.get('x-forwarded-host')||h.get('host')||'localhost:3000';const protocol=host.includes('localhost')||host.startsWith('127.')?'http':'https';const origin=`${protocol}://${host}`;return {title:'Letria · Uma aventura em cada palavra',description:'Explore mundos, descubra palavras e cresça a cada conquista. Uma aventura de alfabetização para estudantes, professores e famílias.',applicationName:'Letria',manifest:'/manifest.webmanifest',icons:{icon:'/icon-192.png',apple:'/icon-192.png'},openGraph:{title:'Letria · Uma aventura em cada palavra',description:'Aprender é uma grande aventura.',images:[`${origin}/og.png`],locale:'pt_BR',type:'website'},twitter:{card:'summary_large_image',title:'Letria · Uma aventura em cada palavra',images:[`${origin}/og.png`]}};}
export const viewport:Viewport={width:'device-width',initialScale:1,themeColor:'#151423'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="pt-BR"><body>{children}</body></html>;}

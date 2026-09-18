'use client';

import { useState } from 'react';
import Image from 'next/image';
import './learning-playful.css';

export default function LumiCharacter({ small = false, thinking = false }: { small?: boolean; thinking?: boolean }) {
  const [hasPortrait, setHasPortrait] = useState(true);
  return <span className={'lumi-character lumi-illustrated' + (small ? ' lumi-small' : '') + (thinking ? ' lumi-thinking' : '')} aria-hidden="true">
    {hasPortrait ? <Image src="/art/lumi-explorer.png" alt="" width={256} height={256} className="lumi-portrait" unoptimized onError={() => setHasPortrait(false)}/> : <>
      <span className="lumi-wing lumi-wing-left"/><span className="lumi-wing lumi-wing-right"/>
      <span className="lumi-body"><span className="lumi-belly"/><span className="lumi-mask"><span className="lumi-eye"/><span className="lumi-eye"/></span><span className="lumi-beak"/></span>
      <span className="lumi-feet"/><span className="lumi-spark">✦</span>
    </>}
  </span>;
}

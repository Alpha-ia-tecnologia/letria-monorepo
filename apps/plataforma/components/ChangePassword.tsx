'use client';
import { useId, useState, type FormEvent } from 'react';
import { KeyRound, LoaderCircle } from 'lucide-react';
import type { ApiResult, PlatformAction } from '@/lib/types';

export default function ChangePassword({ onAction, onDone }: { onAction: (action: PlatformAction) => Promise<ApiResult>; onDone: () => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), hint = useId();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget), currentPassword = String(form.get('current') || ''), newPassword = String(form.get('password') || '');
    if (newPassword !== String(form.get('confirm') || '')) { setError('A confirmação não corresponde à nova senha.'); return; }
    setBusy(true); setError('');
    try { await onAction({ action: 'changePassword', currentPassword, newPassword }); onDone(); }
    catch (e) { setError((e as Error).message); setBusy(false); }
  }
  return <form className="auth-form" onSubmit={submit} aria-busy={busy}>
    <label>Senha atual<input name="current" type="password" autoComplete="current-password" required maxLength={128} disabled={busy} /></label>
    <label>Nova senha<input name="password" type="password" autoComplete="new-password" required minLength={10} maxLength={128} aria-describedby={hint} disabled={busy} /><small id={hint}>De 10 a 128 caracteres.</small></label>
    <label>Confirme a nova senha<input name="confirm" type="password" autoComplete="new-password" required minLength={10} maxLength={128} disabled={busy} /></label>
    {error && <p className="form-error" role="alert">{error}</p>}
    <p className="info-box">Outros aparelhos conectados a esta conta precisarão entrar novamente.</p>
    <button className="btn btn-primary full-width" disabled={busy}>{busy ? <><LoaderCircle className="spin" size={17} />Salvando...</> : <>Salvar nova senha <KeyRound size={17} /></>}</button>
  </form>;
}

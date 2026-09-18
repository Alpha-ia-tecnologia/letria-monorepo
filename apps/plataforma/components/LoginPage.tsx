"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronDown, Eye, EyeOff, GraduationCap, KeyRound, LoaderCircle, LockKeyhole, Mail, School, Sparkles, Users } from "lucide-react";
import { api, cachePlatform, cachedPlatform, clearOffline, queued } from "@/lib/client";
import type { PlatformAction } from "@/lib/types";
import "./login-page.css";
import "./entry-guidance.css";

type LoginMode = "login" | "student" | "register";
type Props = { initialMode?: LoginMode };

export default function LoginPage({ initialMode = "login" }: Props) {
  return <LoginView key={initialMode} initialMode={initialMode} />;
}

function LoginView({ initialMode = "login" }: Props) {
  const [mode, setMode] = useState<LoginMode>(initialMode);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const submitting = useRef(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const isRegister = mode === "register";
  const isStudent = mode === "student";
  const accessTitle = isRegister ? "Cadastrar uma nova escola" : isStudent ? "Entrar como estudante" : "Entrar na Letria";
  const accessHelp = isRegister
    ? "Este cadastro cria uma escola e sua conta de administrador. Depois você poderá organizar as turmas e os acessos."
    : isStudent
      ? "Use o código individual que seu professor ou a escola entregou."
      : "Professores, responsáveis e equipe da escola entram com e-mail e senha.";

  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);

  function chooseMode(next: LoginMode) {
    if (submitting.current) return;
    setMode(next); setError(""); setNotice(""); setShowPassword(false);
    window.requestAnimationFrame(() => document.getElementById(next === "student" ? "lg-code" : "lg-email")?.focus());
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const form = new FormData(event.currentTarget);
    submitting.current = true; setBusy(true); setError(""); setNotice("");
    try {
      // A session may have expired while answers were pending. Signing back in
      // must remain possible without discarding the previous profile's work.
      const pendingBeforeLogin = await queued().catch(() => null);
      const previousCache = await cachedPlatform().catch(() => undefined);
      const text = (key: string) => String(form.get(key) || "");
      const action: PlatformAction = isStudent
        ? { action: "studentLogin", code: text("code") }
        : isRegister
          ? { action: "register", name: text("name").trim(), institutionName: text("school").trim(), email: text("email").trim(), password: text("password") }
          : { action: "login", email: text("email").trim(), password: text("password") };
      const result = await api(action);
      // Authentication has succeeded. Local caching is optional and must never
      // turn a valid login into an error or clear answers added by another tab.
      const pendingAfterLogin = await queued().catch(() => null);
      const pending = pendingAfterLogin ?? pendingBeforeLogin ?? [];
      const owner = result.data ? `${result.data.session.institutionId}:${result.data.session.studentId}` : "";
      const hasOtherProfileAnswers = pending.some(item => item.owner !== owner);
      if (previousCache?.session.userId !== result.data?.session.userId) await clearOffline({ preserveQueue: true }).catch(() => undefined);
      if (result.data) await cachePlatform(result.data).catch(() => undefined);
      if (hasOtherProfileAnswers) {
        setNotice("A conta está conectada, mas há atividades de outro perfil neste dispositivo. Entre no perfil original para sincronizá-las ou continue na conta atual.");
        submitting.current = false; setBusy(false); return;
      }
      window.location.assign("/plataforma");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Não foi possível entrar agora.";
      setError(message === "Código de estudante inválido."
        ? "Não encontramos esse código. Confira as letras e os números no acesso entregue pela escola. Se continuar, peça ajuda ao professor."
        : message === "E-mail ou senha incorretos."
          ? "O e-mail e a senha não conferem. Confira os dados recebidos da escola. Você pode tocar no olho para ver a senha digitada."
          : /Failed to fetch|NetworkError|Load failed/i.test(message)
            ? "Não conseguimos conectar à plataforma. Confira se a internet está funcionando e tente novamente."
            : message);
      submitting.current = false; setBusy(false);
    }
  }

  return <main className="login-page">
    <a className="lg-skip" href="#lg-access">Pular para o acesso</a>
    <section className="lg-story" aria-labelledby="lg-story-title">
      <Link prefetch={false} href="/" className="lg-brand" aria-label="Letria, página inicial"><span className="lg-brand-icon"><BookOpen size={24} strokeWidth={2.4} /></span><span>letria<span className="lg-brand-star" aria-hidden="true">✦</span></span></Link>
      <div className="lg-story-content">
        <span className="lg-eyebrow"><Sparkles size={15} /> APRENDER PODE SER UMA AVENTURA</span>
        <h1 id="lg-story-title">Sua próxima descoberta <span>começa aqui.</span></h1>
        <p>Pequenos passos, grandes conquistas. Um universo de possibilidades para aprender no seu ritmo.</p>
        <div className="lg-adventure">
          {/* Existing local artwork is intentionally served without a remote image service. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="lg-adventure-image" src="/art/hero-adventure.png" alt="Um pequeno explorador em um mundo colorido de descobertas." width={1536} height={1024} fetchPriority="high" />
          <span className="lg-adventure-note"><span><Check size={15} /></span>Uma conquista de cada vez</span>
          <span className="lg-art-star lg-art-star-one" aria-hidden="true">✦</span><span className="lg-art-star lg-art-star-two" aria-hidden="true">✦</span>
        </div>
        <div className="lg-lumi-note">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/art/lumi-explorer.png" width={1254} height={1254} alt="Lumi, companheira de aventuras." />
          <div><strong>Tem companhia nessa jornada.</strong><p>A Lumi ajuda a transformar dúvidas em novas descobertas.</p></div>
        </div>
      </div>
      <p className="lg-story-footnote">Para quem aprende. Para quem ensina. Para quem acompanha.</p>
    </section>
    <section className="lg-access" id="lg-access" aria-labelledby="lg-access-title">
      <nav className="lg-top-nav" aria-label="Navegação do acesso"><Link prefetch={false} href="/"><ArrowLeft size={16} />Voltar ao início</Link><Link prefetch={false} href="/plataforma?demo=1">Ver demonstração<ArrowRight size={15} /></Link></nav>
      <div className="lg-form-wrap">
        <span className={`lg-access-icon ${isStudent ? "lg-access-icon-student" : ""}`} aria-hidden="true">{isRegister ? <School size={28} /> : isStudent ? <GraduationCap size={29} /> : <BookOpen size={27} />}</span>
        <h2 id="lg-access-title">{accessTitle}</h2>
        <p className="lg-intro">{accessHelp}</p>
        {!isRegister ? <section className="eg-access-choice" aria-labelledby="eg-choice-title">
          <h3 id="eg-choice-title"><span>1</span> Escolha quem vai entrar</h3>
          <div className="eg-access-options" role="group" aria-label="Tipo de acesso">
            <button type="button" aria-pressed={isStudent} disabled={busy} onClick={() => chooseMode("student")}><GraduationCap size={23} aria-hidden="true" /><span><strong>Sou estudante</strong><small>Entrar com o código da escola</small></span>{isStudent && <Check size={18} aria-hidden="true" />}</button>
            <button type="button" aria-pressed={!isStudent} disabled={busy} onClick={() => chooseMode("login")}><Users size={23} aria-hidden="true" /><span><strong>Professor ou responsável</strong><small>E-mail e senha · inclui a equipe da escola</small></span>{!isStudent && <Check size={18} aria-hidden="true" />}</button>
          </div>
        </section> : <aside className="eg-register-guidance"><School size={22} aria-hidden="true" /><div><strong>Para quem vai administrar uma escola nova</strong><p>Sua escola já usa a Letria? Peça seu acesso à equipe da escola.</p><Link prefetch={false} href="/login">Minha escola já está cadastrada <ArrowRight size={15} /></Link></div></aside>}
        <div className="eg-form-heading"><h3>{!isRegister && <span>2</span>}{isRegister ? "Preencha os dados da escola" : isStudent ? "Digite seu código e entre" : "Digite seu e-mail e sua senha"}</h3>{!isRegister && <p>{isStudent ? "O código é da criança que vai realizar as atividades." : "Use os dados da sua própria conta. A escola cria os acessos de professores e responsáveis."}</p>}</div>
        <form key={mode} className="lg-form" onSubmit={submit} aria-busy={busy}>
          <fieldset disabled={busy}>
            {isStudent ? <label className="lg-field" htmlFor="lg-code"><span>Seu código de acesso</span><div className="lg-input-wrap"><KeyRound size={19} /><input id="lg-code" name="code" type="text" autoComplete="off" autoCapitalize="characters" spellCheck={false} required maxLength={40} aria-describedby="lg-code-hint" placeholder="Código entregue pelo professor" className="lg-code-input" /></div><small id="lg-code-hint">Copie o código recebido. Espaços e traços não fazem diferença.</small></label> : <>
              {isRegister && <><label className="lg-field" htmlFor="lg-name"><span>Seu nome</span><input id="lg-name" name="name" autoComplete="name" required maxLength={80} placeholder="Como podemos chamar você?" /></label><label className="lg-field" htmlFor="lg-school"><span>Nome da escola</span><input id="lg-school" name="school" autoComplete="organization" required maxLength={120} placeholder="Nome da instituição que você administra" /></label></>}
              <label className="lg-field" htmlFor="lg-email"><span>E-mail</span><div className="lg-input-wrap"><Mail size={18} /><input id="lg-email" name="email" type="email" autoComplete={isRegister ? "email" : "username"} autoCapitalize="none" spellCheck={false} required maxLength={254} placeholder="Digite seu e-mail" /></div></label>
              <label className="lg-field" htmlFor="lg-password"><span>Senha</span><div className="lg-input-wrap"><LockKeyhole size={18} /><input id="lg-password" name="password" type={showPassword ? "text" : "password"} autoComplete={isRegister ? "new-password" : "current-password"} required minLength={isRegister ? 10 : 1} maxLength={128} aria-describedby={isRegister ? "lg-password-hint" : undefined} placeholder={isRegister ? "Pelo menos 10 caracteres" : "Digite sua senha"} /><button type="button" className="lg-password-toggle" aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={19} /> : <Eye size={19} />}</button></div>{isRegister && <small id="lg-password-hint">Use entre 10 e 128 caracteres.</small>}</label>
            </>}
          </fieldset>
          {error && <div className="lg-error" role="alert" tabIndex={-1} ref={errorRef}><p>{error}</p></div>}{notice && <div className="lg-session-notice" role="status"><p>{notice}</p><Link prefetch={false} href="/plataforma">Continuar na conta conectada<ArrowRight size={15} /></Link></div>}
          <button className="lg-submit" type="submit" disabled={busy}>{busy ? <><LoaderCircle size={19} className="lg-spinner" />{isRegister ? "Criando a escola..." : "Entrando..."}</> : <>{isRegister ? "Cadastrar escola e continuar" : isStudent ? "Entrar com meu código" : "Entrar com e-mail e senha"}<ArrowRight size={19} /></>}</button>
          {!isRegister && <p className="lg-account-note">{isStudent ? "Depois de entrar, você encontrará sua próxima atividade." : "Depois de entrar, a plataforma abre o espaço da sua conta."}</p>}
        </form>
        <details className="lg-help" open><summary>{isRegister ? "O que acontece depois do cadastro?" : isStudent ? "Não tenho meu código" : "Não tenho acesso ou esqueci a senha"}<ChevronDown size={16} /></summary><div><p>{isRegister ? "Você entrará como administrador. Comece criando uma turma e cadastrando os estudantes. A equipe da escola também organiza os acessos de professores e responsáveis." : isStudent ? "Não encontrou seu código? Peça ao professor ou à secretaria da escola. Se um novo código foi emitido, use a versão mais recente." : "Peça ajuda à secretaria ou à pessoa que administra a Letria na escola. Professores e responsáveis recebem dela seu e-mail de acesso e sua senha inicial."}</p></div></details>
        <div className="lg-create-link eg-school-link">{isRegister ? <><span>Já recebeu um acesso da escola?</span><Link prefetch={false} href="/login">Entrar na Letria<ArrowRight size={15} /></Link></> : <><span>Vai administrar uma escola nova?</span><Link prefetch={false} href="/login?modo=cadastro">Cadastrar uma nova escola<ArrowRight size={15} /></Link></>}</div>
      </div>
      <footer className="lg-access-footer"><span><Sparkles size={14} />Cada descoberta importa.</span><Link prefetch={false} href="/">letria</Link></footer>
    </section>
  </main>;
}
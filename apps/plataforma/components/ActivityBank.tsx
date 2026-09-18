"use client";

import { useMemo, useState } from "react";
import { ArrowRight, BookOpen, Check, Copy, Eye, Heart, Library, Pencil, Search, SlidersHorizontal, Sparkles, Target, Trash2, X } from "lucide-react";
import { worlds, type Activity, type Question } from "@/lib/content";
import { areaLabels, filterActivityCatalog, formatLabels, getActivityMetadata, levelLabels } from "@/lib/activity-catalog";
import type { BankArea } from "@/lib/activity-bank";
import type { CustomActivity } from "@/lib/types";
import "./activity-bank.css";

type Props = {
  activities: Activity[]; customActivities: CustomActivity[]; favorites: string[]; busy: boolean;
  onFavorite: (id: string) => void; onPlay: (activity: Activity) => void; onAssign: (activity: Activity) => void;
  onEdit: (activity: CustomActivity) => void; onCopy: (activity: Activity) => void;
  onPublish: (activity: CustomActivity) => void; onDelete: (activity: CustomActivity) => void;
};
const areas: BankArea[] = ["letters", "sounds", "words", "sentences", "reading", "logic"];
const areaIcons: Record<BankArea, string> = { letters: "🔤", sounds: "🎵", words: "🧩", sentences: "✏️", reading: "📚", logic: "🤖" };
const questionTypes: Record<Question["type"], string> = { choice: "Escolha uma resposta", order: "Coloque em ordem", multi: "Selecione todas as corretas", match: "Associe os pares" };
type Filters = { search: string; area: string; format: string; level: string; world: string };
const emptyFilters: Filters = { search: "", area: "", format: "", level: "", world: "" };

function Review({ activity }: { activity: Activity }) {
  const metadata = getActivityMetadata(activity);
  return <details className="bank-review">
    <summary><BookOpen size={15} />Planejar e ver gabarito<span aria-hidden="true">+</span></summary>
    <div className="bank-review-content">
      <h3>Objetivo da proposta</h3><p>{metadata.objective}</p>
      <div className="bank-teacher-tip"><Sparkles size={17} /><div><strong>Para mediar a descoberta</strong><p>{metadata.teacherTip}</p></div></div>
      <h3>Desafios e respostas</h3>
      <p className="bank-review-hint">Gabarito para revisão do professor. Em Explorar, você vivencia a atividade como o estudante.</p>
      <ol className="bank-question-list">{activity.questions.map(question => <li key={question.id}>
        <small>{questionTypes[question.type]}</small><h4>{question.prompt}</h4>
        {question.visual && <span className="bank-question-visual" aria-hidden="true">{question.visual}</span>}
        {question.stimulus && <p className="bank-question-stimulus">{question.stimulus}</p>}
        <div className="bank-question-options">{question.options.map((option, index) => <span key={index}>{option}</span>)}</div>
        {question.type === "match" && question.matches && <div className="bank-question-options"><small>Coluna direita:</small>{question.matches.map((match, index) => <span key={index}>{match}</span>)}</div>}
        <div className="bank-answer"><Check size={14} /><div><strong>Gabarito</strong>{question.type === "match" && Array.isArray(question.answer) ? <ul>{question.options.map((option, index) => <li key={index}>{option} → {question.answer[index]}</li>)}</ul> : <p>{Array.isArray(question.answer) ? question.answer.join(question.type === "order" ? " → " : "; ") : question.answer}</p>}</div></div>
        <p className="bank-explanation">{question.explanation}</p>
      </li>)}</ol>
    </div>
  </details>;
}

export default function ActivityBank({ activities, customActivities, favorites, busy, onFavorite, onPlay, onAssign, onEdit, onCopy, onPublish, onDelete }: Props) {
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [collection, setCollection] = useState("all");
  const [limit, setLimit] = useState(12);
  const customById = useMemo(() => new Map(customActivities.map(activity => [activity.id, activity])), [customActivities]);
  const counts = useMemo(() => {
    const byArea = Object.fromEntries(areas.map(area => [area, 0])) as Record<BankArea, number>;
    let questions = 0;
    for (const activity of activities) { byArea[getActivityMetadata(activity).area] += 1; questions += activity.questions.length; }
    return { byArea, questions, formats: new Set(activities.map(activity => getActivityMetadata(activity).format)).size };
  }, [activities]);
  const filtered = useMemo(() => filterActivityCatalog(activities.filter(activity => collection === "custom" ? customById.has(activity.id) : collection === "favorites" ? favorites.includes(activity.id) : true), { search: filters.search, area: filters.area, format: filters.format, level: filters.level, worldId: filters.world ? Number(filters.world) : undefined }), [activities, collection, customById, favorites, filters]);
  const hasFilters = Object.values(filters).some(Boolean) || collection !== "all";
  function filter(patch: Partial<Filters>) { setFilters(current => ({ ...current, ...patch })); setLimit(12); }
  function reset() { setFilters(emptyFilters); setCollection("all"); setLimit(12); }
  const tabs = [ { id: "all", label: "Todo o banco", icon: Library, count: activities.length }, { id: "custom", label: "Minhas criações", icon: Pencil, count: customActivities.length }, { id: "favorites", label: "Favoritas", icon: Heart, count: activities.filter(activity => favorites.includes(activity.id)).length } ];
  return <div className="activity-bank">
    <section className="bank-welcome" aria-labelledby="bank-title">
      <div className="bank-welcome-copy"><span className="eyebrow"><Sparkles size={14} /> MAIS JEITOS DE APRENDER</span><h2 id="bank-title">Uma nova descoberta a cada desafio</h2><p>Combine letras, histórias e lógica. Escolha a habilidade, confira a proposta e prepare a próxima missão da turma.</p></div>
      <div className="bank-overview" aria-label="Conteúdo do banco"><div><strong>{activities.length}</strong><span>atividades</span></div><div><strong>{counts.questions}</strong><span>desafios</span></div><div><strong>{counts.formats}</strong><span>formatos</span></div></div>
    </section>
    <section className="bank-area-section" aria-labelledby="bank-area-title"><div className="bank-section-heading"><h3 id="bank-area-title">O que vamos desenvolver?</h3><span>Explore por área</span></div><div className="bank-areas">{areas.map(area => <button key={area} className={`bank-area bank-area-${area}${filters.area === area ? " selected" : ""}`} aria-pressed={filters.area === area} onClick={() => filter({ area: filters.area === area ? "" : area })}><span className="bank-area-icon" aria-hidden="true">{areaIcons[area]}</span><strong>{areaLabels[area]}</strong><small>{counts.byArea[area]} atividades</small>{filters.area === area && <Check size={16} className="bank-area-check" />}</button>)}</div></section>
    <div className="bank-toolbar"><div className="ed-tabs" aria-label="Coleção de atividades">{tabs.map(tab => <button key={tab.id} className={collection === tab.id ? "active" : ""} aria-pressed={collection === tab.id} onClick={() => { setCollection(tab.id); setLimit(12); }}><tab.icon size={16} />{tab.label}<span className="bank-tab-count">{tab.count}</span></button>)}</div>
      <div className="bank-filters"><label className="ed-search bank-search"><Search size={18} /><input aria-label="Buscar por atividade, habilidade ou objetivo" value={filters.search} onChange={event => filter({ search: event.target.value })} placeholder="Busque uma atividade, habilidade ou objetivo..." />{filters.search && <button aria-label="Limpar busca" onClick={() => filter({ search: "" })}><X size={16} /></button>}</label>
        <div className="bank-selects"><label><span><SlidersHorizontal size={13} />Formato</span><select className="ed-filter" value={filters.format} onChange={event => filter({ format: event.target.value })}><option value="">Todos os formatos</option>{Object.entries(formatLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label><span>Nível</span><select className="ed-filter" value={filters.level} onChange={event => filter({ level: event.target.value })}><option value="">Todos os níveis</option>{Object.entries(levelLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label><span>Mundo</span><select className="ed-filter" value={filters.world} onChange={event => filter({ world: event.target.value })}><option value="">Todos os mundos</option>{worlds.map(world => <option key={world.id} value={world.id}>{world.title}</option>)}</select></label></div>
      </div>
      <div className="bank-results"><p role="status" aria-live="polite"><strong>{filtered.length}</strong> {filtered.length === 1 ? "atividade encontrada" : "atividades encontradas"}{filters.area && <> em <strong>{areaLabels[filters.area as BankArea]}</strong></>}</p>{hasFilters && <button className="ed-text-button" onClick={reset}><X size={14} />Limpar filtros</button>}</div>
      {collection === "favorites" && <p className="ed-muted">Suas favoritas ficam salvas neste dispositivo.</p>}
    </div>
    <div className="ed-activity-grid bank-grid">{filtered.slice(0, limit).map(activity => {
      const custom = customById.get(activity.id); const metadata = getActivityMetadata(activity); const favorite = favorites.includes(activity.id);
      return <article className="panel ed-activity-card bank-card" key={activity.id}>
        <div className={`ed-activity-art bank-art bank-area-${metadata.area}`}><span className="ed-activity-world">{areaLabels[metadata.area]}</span><span className="ed-game-visual" aria-hidden="true">{areaIcons[metadata.area]}</span><span className="ed-decoration d1" aria-hidden="true">✦</span><span className="ed-decoration d2" aria-hidden="true">+</span><button className={favorite ? "ed-favorite selected" : "ed-favorite"} aria-pressed={favorite} aria-label={`${favorite ? "Remover dos" : "Adicionar aos"} favoritos: ${activity.title}`} onClick={() => onFavorite(activity.id)}><Heart size={18} fill={favorite ? "currentColor" : "none"} /></button></div>
        <div className="ed-activity-body"><div className="ed-activity-tags bank-tags"><span>{formatLabels[metadata.format]}</span><span className={`bank-level bank-level-${metadata.level}`}>{levelLabels[metadata.level]}</span>{custom && <span className={custom.status === "draft" ? "ed-draft-tag" : "ed-published-tag"}>{custom.status === "draft" ? "Rascunho" : `Publicada · v${custom.version}`}</span>}</div><h2>{activity.title}</h2><p>{activity.description}</p><span className="ed-skill"><Target size={14} />{activity.skill}</span><div className="ed-activity-meta"><span>{activity.durationMinutes} min</span><span>{activity.questions.length} desafios</span><span>✦ {activity.xp} XP</span></div>
          <div className="ed-activity-actions"><button className="btn btn-secondary" aria-label={`Explorar ${activity.title}`} onClick={() => onPlay(activity)}><Eye size={15} />Explorar</button>{custom?.status === "draft" ? <button disabled={busy} className="btn btn-primary" onClick={() => onPublish(custom)}>Publicar<Check size={15} /></button> : <button className="btn btn-primary" aria-label={`Propor ${activity.title} à turma`} onClick={() => onAssign(activity)}>Propor<ArrowRight size={15} /></button>}</div>
          <Review activity={activity} />
          <div className="bank-author-actions"><button className="ed-text-button" onClick={() => onCopy(activity)} aria-label={`Usar ${activity.title} como modelo`}><Copy size={14} />Usar como modelo</button>{custom && <div><button className="ed-icon-button" title="Editar atividade" aria-label={`Editar ${activity.title}`} onClick={() => onEdit(custom)}><Pencil size={16} /></button><button className="ed-icon-button" title="Excluir atividade" aria-label={`Excluir ${activity.title}`} onClick={() => onDelete(custom)}><Trash2 size={16} /></button></div>}</div>
        </div>
      </article>;
    })}</div>
    {!filtered.length && <div className="ed-empty bank-empty"><div className="ed-empty-icon"><Search size={28} /></div><h3>{collection === "custom" && !customActivities.length ? "Suas ideias têm lugar aqui" : "Vamos encontrar outro caminho?"}</h3><p>{collection === "custom" && !customActivities.length ? "Crie uma atividade no topo da página ou use uma proposta do banco como modelo." : collection === "favorites" && !favorites.length ? "Toque no coração de uma atividade para guardar suas propostas preferidas." : "Nenhuma proposta combina com os filtros selecionados. Experimente outra habilidade ou amplie a busca."}</p><button className="btn btn-secondary" onClick={reset}>Ver todo o banco<ArrowRight size={16} /></button></div>}
    {filtered.length > limit && <div className="bank-load-more"><p>Mostrando {Math.min(limit, filtered.length)} de {filtered.length} atividades</p><button className="btn btn-secondary" onClick={() => setLimit(current => current + 12)}>Mostrar mais atividades<ArrowRight size={16} /></button></div>}
  </div>;
}
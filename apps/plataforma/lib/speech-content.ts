import type { Activity, Question } from './content';
import { getWorldTheme } from './world-themes';

export interface PreparedSpeech { input: string; profile: 'reading' | 'conversation'; pace: 'natural' | 'calm' }
export const LUMI_HELLO = 'Oi! O que vamos descobrir juntos?';
export const LUMI_THANKS = 'De nada! Estou aqui para ajudar. Vamos continuar nossa descoberta?';
export const LUMI_PREVIEW = 'Oi! Eu sou a Lumi. Vamos descobrir um mundo de palavras? Pode ir com calma. Eu vou acompanhar você, um passo de cada vez.';
export function lumiGreeting(context: 'general' | 'question' | 'computational' = 'general'): string {
  return 'Oi! Eu sou a Lumi, sua corujinha guia. ' + (context === 'question'
    ? 'Qual pedacinho deste desafio você quer entender?'
    : context === 'computational' ? 'Vamos organizar ideias, encontrar padrões e explorar a ilha da lógica?'
      : 'Posso ajudar com palavras e mostrar como explorar as ilhas.');
}

/** Only complete, unambiguous social phrases bypass the tutor. */
export function preparedTutorReply(message: string): string | undefined {
  const normalized = message.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[!?,.;:]/g, ' ').replace(/\s+/g, ' ').trim();
  if (/^(oi|ola|bom dia|boa tarde|boa noite)( lumi)?$/.test(normalized)) return LUMI_HELLO;
  if (/^(obrigado|obrigada|muito obrigado|muito obrigada)( lumi)?$/.test(normalized)) return LUMI_THANKS;
}
export function questionSpeechText(question: Pick<Question, 'audioText' | 'prompt' | 'stimulus'>): string {
  return question.audioText || [question.prompt, question.stimulus].filter(Boolean).join('. ');
}
export function uniqueSpeech(items: PreparedSpeech[]): PreparedSpeech[] {
  const seen = new Set<string>();
  return items.filter(item => {
    if (!item.input.trim() || item.input.length > 2400) return false;
    const key = JSON.stringify([item.input.trim(), item.profile, item.pace]);
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}
export function commonSpeech(): PreparedSpeech[] {
  return uniqueSpeech([LUMI_HELLO, LUMI_THANKS, lumiGreeting(), lumiGreeting('question'), lumiGreeting('computational'), LUMI_PREVIEW]
    .map(input => ({ input, profile: 'conversation', pace: 'natural' })));
}
export function activitySpeech(activity: Pick<Activity, 'worldId' | 'questions'>): PreparedSpeech[] {
  return uniqueSpeech([getWorldTheme(activity.worldId).gameIntro, ...activity.questions.map(questionSpeechText)]
    .map(input => ({ input, profile: 'reading', pace: 'natural' })));
}

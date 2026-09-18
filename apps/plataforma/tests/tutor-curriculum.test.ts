import test from 'node:test';
import assert from 'node:assert/strict';
import { localTutorReply, tutorInstructions } from '../lib/tutor';

test('Lumi gives distinct contextual guidance for the new data structures', () => {
  const context = { topic: 'computational' } as const;
  assert.match(localTutorReply('Como encontro a coordenada na matriz?', context), /linha, depois a coluna/);
  assert.match(localTutorReply('Como mudo uma ficha?', context), /apenas o campo/);
  assert.match(localTutorReply('Como organizo a lista?', context), /acrescentar, retirar/);
  assert.match(localTutorReply('O que são grafos?', context), /precisa seguir essas ligações/);
});

test('Lumi distinguishes stopping conditions, conditional branches and nested repetitions', () => {
  const context = { topic: 'computational' } as const;
  assert.match(localTutorReply('Como funciona enquanto?', context), /Antes de cada passo/);
  assert.match(localTutorReply('Como uso senão?', context), /duas situações/);
  assert.match(localTutorReply('Como programar repetições aninhadas?', context), /por dentro e por fora/);
  assert.match(localTutorReply('Como repetir?', context), /ação e a quantidade/);
});

test('logical OR is inclusive and curriculum guidance preserves literacy context', () => {
  assert.match(localTutorReply('Como decido verdadeiro ou falso?', { topic: 'computational' }), /OU aceita uma ou as duas verdadeiras/);
  assert.match(localTutorReply('Como corrigir uma frase?'), /Uma frase conta uma ideia/);
  assert.match(tutorInstructions(), /matrizes, registros, listas, grafos/);
  assert.match(tutorInstructions(), /Não entregue o gabarito/);
});

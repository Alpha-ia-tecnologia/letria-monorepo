import test from 'node:test';
import assert from 'node:assert/strict';
import {localTutorReply,tutorInstructions} from '../lib/tutor';

test('Lumi explains the four computational thinking skills with child-friendly hints',()=>{
  assert.match(localTutorReply('Como dividir uma tarefa?'), /partes menores/);
  assert.match(localTutorReply('O que é um padrão?'), /repete/);
  assert.match(localTutorReply('Como programar o robô?'), /uma de cada vez/);
  assert.match(localTutorReply('Como corrigir um passo?'), /trocar só esse passo/);
  assert.match(localTutorReply('O que é pensamento computacional?'), /organizar ideias/);
});
test('new logic hints preserve literacy corrections and the real island unlocking rule',()=>{
  assert.match(localTutorReply('Como corrigir uma frase?'), /Uma frase conta uma ideia/);
  assert.match(localTutorReply('Como crescem as ilhas?'), /quatro territórios/);
  assert.match(localTutorReply('Como crescem as ilhas?'), /lógica é uma exploração livre/);
  assert.match(localTutorReply('Como avanço na trilha?'), /4 dos 5/);
});
test('AI tutor includes computational thinking while retaining its educational boundaries',()=>{
  const instructions=tutorInstructions();
  assert.match(instructions, /pensamento computacional infantil/);
  assert.match(instructions, /Não entregue o gabarito/);
  assert.match(instructions, /não altere notas e não prometa desbloqueios/);
});
test('generic help follows computational context online and offline',()=>{
  assert.match(localTutorReply('Como faço esta atividade?',{topic:'computational'}), /ilha da lógica/);
  assert.doesNotMatch(localTutorReply('Como faço esta atividade?',{topic:'computational'}), /sílaba/);
});

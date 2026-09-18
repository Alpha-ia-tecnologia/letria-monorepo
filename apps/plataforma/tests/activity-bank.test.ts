import { getActivityTheme } from '../lib/activity-theme';
import test from 'node:test';
import assert from 'node:assert/strict';
import { activities, worlds } from '../lib/content';
import { supplementalActivities } from '../lib/activity-bank';
import { activityCatalog, areaLabels, formatLabels, levelLabels, filterActivityCatalog, getActivityMetadata, getCatalogActivity } from '../lib/activity-catalog';
import { evaluateAnswer, deriveStudentProgress } from '../lib/pedagogy';
import { getJourney } from '../lib/journey';

test('expanded bank has 56 activities, 244 challenges, six balanced areas and varied formats', () => {
  assert.equal(activityCatalog.length, 56);
  assert.equal(supplementalActivities.length, 36);
  assert.equal(activityCatalog.flatMap(activity => activity.questions).length, 244);
  assert.equal(new Set(activityCatalog.map(activity => activity.id)).size, activityCatalog.length);
  const questions = activityCatalog.flatMap(activity => activity.questions);
  assert.equal(new Set(questions.map(question => question.id)).size, questions.length);
  for (const area of Object.keys(areaLabels)) assert.equal(supplementalActivities.filter(activity => activity.area === area).length, 6);
  assert.deepEqual(new Set(supplementalActivities.map(activity => activity.format)), new Set(Object.keys(formatLabels)));
  assert.deepEqual(new Set(supplementalActivities.map(activity => activity.level)), new Set(Object.keys(levelLabels)));
  for (const type of ['multi', 'match']) assert.ok(supplementalActivities.filter(activity => activity.questions.some(question => question.type === type)).length >= 4);
});

test('every supplemental answer key is playable, unique and gradeable', () => {
  for (const activity of supplementalActivities) {
    assert.ok(worlds.some(world => world.id === activity.worldId), activity.id);
    assert.ok(activity.title && activity.description && activity.objective && activity.teacherTip && activity.skill, activity.id);
    assert.equal(activity.questions.length, 4, activity.id);
    assert.equal(activity.type, activity.questions[0].type, activity.id);
    assert.ok(activity.durationMinutes >= 1 && activity.durationMinutes <= 30);
    for (const question of activity.questions) {
      assert.ok(question.prompt && question.explanation, question.id);
      assert.ok(question.options.length >= 2 && question.options.length <= 8, question.id);
      assert.equal(new Set(question.options).size, question.options.length, question.id);
      assert.equal(evaluateAnswer(question, question.answer), true, question.id);
      assert.equal(evaluateAnswer(question, undefined), false, question.id);
      if (question.type === 'choice') {
        assert.equal(typeof question.answer, 'string', question.id);
        assert.ok(question.options.includes(question.answer as string), question.id);
      } else {
        assert.ok(Array.isArray(question.answer), question.id);
        assert.equal(new Set(question.answer).size, question.answer.length, question.id);
        if (question.type === 'multi') {
          assert.ok(question.answer.length >= 2 && question.answer.length < question.options.length, question.id);
          assert.ok(question.answer.every(item => question.options.includes(item)), question.id);
          assert.equal(evaluateAnswer(question, [...question.answer].reverse()), true, question.id);
        } else {
          const choices = question.type === 'match' ? question.matches! : question.options;
          assert.equal(choices.length, question.options.length, question.id);
          assert.equal(new Set(choices).size, choices.length, question.id);
          assert.deepEqual([...question.answer].sort(), [...choices].sort(), question.id);
          assert.equal(evaluateAnswer(question, [...question.answer].reverse()), false, question.id);
        }
      }
    }
  }
});

test('library combines accent-insensitive search, area, format, level and world filters', () => {
  for (const activity of activityCatalog) assert.equal(getCatalogActivity(activity.id), activity);
  assert.equal(getCatalogActivity('unknown'), undefined);
  assert.equal(filterActivityCatalog(activityCatalog, { area: 'logic' }).length, 6);
  const logical = supplementalActivities.find(activity => activity.area === 'logic')!;
  const meta = getActivityMetadata(logical);
  const result = filterActivityCatalog(activityCatalog, { area: meta.area, format: meta.format, level: meta.level, worldId: logical.worldId, search: '  PENSAMENTO   COMPUTACIONAL  ' });
  assert.ok(result.some(activity => activity.id === logical.id));
  assert.ok(filterActivityCatalog(activityCatalog, { search: 'silabas' }).length > 0);
  assert.equal(filterActivityCatalog(activityCatalog, { area: 'logic', worldId: 5 }).length, 0);
  assert.equal(filterActivityCatalog(activityCatalog, { search: 'naoexiste123' }).length, 0);
});

test('extra missions reward learning without unlocking or moving island trail territories', () => {
  const progress = deriveStudentProgress(supplementalActivities.map((activity, index) => ({
    activityId: activity.id, completedAt: new Date(Date.UTC(2026, 8, 16, 12, index)).toISOString(), xpEarned: activity.xp,
    answers: Object.fromEntries(activity.questions.map(question => [question.id, question.answer])),
  })));
  const journey = getJourney(progress);
  assert.equal(journey.nodes.length, 20);
  assert.equal(journey.next?.activity.id, activities[0].id);
  assert.deepEqual(progress.unlockedWorldIds, [1]);
  assert.equal(progress.xp, supplementalActivities.reduce((total, activity) => total + activity.xp, 0));
});


test('computational bank missions use their own island environment', () => {
  const logic = supplementalActivities.filter(activity => activity.area === 'logic');
  for (const activity of logic) {
    assert.equal(getActivityTheme(activity).name, 'Ilha da Lógica');
    assert.equal(getActivityTheme(activity).image, '/art/ecosystem-logic.png');
  }
  for (const activity of activities) assert.equal(getActivityTheme(activity).id, activity.worldId);
});

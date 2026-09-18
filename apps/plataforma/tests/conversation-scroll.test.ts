import test from 'node:test';
import assert from 'node:assert/strict';
import { createConversationScroll } from '../lib/conversation-scroll';

function fixture() {
  const viewport = {
    scrollHeight: 1000, clientHeight: 400, scrollTop: 0,
    scrollTo({ top = 0 }: ScrollToOptions) { this.scrollTop = Math.max(0, Math.min(top, this.scrollHeight - this.clientHeight)); },
  };
  const scroll = createConversationScroll();
  scroll.connect(viewport);
  scroll.update('greeting', 'assistant');
  return { viewport, scroll };
}

test('a newly sent message becomes visible even while reading earlier messages', () => {
  const { viewport, scroll } = fixture();
  viewport.scrollTop = 150;
  scroll.scrolled();
  viewport.scrollHeight = 1300;
  scroll.update('sent', 'user');
  assert.equal(viewport.scrollTop, 900);
  assert.equal(scroll.getSnapshot(), false);
});

test('new replies keep earlier messages in place and offer a latest-message action', () => {
  const { viewport, scroll } = fixture();
  viewport.scrollTop = 150;
  scroll.scrolled();
  viewport.scrollHeight = 1300;
  scroll.update('reply', 'assistant');
  assert.equal(viewport.scrollTop, 150);
  assert.equal(scroll.getSnapshot(), true);
  scroll.latest();
  assert.equal(viewport.scrollTop, 900);
  assert.equal(scroll.getSnapshot(), false);
});

test('resizing for fullscreen preserves the reader position or follows the newest message', () => {
  const { viewport, scroll } = fixture();
  viewport.clientHeight = 600;
  scroll.resized();
  assert.equal(viewport.scrollTop, 400);
  viewport.scrollTop = 100;
  scroll.scrolled();
  viewport.clientHeight = 300;
  scroll.resized();
  assert.equal(viewport.scrollTop, 100);
});

test('manually reaching the bottom clears the indicator and resumes automatic following', () => {
  const { viewport, scroll } = fixture();
  viewport.scrollTop = 50;
  scroll.scrolled();
  viewport.scrollHeight = 1400;
  scroll.update('reply', 'assistant');
  viewport.scrollTop = 1000;
  scroll.scrolled();
  assert.equal(scroll.getSnapshot(), false);
  viewport.scrollHeight = 1600;
  scroll.update('reply2', 'assistant');
  assert.equal(viewport.scrollTop, 1200);
});

test('starting a new conversation clears pending-message state', () => {
  const { viewport, scroll } = fixture();
  viewport.scrollTop = 50;
  scroll.scrolled();
  scroll.update('unread', 'assistant');
  scroll.update(null);
  assert.equal(scroll.getSnapshot(), false);
  assert.equal(viewport.scrollTop, 600);
});

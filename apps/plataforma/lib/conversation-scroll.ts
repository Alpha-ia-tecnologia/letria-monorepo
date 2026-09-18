type ConversationViewport = {
  readonly scrollHeight: number;
  readonly clientHeight: number;
  readonly scrollTop: number;
  scrollTo: (options: ScrollToOptions) => void;
};

/** Follow the conversation unless the reader has chosen to inspect earlier messages. */
export function createConversationScroll() {
  let viewport: ConversationViewport | null = null;
  let following = true;
  let unread = false;
  let lastMessage: string | null = null;
  const listeners = new Set<() => void>();

  function notify(value: boolean) {
    if (value === unread) return;
    unread = value;
    listeners.forEach(listener => listener());
  }
  function latest() {
    following = true;
    viewport?.scrollTo({ top: viewport.scrollHeight, behavior: 'instant' });
    notify(false);
  }
  return {
    getSnapshot: () => unread,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    connect(element: ConversationViewport) {
      viewport = element;
      latest();
      return () => { viewport = null; };
    },
    scrolled() {
      if (!viewport) return;
      following = viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop <= 48;
      if (following) notify(false);
    },
    update(id: string | null, role?: 'assistant' | 'user') {
      const changed = id !== lastMessage;
      lastMessage = id;
      if (id === null || (changed && role === 'user')) following = true;
      if (following) latest();
      else if (changed) notify(true);
    },
    resized() { if (following) latest(); },
    latest,
  };
}

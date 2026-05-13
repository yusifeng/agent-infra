const DEFAULT_THREAD_TITLE = 'New Thread';

export function isDefaultThreadTitle(title: string | null | undefined) {
  if (title == null) {
    return true;
  }

  const normalizedTitle = title.trim();
  return normalizedTitle.length === 0 || normalizedTitle === DEFAULT_THREAD_TITLE;
}

export function getDefaultThreadTitle() {
  return DEFAULT_THREAD_TITLE;
}

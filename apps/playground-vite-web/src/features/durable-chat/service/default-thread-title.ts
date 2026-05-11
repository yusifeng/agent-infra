export function isDefaultThreadTitle(title: string | null | undefined) {
  const normalizedTitle = title?.trim() ?? '';
  return normalizedTitle.length === 0 || normalizedTitle === 'New Thread';
}

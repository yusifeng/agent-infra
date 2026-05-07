type WriteClipboardTextOptions = {
  trim?: boolean;
  clipboard?: Pick<Clipboard, 'writeText'> | null;
};

export async function writeClipboardText(text: string, options: WriteClipboardTextOptions = {}) {
  const { trim = true, clipboard = resolveClipboard() } = options;
  const value = trim ? text.trim() : text;
  if (!value || !clipboard) {
    return false;
  }

  await clipboard.writeText(value);
  return true;
}

function resolveClipboard() {
  if (typeof navigator === 'undefined' || !navigator.clipboard) {
    return null;
  }

  return navigator.clipboard;
}

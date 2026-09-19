/**
 * Copy text to the clipboard.
 *
 * `navigator.clipboard` needs a secure context and can be denied, so a failure
 * falls back to a temporary textarea. The app is often opened from `file://` or
 * a local preview server, where the modern API is not always available.
 *
 * Returns whether the text made it, so callers can say so rather than claim
 * success blindly.
 */
export const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Denied or unavailable; try the legacy path below.
  }

  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '-1000px';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(area);
    return copied;
  } catch {
    return false;
  }
};

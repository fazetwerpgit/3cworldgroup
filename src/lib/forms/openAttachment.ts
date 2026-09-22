// Opens a signed attachment URL in a new tab in a way iOS Safari's popup blocker
// allows. Safari only permits window.open synchronously inside the user gesture,
// and drops one made after an await. So: open a blank tab right away (this MUST
// be called directly from the click handler, before any await), then point it at
// the URL once it resolves; close it again if there is nothing to show.
export async function openAttachmentInNewTab(
  resolveUrl: () => Promise<string | null>
): Promise<void> {
  const tab = window.open('', '_blank');
  try {
    const url = await resolveUrl();
    if (!url) {
      tab?.close();
      return;
    }
    if (tab) {
      tab.opener = null; // equivalent of 'noopener' for a tab we opened ourselves
      tab.location.href = url;
    } else {
      // Blank tab was blocked anyway (e.g. strict popup settings): best effort.
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  } catch (error) {
    tab?.close();
    console.error('Failed to open attachment:', error);
  }
}

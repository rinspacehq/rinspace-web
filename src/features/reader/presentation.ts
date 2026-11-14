const PANEL_WIDTH_KEY = 'rinspace.reader.panel-width.v1';

// Device-wide presentation only: no document, account, message or capability
// data enters this preference. Reader content keeps its existing IndexedDB path.
export const readerPresentation = {
  panelWidth(): number | undefined {
    try {
      const value = localStorage.getItem(PANEL_WIDTH_KEY);
      if (value === null) return undefined;
      const width = Number(value);
      return Number.isFinite(width) && width >= 320 && width <= 800 ? Math.round(width) : undefined;
    } catch { return undefined; }
  },
  savePanelWidth(width: number): void {
    if (!Number.isFinite(width)) return;
    try { localStorage.setItem(PANEL_WIDTH_KEY, String(Math.round(Math.max(320, Math.min(800, width))))); }
    catch { /* Storage restrictions must not interrupt a reading session. */ }
  },
};

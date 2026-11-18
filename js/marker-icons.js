export const MARK_PATHS = {
  pain: 'M13 3 6 13h6l-1 8 7-11h-6z',
  click: 'M9 8a6 6 0 0 1 0 8M14 4a11 11 0 0 1 0 16M5 11v2',
  pull: 'M5 19 19 5M10 5h9v9',
  unstable: 'M12 3 2 21h20zM12 9v5M12 17v1',
};
export const markerIcon = type => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${MARK_PATHS[type]}"/></svg>`;

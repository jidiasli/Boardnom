// All tunable constants live here.
export const CFG = {
  gridSize: 40,
  minZoom: 0.05,
  maxZoom: 16,

  colors: ['#1a1a2e', '#e03131', '#f08c00', '#fab005', '#2f9e44', '#1971c2', '#7048e8', '#d6336c', '#868e96', '#ffffff'],
  stickyColors: ['#ffe066', '#ffa8a8', '#99e9f2', '#b2f2bb', '#ffd8a8', '#d0bfff'],

  // Thickness is a continuous slider (not presets).
  width: { min: 1, max: 60, step: 0.5, default: 4 },
  fontSize: { min: 10, max: 120, step: 1, default: 24 },
  highlighterMultiplier: 3,
  highlighterAlpha: 0.35,

  patchSendMs: 40, // how often drag/resize updates are flushed to the server
  cursorSendMs: 50,
  maxImageDim: 1600, // pasted images are downscaled to this on the long side
  maxImageBytes: 5 * 1024 * 1024,
  stickySize: { w: 220, h: 180 },
  stickyTextColor: '#1f2330',
};

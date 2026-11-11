const wrap = (body) => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  select: wrap('<path d="M5 3.5l13 7.5-6 1.6L9.3 19 5 3.5z"/>'),
  hand: wrap('<path d="M8 13V6.5a1.5 1.5 0 013 0V11M11 10.5V4.5a1.5 1.5 0 013 0V11M14 11V6.5a1.5 1.5 0 013 0V14c0 4-2.3 6-5.5 6-2.7 0-3.9-1.5-5.4-4.3l-1.4-2.6a1.4 1.4 0 012.4-1.4L8 13.5"/>'),
  pen: wrap('<path d="M4 20l1.2-4.3L16.4 4.5a2.1 2.1 0 013 3L8.2 18.7 4 20z"/><path d="M14.5 6.5l3 3"/>'),
  highlighter: wrap('<path d="M4 21h8"/><path d="M14.6 3.9l5.5 5.5-8.2 8.2-5.6.7.7-5.6 7.6-8.8z"/><path d="M13 5.5l5.5 5.5"/>'),
  eraser: wrap('<path d="M9 20h10"/><path d="M5.2 14.8l8.6-8.6a2 2 0 012.8 0l2.2 2.2a2 2 0 010 2.8L11 19.8H8l-2.8-2.8a1.5 1.5 0 010-2.2z"/><path d="M9 11.2l5.2 5.2"/>'),
  rect: wrap('<rect x="4" y="6" width="16" height="12" rx="1.5"/>'),
  ellipse: wrap('<ellipse cx="12" cy="12" rx="8.5" ry="6"/>'),
  line: wrap('<path d="M5 19L19 5"/>'),
  arrow: wrap('<path d="M5 19L19 5"/><path d="M10 5h9v9"/>'),
  text: wrap('<path d="M5 7V5h14v2M12 5v14M9 19h6"/>'),
  sticky: wrap('<path d="M5 4h14v10.5L14 20H5V4z"/><path d="M14 20v-5.5h5"/>'),
  image: wrap('<rect x="3.5" y="5" width="17" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M4 17l5-5 4 4 2.5-2.5L20 17"/>'),
  paste: wrap('<rect x="6" y="5" width="12" height="15.5" rx="2"/><path d="M9.5 5V3.8h5V5M9 11h6M9 14.5h6"/>'),
  undo: wrap('<path d="M9 14L4 9l5-5"/><path d="M4 9h9a6 6 0 010 12h-2"/>'),
  redo: wrap('<path d="M15 14l5-5-5-5"/><path d="M20 9h-9a6 6 0 000 12h2"/>'),
  trash: wrap('<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v5M14 11v5"/>'),
  fit: wrap('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  share: wrap('<circle cx="18" cy="5.5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="18.5" r="2.5"/><path d="M8.2 10.8l7.6-4M8.2 13.2l7.6 4"/>'),
  plus: wrap('<path d="M12 5v14M5 12h14"/>'),
  minus: wrap('<path d="M5 12h14"/>'),
};

/* ============================================================
   Icons — small inline-SVG icon set (Material-style outline icons,
   currentColor stroked) plus an emoji map for category glyphs.
   Fully offline: no icon font / external file required.
   Icons.svg('home', 22) -> svg markup string
   ============================================================ */

const Icons = (function () {
  const PATHS = {
    home: '<path d="M4 11.5 12 4l8 7.5"/><path d="M6 10v9a1 1 0 0 0 1 1h4v-6h2v6h4a1 1 0 0 0 1-1v-9"/>',
    orders: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 9h8M8 13h8M8 17h5"/>',
    customers: '<circle cx="9" cy="8" r="3"/><path d="M2 20c0-3.3 3-5 7-5s7 1.7 7 5"/><circle cx="17" cy="9" r="2.3"/><path d="M15.5 15.2c2.6.4 4.5 1.8 4.5 4.8"/>',
    reports: '<path d="M5 20V10M11 20V4M17 20v-7"/><path d="M3 20h18"/>',
    more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.3-4.3"/>',
    ready: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9.5"/>',
    backup: '<path d="M7 17a4.5 4.5 0 0 1-1-8.9A5.5 5.5 0 0 1 17.3 8 4 4 0 0 1 17 16"/><path d="M12 11v7M9.5 15.5 12 18l2.5-2.5"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 13a7.6 7.6 0 0 0 0-2l2-1.4-2-3.5-2.3.8a7.7 7.7 0 0 0-1.7-1L15 3h-4l-.4 2.4a7.7 7.7 0 0 0-1.7 1l-2.3-.8-2 3.5L6.6 11a7.6 7.6 0 0 0 0 2l-2 1.4 2 3.5 2.3-.8a7.7 7.7 0 0 0 1.7 1L11 21h4l.4-2.4a7.7 7.7 0 0 0 1.7-1l2.3.8 2-3.5-2-1.4Z"/>',
    back: '<path d="M15 19 6 12l9-7"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    edit: '<path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3Z"/><path d="M14 6l4 4"/>',
    trash: '<path d="M5 7h14M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0-1 13a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1L6 7"/>',
    check: '<path d="M5 13l4.5 4.5L19 8"/>',
    calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M8 3v4M16 3v4"/>',
    money: '<circle cx="12" cy="12" r="9"/><path d="M9 15.5c0 1 1 1.7 3 1.7s3-.8 3-2-1-1.6-3-1.8-3-.7-3-1.8 1-2 3-2 3 .6 3 1.6"/>',
    phone: '<path d="M6.6 4h2.8l1 4-2 1.5a12 12 0 0 0 6 6l1.5-2 4 1v2.8a1.6 1.6 0 0 1-1.7 1.6A15.6 15.6 0 0 1 5 5.7 1.6 1.6 0 0 1 6.6 4Z"/>',
    whatsapp: '<path d="M7 17.5 4.5 20l1-3.6A8 8 0 1 1 9 19Z"/><path d="M9 10c0 3 2.6 5.5 6 5.5" /><path d="M9 10a1 1 0 0 1 1-1h.4l.6 2-1 .7c.4 1 1.2 1.8 2.2 2.2l.7-1 2 .6v.4a1 1 0 0 1-1 1"/>',
    printer: '<rect x="6" y="9" width="12" height="7" rx="1"/><path d="M7 9V4h10v5M8 20h8v-4H8Z"/>',
    qr: '<rect x="4" y="4" width="6" height="6"/><rect x="14" y="4" width="6" height="6"/><rect x="4" y="14" width="6" height="6"/><path d="M14 14h3v3h-3zM19 14v6h-2M14 19h2"/>',
    barcode: '<path d="M4 5v14M8 5v14M11 5v14M15 5v14M17 5v14M20 5v14"/>',
    camera: '<rect x="3" y="7" width="18" height="13" rx="2"/><circle cx="12" cy="13.5" r="3.4"/><path d="M9 7l1.3-2h3.4L15 7"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    language: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a13 13 0 0 1 0 18M12 3a13 13 0 0 0 0 18"/>',
    chevron: '<path d="M9 6l6 6-6 6"/>',
    alert: '<path d="M12 3 2 20h20Z"/><path d="M12 10v4M12 17h.01"/>',
    download: '<path d="M12 4v11M8 11l4 4 4-4"/><path d="M5 19h14"/>',
    upload: '<path d="M12 19V8M8 12l4-4 4 4"/><path d="M5 19h14"/>',
    signature: '<path d="M3 18c2-1 3-3 3.5-5C7 10 8 9 9 10s0 3-1 4.5S6.5 18 8 18s2.5-3 4-5 3 2 5-1"/><path d="M3 20h18"/>',
    user: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6"/>',
    eye: '<path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="2.6"/>',
    eyeOff: '<path d="M3 3l18 18"/><path d="M10.6 5.6A10.6 10.6 0 0 1 12 5.5c6.5 0 10 6.5 10 6.5a15.6 15.6 0 0 1-3.3 4.1M6.3 7.4A15.4 15.4 0 0 0 2 12s3.5 6.5 10 6.5a10.7 10.7 0 0 0 4.2-.85"/><path d="M9.5 10a2.6 2.6 0 0 0 3.6 3.6"/>',
    truck: '<rect x="2" y="8" width="12" height="9" rx="1"/><path d="M14 11h4l3 3v3h-7Z"/><circle cx="6.5" cy="18.5" r="1.6"/><circle cx="17" cy="18.5" r="1.6"/>',
    filter: '<path d="M4 5h16M7 12h10M10 19h4"/>',
    theme: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18Z" fill="currentColor" stroke="none"/>',
    logout: '<path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3"/><path d="M14 8l4 4-4 4M18 12H9"/>',
    scissors: '<circle cx="6" cy="6.5" r="2.3"/><circle cx="6" cy="17.5" r="2.3"/><path d="M20 5 7.6 15.6M20 19 7.6 8.4"/>',
    shirt: '<path d="M8 4 4 7l2.5 3L8 9v11h8V9l1.5 1L20 7l-4-3-2 2h-4Z"/>',
    supplier: '<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M9 8h2M13 8h2M9 12h2M13 12h2M9 16h2M13 16h2"/>',
    purchase: '<circle cx="9" cy="20" r="1.5"/><circle cx="17" cy="20" r="1.5"/><path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.2a2 2 0 0 0 2-1.6L20 8H6"/>',
    inventory: '<path d="M3 8l9-4 9 4-9 4-9-4Z"/><path d="M3 8v9l9 4 9-4V8"/><path d="M12 12v9"/>',
    expense: '<rect x="3" y="7" width="18" height="12" rx="2"/><path d="M3 10h18"/><circle cx="16" cy="14.5" r="1.3"/>'
  };

  function svg(name, size, extraClass) {
    const inner = PATHS[name] || PATHS.alert;
    const s = size || 22;
    return `<svg class="icon${extraClass ? ' ' + extraClass : ''}" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  }

  const CATEGORY_EMOJI = {
    shirt: '👕', pants: '👖', pant: '👖', coat: '🧥', suit: '🤵', blanket: '🛏️',
    curtain: '🪟', bedsheet: '🛌', comforter: '🧣', carpet: '🟫', sofa: '🛋️',
    pillow: '🧺', uniform: '🎽', jacket: '🧥', waistcoat: '🦺', shoes: '👞', others: '📦',
    ladies_suit: '👗', abaya: '🧕', sherwani: '👘', kids: '🧒'
  };
  function categoryEmoji(key) { return CATEGORY_EMOJI[key] || '🧵'; }

  return { svg, categoryEmoji, CATEGORY_EMOJI };
})();

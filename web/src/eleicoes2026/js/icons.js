// Ícones (traço, 24×24, currentColor). Embutidos: sem requisições e sem dependências externas.
const I = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  send: '<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  settings: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  sparkles: '<path d="M11 3l1.9 5.1L18 10l-5.1 1.9L11 17l-1.9-5.1L4 10l5.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  verified: '<path d="M12 3 4.5 6v5.5c0 4.6 3.1 8 7.5 9.5 4.4-1.5 7.5-4.9 7.5-9.5V6z"/><path d="m8.8 12 2.2 2.2 4.2-4.4"/>',
  ballot: '<rect x="4" y="13" width="16" height="8" rx="1.5"/><path d="M8 13V8l5-5 4 4-3 6"/><path d="m9.5 17 1.5 1.5L14 15.5"/>',
  mapPin: '<path d="M12 21s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>',
  mapOff: '<path d="M12 21s7-6.2 7-12a7 7 0 0 0-11.5-5.4M5.4 6.5A7 7 0 0 0 5 9c0 5.8 7 12 7 12"/><path d="m3 3 18 18"/>',
  landmark: '<path d="M3 21h18M5 21V10M9.5 21V10M14.5 21V10M19 21V10M3 10l9-6 9 6z"/>',
  city: '<path d="M4 21V9l6-3v15M10 21V11h10v10M3 21h18M13.5 14h1M17 14h1M13.5 17h1M17 17h1M7 11h0M7 14h0M7 17h0"/>',
  scale: '<path d="M12 3v18M6 21h12M5 7h14"/><path d="m5 7-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0z"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14a5 5 0 0 1 4.5 5"/>',
  trophy: '<path d="M8 4h8v6a4 4 0 0 1-8 0zM8 6H4v2a3 3 0 0 0 4 3M16 6h4v2a3 3 0 0 1-4 3M12 14v4M8 21h8M10 18h4"/>',
  chart: '<path d="M3 21h18M6 21v-9M11 21V4M16 21v-6"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  download: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
  filter: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
  chevDown: '<path d="m6 9 6 6 6-6"/>',
  chevUp: '<path d="m6 15 6-6 6 6"/>',
  person: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  policy: '<path d="M12 3 4.5 6v5.5c0 4.6 3.1 8 7.5 9.5 4.4-1.5 7.5-4.9 7.5-9.5V6z"/>',
  shieldX: '<path d="M12 3 4.5 6v5.5c0 4.6 3.1 8 7.5 9.5 4.4-1.5 7.5-4.9 7.5-9.5V6z"/><path d="m9.5 9.5 5 5M14.5 9.5l-5 5"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 1 1 3.4 2.4c-.6.3-1 .8-1 1.4v.6M12 16.8v.2"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 8v4l3 2"/>',
  share: '<path d="M12 15V3M8 7l4-4 4 4M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  github: '<path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/>'
};

export const ICONES = Object.keys(I);

/** SVG como string (para uso em páginas sem o helper de DOM). */
export function svgIcone(nome, tam = 20) {
  return `<svg class="ic" width="${tam}" height="${tam}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${I[nome] ?? I.info}</svg>`;
}

/** Cria o elemento <svg> do ícone. */
export function icon(nome, tam = 20) {
  const t = document.createElement('template');
  t.innerHTML = svgIcone(nome, tam);
  return t.content.firstChild;
}

// Original comic-style pub patron avatars. Thick outlines, flat gritty colors.
// Each returns an SVG string; usage: Avatars.render(id, sizePx)
(function (global) {
  const INK = '#1a120c';
  const S = 'stroke="' + INK + '" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"';

  function wrap(inner) {
    return '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">' +
      '<circle cx="50" cy="50" r="46" fill="#e9d9ae" ' + S + '/>' + inner + '</svg>';
  }
  const eyes = (dx = 0, dy = 0) =>
    `<circle cx="${40 + dx}" cy="${48 + dy}" r="4" fill="${INK}"/><circle cx="${60 + dx}" cy="${48 + dy}" r="4" fill="${INK}"/>`;

  const AVATARS = {
    wizard: { label: 'Drunk Wizard', svg: wrap(
      `<path d="M50 6 L72 44 L28 44 Z" fill="#5b3f8f" ${S}/>` +
      `<circle cx="58" cy="24" r="3" fill="#f5a623" stroke="none"/>` +
      `<ellipse cx="50" cy="60" rx="22" ry="18" fill="#f0c9a0" ${S}/>` +
      eyes(0, -4) +
      `<path d="M36 66 Q50 96 64 66 L58 92 Q50 98 42 92 Z" fill="#ddd" ${S}/>` +
      `<circle cx="50" cy="56" r="6" fill="#e06a6a" ${S}/>`
    )},
    gnome: { label: 'Biker Gnome', svg: wrap(
      `<path d="M30 40 Q50 2 70 40 Z" fill="#a92c1e" ${S}/>` +
      `<ellipse cx="50" cy="58" rx="20" ry="17" fill="#f0c9a0" ${S}/>` +
      `<rect x="30" y="44" width="40" height="10" rx="5" fill="#333" ${S}/>` +
      `<circle cx="40" cy="49" r="6" fill="#7ec8e3" ${S}/><circle cx="60" cy="49" r="6" fill="#7ec8e3" ${S}/>` +
      `<path d="M34 68 Q50 88 66 68 L60 80 Q50 86 40 80 Z" fill="#eee" ${S}/>`
    )},
    knight: { label: 'Off-Duty Knight', svg: wrap(
      `<path d="M32 30 h36 v28 a18 18 0 0 1 -36 0 Z" fill="#9aa5ad" ${S}/>` +
      `<rect x="30" y="42" width="40" height="8" fill="${INK}"/>` +
      `<circle cx="42" cy="46" r="3" fill="#fff" stroke="none"/><circle cx="58" cy="46" r="3" fill="#fff" stroke="none"/>` +
      `<path d="M50 8 L54 24 L46 24 Z" fill="#e06a6a" ${S}/>` +
      `<path d="M36 66 Q50 78 64 66" fill="none" ${S}/>`
    )},
    bard: { label: 'Barfly Bard', svg: wrap(
      `<path d="M26 36 L74 36 L66 26 L34 26 Z" fill="#2e8b57" ${S}/>` +
      `<path d="M70 24 L82 14" fill="none" ${S}/><circle cx="83" cy="13" r="4" fill="#f5a623" ${S}/>` +
      `<ellipse cx="50" cy="56" rx="21" ry="18" fill="#c98d5e" ${S}/>` +
      eyes(0, -2) +
      `<path d="M40 66 Q50 74 60 66" fill="none" ${S}/>` +
      `<path d="M30 82 Q40 74 46 82" fill="#8a5a2b" ${S}/>`
    )},
    goblin: { label: 'Goblin Bouncer', svg: wrap(
      `<ellipse cx="50" cy="55" rx="24" ry="20" fill="#6d9c4f" ${S}/>` +
      `<path d="M26 50 L8 38 L30 42 Z" fill="#6d9c4f" ${S}/><path d="M74 50 L92 38 L70 42 Z" fill="#6d9c4f" ${S}/>` +
      `<circle cx="41" cy="50" r="5" fill="#ffd400" ${S}/><circle cx="61" cy="50" r="5" fill="#ffd400" ${S}/>` +
      `<circle cx="41" cy="50" r="2" fill="${INK}" stroke="none"/><circle cx="61" cy="50" r="2" fill="${INK}" stroke="none"/>` +
      `<path d="M38 66 L44 62 L50 66 L56 62 L62 66" fill="none" ${S}/>`
    )},
    vampire: { label: 'Vampire Accountant', svg: wrap(
      `<ellipse cx="50" cy="54" rx="20" ry="19" fill="#e8e0e8" ${S}/>` +
      `<path d="M30 40 Q50 20 70 40 L50 48 Z" fill="${INK}"/>` +
      `<rect x="31" y="46" width="15" height="10" rx="2" fill="none" ${S}/><rect x="54" y="46" width="15" height="10" rx="2" fill="none" ${S}/><path d="M46 50 h8" ${S}/>` +
      `<path d="M42 66 L45 74 L48 66 M52 66 L55 74 L58 66" fill="#fff" ${S}/>`
    )},
    orc: { label: 'Orc Librarian', svg: wrap(
      `<ellipse cx="50" cy="54" rx="24" ry="21" fill="#7a8c4a" ${S}/>` +
      `<circle cx="40" cy="48" r="4" fill="${INK}"/><circle cx="60" cy="48" r="4" fill="${INK}"/>` +
      `<path d="M36 44 L46 40 M64 44 L54 40" ${S}/>` +
      `<path d="M40 68 Q50 62 60 68" fill="none" ${S}/>` +
      `<path d="M42 68 L42 60 M58 68 L58 60" stroke="#fff" stroke-width="5" stroke-linecap="round"/>` +
      `<rect x="34" y="80" width="32" height="10" fill="#8a3b2b" ${S}/>`
    )},
    pirate: { label: 'Pirate Granny', svg: wrap(
      `<ellipse cx="50" cy="56" rx="21" ry="18" fill="#e8bfa0" ${S}/>` +
      `<path d="M26 42 Q50 22 74 42 L74 34 Q50 14 26 34 Z" fill="#a92c1e" ${S}/>` +
      `<circle cx="30" cy="42" r="4" fill="#f5a623" ${S}/>` +
      `<rect x="52" y="44" width="14" height="10" rx="2" fill="${INK}"/>` +
      `<circle cx="41" cy="49" r="4" fill="${INK}"/>` +
      `<path d="M40 66 Q48 72 60 66" fill="none" ${S}/><circle cx="64" cy="70" r="3" fill="#f5a623" ${S}/>`
    )},
    druid: { label: 'Sleepy Druid', svg: wrap(
      `<ellipse cx="50" cy="56" rx="22" ry="19" fill="#d9b98c" ${S}/>` +
      `<path d="M28 44 Q50 28 72 44 Q64 34 50 34 Q36 34 28 44 Z" fill="#4f7942" ${S}/>` +
      `<path d="M30 34 q4 -10 10 -4 M60 30 q6 -8 10 0" fill="#4f7942" ${S}/>` +
      `<path d="M36 50 q4 4 8 0 M56 50 q4 4 8 0" fill="none" ${S}/>` +
      `<ellipse cx="50" cy="66" rx="5" ry="7" fill="${INK}"/>` +
      `<text x="70" y="30" font-size="14" font-family="serif" fill="${INK}">z</text>`
    )},
    dwarf: { label: 'Dwarf Plumber', svg: wrap(
      `<path d="M32 36 a18 12 0 0 1 36 0 Z" fill="#2b6ca3" ${S}/><rect x="26" y="34" width="48" height="8" rx="4" fill="#2b6ca3" ${S}/>` +
      `<ellipse cx="50" cy="54" rx="20" ry="16" fill="#eec39a" ${S}/>` +
      eyes(0, -4) +
      `<path d="M30 62 Q50 96 70 62 Q60 70 50 70 Q40 70 30 62 Z" fill="#c1502e" ${S}/>` +
      `<circle cx="50" cy="54" r="5" fill="#e06a6a" ${S}/>`
    )},
    lizard: { label: 'Lizard Alchemist', svg: wrap(
      `<ellipse cx="50" cy="56" rx="24" ry="18" fill="#3f9b6e" ${S}/>` +
      `<circle cx="38" cy="48" r="6" fill="#ffd400" ${S}/><circle cx="62" cy="48" r="6" fill="#ffd400" ${S}/>` +
      `<ellipse cx="38" cy="48" rx="2" ry="4" fill="${INK}" stroke="none"/><ellipse cx="62" cy="48" rx="2" ry="4" fill="${INK}" stroke="none"/>` +
      `<path d="M34 64 Q50 72 66 64" fill="none" ${S}/>` +
      `<path d="M50 30 L46 20 M50 30 L56 19" ${S}/>` +
      `<path d="M28 66 q-10 8 -4 16" fill="none" ${S}/>`
    )},
    ghost: { label: 'The Regular (Deceased)', svg: wrap(
      `<path d="M32 74 V50 a18 18 0 0 1 36 0 v24 l-6 -5 -6 5 -6 -5 -6 5 -6 -5 Z" fill="#dfe8ef" ${S}/>` +
      `<circle cx="43" cy="50" r="4" fill="${INK}"/><circle cx="57" cy="50" r="4" fill="${INK}"/>` +
      `<ellipse cx="50" cy="62" rx="4" ry="6" fill="${INK}"/>` +
      `<path d="M64 40 a10 6 0 0 1 12 4" fill="none" ${S}/>`
    )},
  };

  global.Avatars = {
    ids: Object.keys(AVATARS),
    label(id) { return AVATARS[id] ? AVATARS[id].label : id; },
    render(id, size) {
      const a = AVATARS[id] || AVATARS.ghost;
      return `<span class="avatar" style="width:${size}px;height:${size}px">` +
        a.svg.replace('<svg ', `<svg width="${size}" height="${size}" `) + '</span>';
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);

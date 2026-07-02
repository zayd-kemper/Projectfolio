const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, '..', 'frontend', 'public', 'icons', 'engineering-review');
fs.mkdirSync(outDir, { recursive: true });
const appIconDir = path.join(__dirname, '..', 'frontend', 'public', 'icons', 'engineering');
const lightIconDir = path.join(appIconDir, 'light');
const darkIconDir = path.join(appIconDir, 'dark');
fs.mkdirSync(lightIconDir, { recursive: true });
fs.mkdirSync(darkIconDir, { recursive: true });

const SOFT_FILL_ICONS = new Set([
  'brand-projectfolio', 'project-module', 'media-frame', 'ai-core', 'video-frame',
  'warning-signal', 'lab-vessel', 'education', 'database', 'blocks', 'satellite',
]);

const SIGNAL_NODE_ICONS = new Set([
  'analytics-gauge', 'ai-core', 'source-network', 'trend-line', 'eye-view', 'satellite',
]);

const addClassToFirstShape = (body, className) =>
  body.replace(/<(path|rect|circle|ellipse)(?=[\s>])/, `<$1 class="${className}"`);

const icon = (body, name) => {
  const firstClass = SOFT_FILL_ICONS.has(name) ? 'accent soft' : 'accent';
  const styledBody = addClassToFirstShape(body, firstClass);
  const signalNode = SIGNAL_NODE_ICONS.has(name)
    ? '<circle class="signal-node" cx="20.25" cy="3.75" r="1.15"/>'
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--pf-icon-ink, #223047)" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" role="img"><style>.accent{stroke:var(--pf-icon-accent,#2f6fed)}.soft{fill:var(--pf-icon-accent-soft,#e7efff)}.signal-node{fill:var(--pf-icon-accent,#2f6fed);stroke:var(--pf-icon-surface,#fff);stroke-width:1}</style>${styledBody}${signalNode}</svg>\n`;
};

const withPalette = (svg, palette) => svg
  .replaceAll('var(--pf-icon-ink, #223047)', palette.ink)
  .replaceAll('var(--pf-icon-accent,#2f6fed)', palette.accent)
  .replaceAll('var(--pf-icon-accent-soft,#e7efff)', palette.soft)
  .replaceAll('var(--pf-icon-surface,#fff)', palette.surface);
const icons = {
  'brand-projectfolio': '<path d="M4 7.5h6l2-2h8v13H4z"/><path d="M8 11h8M8 14.5h5"/><circle cx="18" cy="8" r="1.5"/>',
  'project-module': '<rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M7 9h4v4H7zM14 9h3M14 12h3M7 16h10"/>',
  'media-frame': '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="9" r="1.5"/><path d="m5.5 17 4.5-4 3 2.5 2.5-2 3 3.5"/>',
  'analytics-gauge': '<path d="M4 17a8 8 0 0 1 16 0"/><path d="M7 17a5 5 0 0 1 10 0M12 9V7M6.5 12.5 5 11.5M17.5 12.5l1.5-1"/><path d="m12 17 4-4"/><circle cx="12" cy="17" r="1.5"/><path d="M3 20h18"/>',
  'ai-core': '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M18 9h4M2 15h4M18 15h4"/><circle cx="12" cy="12" r="2.5"/><path d="m10.2 13.8 3.6-3.6"/>',
  'connector': '<path d="M8 8v4a4 4 0 0 0 8 0V8M6 8h4V3H6zM14 8h4V3h-4zM12 16v5"/>',
  'team-node': '<circle cx="8" cy="8" r="2.5"/><circle cx="16.5" cy="9" r="2"/><path d="M3.5 19c.5-4 2-6 4.5-6s4 2 4.5 6M13 18c.4-2.8 1.5-4.5 3.5-4.5S20 15 20.5 18"/>',
  'source-network': '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.7 2.5 4 5.3 4 8.5s-1.3 6-4 8.5c-2.7-2.5-4-5.3-4-8.5s1.3-6 4-8.5"/>',
  'link': '<path d="m9.5 14.5 5-5"/><path d="m8 17-1 1a3.5 3.5 0 0 1-5-5l3-3a3.5 3.5 0 0 1 5 0l.75.75"/><path d="m16 7 1-1a3.5 3.5 0 0 1 5 5l-3 3a3.5 3.5 0 0 1-5 0l-.75-.75"/>',
  'theme-sun': '<circle cx="12" cy="12" r="3.5"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19"/>',
  'theme-moon': '<path d="M19 15.5A8 8 0 0 1 8.5 5a8.5 8.5 0 1 0 10.5 10.5z"/>',
  'idea-spark': '<path d="M9 18h6M9.5 21h5M8.5 15.5C6.8 14.3 6 12.4 6 10.5a6 6 0 0 1 12 0c0 1.9-.8 3.8-2.5 5"/><path d="M12 3V1M4.5 5l-1.5-1M19.5 5l1.5-1"/>',
  'gallery-grid': '<rect x="3" y="4" width="8" height="7" rx="1.5"/><rect x="13" y="4" width="8" height="7" rx="1.5"/><rect x="3" y="13" width="8" height="7" rx="1.5"/><rect x="13" y="13" width="8" height="7" rx="1.5"/>',
  'video-frame': '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3zM7 2v3M17 2v3"/>',
  'attachment': '<path d="m8 12 5.5-5.5a3 3 0 0 1 4.2 4.2l-7 7a5 5 0 0 1-7.1-7.1l7-7"/><path d="m10 15 5-5"/>',
  'calendar': '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M7 3v4M17 3v4M3.5 9h17M7 13h3M14 13h3M7 17h3"/>',
  'warning-signal': '<path d="M12 3 2.5 20h19z"/><path d="M12 9v5M12 17.5v.1"/>',
  'signal-success': '<circle cx="12" cy="12" r="9"/><path d="m7.5 12 3 3 6-7"/>',
  'signal-error': '<circle cx="12" cy="12" r="9"/><path d="m8.5 8.5 7 7M15.5 8.5l-7 7"/>',
  'research-scope': '<path d="M5 3h10l4 4v14H5zM15 3v4h4"/><path d="M8 16h8M8 18.5h5"/><circle cx="9" cy="10" r="1.25"/><circle cx="15" cy="11" r="1.25"/><circle cx="12" cy="7.5" r="1.25"/><path d="m10 9 1-1M13 8l1 2M10.25 10.25l3.5.5"/>',
  'launch-vector': '<path d="M8 16c3-7 7-11 13-13-1 6-5 10-12 13z"/><path d="M8 12H5l-2.5 4L7 15.5M12 15.25V19l4-2.5V14"/><path d="M7 17c-2 .5-3 2-4 4 2-1 4-1 5-4"/><circle cx="15.5" cy="8.5" r="1.5"/>',
  'document-edit': '<path d="M5 3.5h9l5 5V21H5zM14 3.5v5h5"/><path d="m8 17 .5-3 6-6 2 2-6 6z"/>',
  'tool-wrench': '<path d="M14.5 6.5a4.5 4.5 0 0 0-6 6L3 18l3 3 5.5-5.5a4.5 4.5 0 0 0 6-6l-3 3-3-3z"/>',
  'target': '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/><path d="m15 9 6-6M17 3h4v4"/>',
  'key-access': '<circle cx="8" cy="12" r="4"/><path d="M12 12h9M17 12v3M20 12v2"/>',
  'message': '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/>',
  'lab-vessel': '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3"/><path d="M8 15h8M10 12h4"/>',
  'award-badge': '<circle cx="12" cy="9" r="6"/><path d="m8 14-1 7 5-3 5 3-1-7M9 9h6M12 6v6"/>',
  'pin': '<path d="M8 3h8l-1 6 3 3H6l3-3zM12 12v9"/>',
  'audio-wave': '<path d="M5 14V8M9 18V4M13 15V7M17 19V3M21 14V8"/>',
  'document': '<path d="M5 3h9l5 5v13H5zM14 3v5h5M8 12h8M8 16h8"/>',
  'archive-compress': '<path d="M7 3h10v18H7zM10 3v3h4V3M10 9h4M10 13h4M10 17h4"/>',
  'measurement': '<path d="M3 21 21 3v18z"/><path d="M9 17h8v-8z"/><path d="M6 18v3M10 18v3M14 18v3M18 18v3"/>',
  'education': '<path d="m2 9 10-5 10 5-10 5zM6 11.5V17c3 2 9 2 12 0v-5.5M22 9v7"/>',
  'mail': '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/>',
  'certificate': '<path d="M6 3h12v13H6zM9 7h6M9 10h6"/><circle cx="12" cy="16" r="3"/><path d="m10 18-1 3 3-1 3 1-1-3"/>',
  'book-stack': '<rect x="4" y="4" width="15" height="4.5" rx="1"/><rect x="5" y="9.75" width="15" height="4.5" rx="1"/><rect x="3" y="15.5" width="16" height="4.5" rx="1"/><path d="M7 6.25h8M8 12h8M6 17.75h9"/>',
  'settings-gear': '<path d="M9.5 2.5h5l.5 2.2 1.7 1 2.2-.7 2.5 4.3-1.7 1.5v2l1.7 1.5-2.5 4.3-2.2-.7-1.7 1-.5 2.2h-5L9 18.9l-1.7-1-2.2.7-2.5-4.3 1.7-1.5v-2L2.6 9.3 5.1 5l2.2.7 1.7-1z"/><circle cx="12" cy="11.8" r="3"/>',
  'lock-secure': '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
  'search-scan': '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5M7 10.5h7M10.5 7v7"/>',
  'trend-line': '<path d="M3 19h18M5 16l4-5 4 2 6-8M16 5h3v3"/>',
  'eye-view': '<path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z"/><circle cx="12" cy="12" r="2.5"/>',
  'briefcase': '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V4h6v3M3 12h18M10 12v2h4v-2"/>',
  'phone-device': '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M10 5h4M11 19h2"/>',
  'performance-bolt': '<path d="m13 2-8 12h6l-1 8 9-13h-6z"/>',
  'delete-bin': '<path d="M5 7h14M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6"/>',
  'filter-flame': '<path d="M13 2.5c.5 4-2.5 5-2.5 8 0 1 .4 1.8 1.1 2.5.1-2.1 1.5-3.5 3.7-5.4 2.2 2.6 3.7 5.1 3.7 7.7A7 7 0 0 1 5 15c0-3.5 2-6.3 5.5-9.3-.2 2 .4 3.2 1 4 0-3 1-4.5 1.5-7.2z"/><path d="M9.2 17c0-1.7 1-3.1 2.8-4.5 1.8 1.4 2.8 2.8 2.8 4.5a2.8 2.8 0 0 1-5.6 0z"/>',
  'clock': '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  'info': '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v.1"/>',
  'cloud-upload': '<path d="M7 18H5a4 4 0 0 1-.5-8A6 6 0 0 1 16 8a5 5 0 0 1 1 10h-2M11 21V11M8 14l3-3 3 3"/>',
  'code-terminal': '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3M13 15h4"/>',
  'database': '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7"/>',
  'blocks': '<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><path d="M17 13v8M13 17h8"/>',
  'satellite': '<rect x="9" y="8" width="6" height="8" rx="1"/><path d="M9 10H5M5 7v6M5 8H2v4h3M15 10h4M19 7v6M19 8h3v4h-3M11 8V5h2v3M12 16v3"/><path d="M9 19h6M16.5 4.5a4 4 0 0 1 3 3M16.5 2a6.5 6.5 0 0 1 5 5"/>',
  'collaboration': '<path d="M8 12a4 4 0 1 1 5.5-5.5M16 12a4 4 0 1 1-5.5 5.5"/><path d="m9 9 6 6"/>',
  'open-folder': '<path d="M3 7h7l2 2h9l-2 10H4zM3 7v12"/>',
  'list-menu': '<path d="M8 6h13M8 12h13M8 18h13M3 6h.1M3 12h.1M3 18h.1"/>',
};

const mapping = {
  '💡':'idea-spark','🖼️':'media-frame','🎨':'gallery-grid','🎬':'video-frame','📎':'attachment','🔗':'link','📊':'analytics-gauge','📅':'calendar','⚠️':'warning-signal','✅':'signal-success','🔬':'research-scope','🚀':'launch-vector','📝':'document-edit','❌':'signal-error','🔧':'tool-wrench','🎯':'target','🔑':'key-access','💬':'message','🧪':'lab-vessel','🏆':'award-badge','📌':'pin','🎵':'audio-wave','📄':'document','🗜️':'archive-compress','📐':'measurement','✏️':'document-edit','🗂️':'project-module','🤖':'ai-core','🔌':'connector','👥':'team-node','🌐':'source-network','📁':'brand-projectfolio','☀️':'theme-sun','🌙':'theme-moon','🤝':'collaboration','🎉':'signal-success','🔔':'info','⚙️':'settings-gear','📰':'document','✨':'idea-spark','🏛️':'education','💼':'briefcase','🚫':'signal-error','🎓':'education','💻':'code-terminal','💰':'briefcase','🔍':'search-scan','📋':'document','👀':'eye-view','🧑':'team-node','💎':'award-badge','👁️':'eye-view','👆':'target','📱':'phone-device','⚡':'performance-bolt','🙈':'eye-view','⭐':'award-badge','📂':'open-folder','🗑️':'delete-bin','🌊':'analytics-gauge','👋':'team-node','🔥':'filter-flame','❤️':'signal-success','⏰':'clock','ℹ️':'info','⏳':'clock','📧':'mail','🗃️':'database','🧱':'blocks','🛰️':'satellite','👩‍🔬':'research-scope','🚁':'launch-vector','📑':'document','📃':'document','☁️':'cloud-upload','👤':'team-node','✉️':'mail','📜':'certificate','📚':'book-stack','☰':'list-menu','🔐':'lock-secure','📈':'trend-line','🐙':'source-network','🐦':'source-network'
};

for (const [name, body] of Object.entries(icons)) {
  const reviewSvg = icon(body, name);
  fs.writeFileSync(path.join(outDir, `${name}.svg`), reviewSvg);
  fs.writeFileSync(path.join(lightIconDir, `${name}.svg`), withPalette(reviewSvg, {
    ink: '#223047', accent: '#2f6fed', soft: '#e7efff', surface: '#ffffff',
  }));
  fs.writeFileSync(path.join(darkIconDir, `${name}.svg`), withPalette(reviewSvg, {
    ink: '#d8e2f0', accent: '#73a2ff', soft: '#1d3358', surface: '#111827',
  }));
}
fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify({
  style: {
    viewBox: '0 0 24 24',
    strokeWidth: 1.75,
    tokens: {
      ink: '--pf-icon-ink',
      accent: '--pf-icon-accent',
      accentSoft: '--pf-icon-accent-soft',
      surface: '--pf-icon-surface',
    },
  },
  emojiMap: mapping,
  icons: Object.keys(icons),
}, null, 2) + '\n');

const cards = Object.entries(icons).map(([name]) => `<article><div class="tile"><img src="./${name}.svg" alt=""></div><strong>${name}</strong><small>${Object.entries(mapping).filter(([,v])=>v===name).map(([k])=>k).join(' ') || 'role-specific'}</small></article>`).join('');
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>ProjectFolio Engineering Icons</title><style>*{box-sizing:border-box}body{margin:0;background:#f4f6f8;color:#172033;font:14px Inter,system-ui,sans-serif}header{padding:34px 5vw 24px;border-bottom:1px solid #d9dee5;background:#fff}h1{margin:0 0 8px;font-size:26px;letter-spacing:0}p{margin:0;color:#596579;max-width:760px;line-height:1.55}.legend{display:flex;gap:18px;margin-top:18px;color:#596579;font-size:12px}.legend span{display:flex;align-items:center;gap:7px}.swatch{width:12px;height:12px;border-radius:3px;background:#223047}.swatch.accent{background:#2f6fed}.swatch.soft{background:#e7efff;border:1px solid #b9ccf8}main{padding:28px 5vw 56px;display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:12px}article{background:#fff;border:1px solid #dfe3e8;border-radius:8px;padding:14px;min-width:0}.tile{height:78px;display:grid;place-items:center;background:#f7f9fb;border:1px solid #e3e7eb;border-radius:6px;margin-bottom:12px}.tile img{width:40px;height:40px}strong,small{display:block;overflow-wrap:anywhere}strong{font-size:13px}small{margin-top:5px;color:#7a8595;font-size:16px;min-height:24px}@media(prefers-color-scheme:dark){body{background:#11161d;color:#edf2f7}header,article{background:#171e27;border-color:#2c3642}.tile{background:#f7f9fb;border-color:#303a46}p,small,.legend{color:#9eabb9}}</style></head><body><header><h1>ProjectFolio Engineering Icon Review</h1><p>${Object.keys(icons).length} standalone SVGs covering ${Object.keys(mapping).length} emoji meanings. The revised system combines structural graphite, engineering-blue functional accents, and selective blueprint fills.</p><div class="legend"><span><i class="swatch"></i>Structure</span><span><i class="swatch accent"></i>Function</span><span><i class="swatch soft"></i>Depth</span></div></header><main>${cards}</main></body></html>`;
fs.writeFileSync(path.join(outDir, 'index.html'), html);
const invalid = Object.keys(icons).filter((name) => {
  const svg = fs.readFileSync(path.join(outDir, `${name}.svg`), 'utf8');
  return !svg.startsWith('<svg') || !svg.includes('viewBox="0 0 24 24"') || !svg.includes('</svg>');
});
if (invalid.length) throw new Error(`Invalid SVG output: ${invalid.join(', ')}`);
console.log(`Generated and validated ${Object.keys(icons).length} review SVGs plus light/dark app variants; mapped ${Object.keys(mapping).length} emoji roles in ${outDir}`);

// Tiny SVG mockups showing what each layout looks like
export default function LayoutPreview({ layoutId, accentColor = '#2563eb' }) {
  const accent = accentColor;
  const light = '#f1f5f9';
  const mid = '#e2e8f0';
  const dark = '#334155';
  const card = '#ffffff';

  const previews = {
    classic: (
      <svg viewBox="0 0 200 130" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
        {/* Header bar */}
        <rect x="0" y="0" width="200" height="130" fill={light} rx="6"/>
        {/* Avatar */}
        <circle cx="100" cy="28" r="14" fill={accent} opacity="0.8"/>
        {/* Name line */}
        <rect x="70" y="46" width="60" height="5" fill={dark} rx="2"/>
        {/* Subtitle line */}
        <rect x="80" y="55" width="40" height="3" fill={mid} rx="1.5"/>
        {/* Skill tags */}
        <rect x="55" y="63" width="20" height="5" fill={accent} opacity="0.2" rx="2.5"/>
        <rect x="80" y="63" width="24" height="5" fill={accent} opacity="0.2" rx="2.5"/>
        <rect x="109" y="63" width="18" height="5" fill={accent} opacity="0.2" rx="2.5"/>
        {/* Divider */}
        <line x1="20" y1="75" x2="180" y2="75" stroke={mid} strokeWidth="1"/>
        {/* Project cards grid */}
        <rect x="16" y="82" width="50" height="38" fill={card} rx="4" stroke={mid} strokeWidth="0.5"/>
        <rect x="16" y="82" width="50" height="16" fill={accent} opacity="0.15" rx="4"/>
        <rect x="20" y="102" width="30" height="3" fill={dark} opacity="0.5" rx="1"/>
        <rect x="20" y="108" width="22" height="2.5" fill={mid} rx="1"/>

        <rect x="75" y="82" width="50" height="38" fill={card} rx="4" stroke={mid} strokeWidth="0.5"/>
        <rect x="75" y="82" width="50" height="16" fill={accent} opacity="0.15" rx="4"/>
        <rect x="79" y="102" width="30" height="3" fill={dark} opacity="0.5" rx="1"/>
        <rect x="79" y="108" width="22" height="2.5" fill={mid} rx="1"/>

        <rect x="134" y="82" width="50" height="38" fill={card} rx="4" stroke={mid} strokeWidth="0.5"/>
        <rect x="134" y="82" width="50" height="16" fill={accent} opacity="0.15" rx="4"/>
        <rect x="138" y="102" width="30" height="3" fill={dark} opacity="0.5" rx="1"/>
        <rect x="138" y="108" width="22" height="2.5" fill={mid} rx="1"/>
      </svg>
    ),

    sidebar: (
      <svg viewBox="0 0 200 130" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
        <rect x="0" y="0" width="200" height="130" fill={light} rx="6"/>
        {/* Sidebar panel */}
        <rect x="0" y="0" width="62" height="130" fill={card} rx="6" stroke={mid} strokeWidth="0.5"/>
        {/* Avatar */}
        <circle cx="31" cy="28" r="14" fill={accent} opacity="0.8"/>
        {/* Name */}
        <rect x="10" y="46" width="42" height="4" fill={dark} rx="2"/>
        {/* Subtitle */}
        <rect x="14" y="54" width="34" height="3" fill={mid} rx="1.5"/>
        {/* Skill pills */}
        <rect x="8" y="62" width="20" height="5" fill={accent} opacity="0.2" rx="2.5"/>
        <rect x="32" y="62" width="22" height="5" fill={accent} opacity="0.2" rx="2.5"/>
        <rect x="8" y="71" width="16" height="5" fill={accent} opacity="0.2" rx="2.5"/>
        {/* Links */}
        <rect x="8" y="85" width="46" height="3" fill={mid} rx="1"/>
        <rect x="8" y="92" width="38" height="3" fill={mid} rx="1"/>
        <rect x="8" y="99" width="42" height="3" fill={mid} rx="1"/>
        {/* Main content - project cards stacked */}
        <rect x="70" y="10" width="120" height="34" fill={card} rx="4" stroke={mid} strokeWidth="0.5"/>
        <rect x="70" y="10" width="44" height="34" fill={accent} opacity="0.15" rx="4"/>
        <rect x="120" y="16" width="60" height="4" fill={dark} opacity="0.5" rx="1"/>
        <rect x="120" y="24" width="44" height="3" fill={mid} rx="1"/>
        <rect x="120" y="31" width="36" height="3" fill={mid} rx="1"/>

        <rect x="70" y="50" width="120" height="34" fill={card} rx="4" stroke={mid} strokeWidth="0.5"/>
        <rect x="70" y="50" width="44" height="34" fill={accent} opacity="0.15" rx="4"/>
        <rect x="120" y="56" width="60" height="4" fill={dark} opacity="0.5" rx="1"/>
        <rect x="120" y="64" width="44" height="3" fill={mid} rx="1"/>
        <rect x="120" y="71" width="36" height="3" fill={mid} rx="1"/>

        <rect x="70" y="90" width="120" height="34" fill={card} rx="4" stroke={mid} strokeWidth="0.5"/>
        <rect x="70" y="90" width="44" height="34" fill={accent} opacity="0.15" rx="4"/>
        <rect x="120" y="96" width="60" height="4" fill={dark} opacity="0.5" rx="1"/>
        <rect x="120" y="104" width="44" height="3" fill={mid} rx="1"/>
        <rect x="120" y="111" width="36" height="3" fill={mid} rx="1"/>
      </svg>
    ),

    magazine: (
      <svg viewBox="0 0 200 130" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
        <rect x="0" y="0" width="200" height="130" fill={light} rx="6"/>
        {/* Nav bar */}
        <rect x="0" y="0" width="200" height="14" fill={card} rx="6" stroke={mid} strokeWidth="0.5"/>
        <circle cx="16" cy="7" r="4" fill={accent} opacity="0.8"/>
        <rect x="26" y="4" width="30" height="4" fill={dark} opacity="0.4" rx="1"/>
        {/* Hero featured card */}
        <rect x="10" y="18" width="180" height="55" fill={accent} opacity="0.15" rx="5"/>
        <rect x="10" y="18" width="180" height="55" fill="none" stroke={accent} opacity="0.3" strokeWidth="0.5" rx="5"/>
        <circle cx="28" cy="36" r="10" fill={accent} opacity="0.6"/>
        <rect x="44" y="26" width="80" height="5" fill={dark} opacity="0.6" rx="2"/>
        <rect x="44" y="35" width="110" height="3" fill={mid} rx="1"/>
        <rect x="44" y="42" width="90" height="3" fill={mid} rx="1"/>
        <rect x="10" y="62" width="36" height="7" fill={accent} opacity="0.8" rx="3"/>
        <rect x="52" y="63" width="28" height="5" fill={mid} rx="2"/>
        {/* Smaller cards row */}
        <rect x="10" y="80" width="56" height="42" fill={card} rx="4" stroke={mid} strokeWidth="0.5"/>
        <rect x="10" y="80" width="56" height="20" fill={accent} opacity="0.12" rx="4"/>
        <rect x="14" y="104" width="36" height="3.5" fill={dark} opacity="0.5" rx="1"/>
        <rect x="14" y="110" width="26" height="2.5" fill={mid} rx="1"/>

        <rect x="72" y="80" width="56" height="42" fill={card} rx="4" stroke={mid} strokeWidth="0.5"/>
        <rect x="72" y="80" width="56" height="20" fill={accent} opacity="0.12" rx="4"/>
        <rect x="76" y="104" width="36" height="3.5" fill={dark} opacity="0.5" rx="1"/>
        <rect x="76" y="110" width="26" height="2.5" fill={mid} rx="1"/>

        <rect x="134" y="80" width="56" height="42" fill={card} rx="4" stroke={mid} strokeWidth="0.5"/>
        <rect x="134" y="80" width="56" height="20" fill={accent} opacity="0.12" rx="4"/>
        <rect x="138" y="104" width="36" height="3.5" fill={dark} opacity="0.5" rx="1"/>
        <rect x="138" y="110" width="26" height="2.5" fill={mid} rx="1"/>
      </svg>
    ),

    minimal: (
      <svg viewBox="0 0 200 130" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
        <rect x="0" y="0" width="200" height="130" fill={light} rx="6"/>
        {/* Simple name block */}
        <rect x="20" y="14" width="70" height="7" fill={dark} opacity="0.7" rx="2"/>
        <rect x="20" y="25" width="100" height="4" fill={mid} rx="1.5"/>
        <rect x="20" y="33" width="80" height="3" fill={mid} rx="1.5"/>
        {/* Thin divider */}
        <line x1="20" y1="44" x2="180" y2="44" stroke={accent} strokeWidth="1.5" opacity="0.5"/>
        {/* Text-only project list */}
        <rect x="20" y="52" width="90" height="5" fill={dark} opacity="0.6" rx="1.5"/>
        <rect x="20" y="61" width="130" height="3" fill={mid} rx="1"/>
        <rect x="20" y="68" width="50" height="4" fill={accent} opacity="0.3" rx="2"/>

        <line x1="20" y1="78" x2="180" y2="78" stroke={mid} strokeWidth="0.5"/>

        <rect x="20" y="84" width="110" height="5" fill={dark} opacity="0.6" rx="1.5"/>
        <rect x="20" y="93" width="130" height="3" fill={mid} rx="1"/>
        <rect x="20" y="100" width="40" height="4" fill={accent} opacity="0.3" rx="2"/>

        <line x1="20" y1="110" x2="180" y2="110" stroke={mid} strokeWidth="0.5"/>

        <rect x="20" y="116" width="75" height="5" fill={dark} opacity="0.6" rx="1.5"/>
      </svg>
    ),

    fullwidth: (
      <svg viewBox="0 0 200 130" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
        <rect x="0" y="0" width="200" height="130" fill={light} rx="6"/>
        {/* Header */}
        <rect x="0" y="0" width="200" height="30" fill={accent} opacity="0.1" rx="6"/>
        <circle cx="20" cy="15" r="8" fill={accent} opacity="0.7"/>
        <rect x="34" y="11" width="50" height="4" fill={dark} opacity="0.6" rx="1.5"/>
        <rect x="34" y="19" width="70" height="3" fill={mid} rx="1"/>
        {/* Full width cards */}
        <rect x="10" y="36" width="180" height="24" fill={card} rx="4" stroke={mid} strokeWidth="0.5"/>
        <rect x="10" y="36" width="52" height="24" fill={accent} opacity="0.15" rx="4"/>
        <rect x="70" y="42" width="80" height="4" fill={dark} opacity="0.5" rx="1.5"/>
        <rect x="70" y="50" width="100" height="3" fill={mid} rx="1"/>

        <rect x="10" y="66" width="180" height="24" fill={card} rx="4" stroke={mid} strokeWidth="0.5"/>
        <rect x="10" y="66" width="52" height="24" fill={accent} opacity="0.15" rx="4"/>
        <rect x="70" y="72" width="80" height="4" fill={dark} opacity="0.5" rx="1.5"/>
        <rect x="70" y="80" width="100" height="3" fill={mid} rx="1"/>

        <rect x="10" y="96" width="180" height="24" fill={card} rx="4" stroke={mid} strokeWidth="0.5"/>
        <rect x="10" y="96" width="52" height="24" fill={accent} opacity="0.15" rx="4"/>
        <rect x="70" y="102" width="80" height="4" fill={dark} opacity="0.5" rx="1.5"/>
        <rect x="70" y="110" width="100" height="3" fill={mid} rx="1"/>
      </svg>
    ),
  };

  return previews[layoutId] || previews.classic;
}
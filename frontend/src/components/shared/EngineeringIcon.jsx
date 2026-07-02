import React from 'react';

export const EMOJI_ICON_MAP = {
  '💡': 'idea-spark', '🖼️': 'media-frame', '🎨': 'gallery-grid', '🎬': 'video-frame',
  '📎': 'attachment', '🔗': 'link', '📊': 'analytics-gauge', '📅': 'calendar',
  '⚠️': 'warning-signal', '✅': 'signal-success', '🔬': 'research-scope', '🚀': 'launch-vector',
  '📝': 'document-edit', '❌': 'signal-error', '🔧': 'tool-wrench', '🎯': 'target',
  '🔑': 'key-access', '💬': 'message', '🧪': 'lab-vessel', '🏆': 'award-badge',
  '📌': 'pin', '🎵': 'audio-wave', '📄': 'document', '🗜️': 'archive-compress',
  '📐': 'measurement', '✏️': 'document-edit', '🗂️': 'project-module', '🤖': 'ai-core',
  '🔌': 'connector', '👥': 'team-node', '🌐': 'source-network', '📁': 'brand-projectfolio',
  '☀️': 'theme-sun', '🌙': 'theme-moon', '🤝': 'collaboration', '🎉': 'signal-success',
  '🔔': 'info', '⚙️': 'settings-gear', '📰': 'document', '✨': 'idea-spark',
  '🏛️': 'education', '💼': 'briefcase', '🚫': 'signal-error', '🎓': 'education',
  '💻': 'code-terminal', '💰': 'briefcase', '🔍': 'search-scan', '📋': 'document',
  '🐙': 'source-network', '🐦': 'source-network', '👀': 'eye-view', '🧑': 'team-node',
  '💎': 'award-badge', '👁️': 'eye-view', '👆': 'target', '📱': 'phone-device',
  '⚡': 'performance-bolt', '🙈': 'eye-view', '⭐': 'award-badge', '📂': 'open-folder',
  '🗑️': 'delete-bin', '🌊': 'analytics-gauge', '👋': 'team-node', '🔥': 'filter-flame',
  '❤️': 'signal-success', '⏰': 'clock', 'ℹ️': 'info', '⏳': 'clock',
  '📧': 'mail', '🗃️': 'database', '🧱': 'blocks', '🛰️': 'satellite',
  '👩‍🔬': 'research-scope', '🚁': 'launch-vector', '📑': 'document', '📃': 'document',
  '☁️': 'cloud-upload', '👤': 'team-node', '✉️': 'mail', '📜': 'certificate',
  '📚': 'book-stack', '☰': 'list-menu', '🔐': 'lock-secure', '📈': 'trend-line',
};

const normalizedMap = Object.fromEntries(
  Object.entries(EMOJI_ICON_MAP).map(([emoji, name]) => [emoji.replaceAll('\uFE0F', ''), name])
);

const emojiPattern = new RegExp(
  Object.keys(EMOJI_ICON_MAP)
    .sort((a, b) => b.length - a.length)
    .map(value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replaceAll('️', '️?'))
    .join('|'),
  'gu'
);

export function iconNameForEmoji(emoji) {
  if (!emoji) return null;
  return EMOJI_ICON_MAP[emoji] || normalizedMap[String(emoji).replaceAll('\uFE0F', '')] || null;
}

export default function EngineeringIcon({ name, emoji, label, size = '1em', className = '' }) {
  const iconName = name || iconNameForEmoji(emoji);
  if (!iconName) return emoji || null;

  const accessibility = label
    ? { role: 'img', 'aria-label': label }
    : { 'aria-hidden': true };

  return (
    <span
      {...accessibility}
      className={`engineering-icon relative inline-flex flex-none align-[-0.125em] ${className}`}
      style={{ width: size, height: size }}
    >
      <img
        src={`/icons/engineering/light/${iconName}.svg`}
        alt=""
        draggable="false"
        className="absolute inset-0 block h-full w-full dark:hidden"
      />
      <img
        src={`/icons/engineering/dark/${iconName}.svg`}
        alt=""
        draggable="false"
        className="absolute inset-0 hidden h-full w-full dark:block"
      />
    </span>
  );
}

export function IconText({ text, className = '', iconClassName = '', size = '1em' }) {
  if (text === null || text === undefined) return null;
  if (typeof text === 'boolean') return null;
  if (Array.isArray(text)) {
    return text.map((item, index) => (
      <React.Fragment key={item?.key ?? index}>
        <IconText text={item} className={className} iconClassName={iconClassName} size={size} />
      </React.Fragment>
    ));
  }
  if (React.isValidElement(text)) {
    if (!text.props?.children) return text;
    return React.cloneElement(text, {
      ...text.props,
      children: <IconText text={text.props.children} iconClassName={iconClassName} size={size} />,
    });
  }
  const value = String(text);
  const parts = [];
  let cursor = 0;

  for (const match of value.matchAll(emojiPattern)) {
    if (match.index > cursor) parts.push(value.slice(cursor, match.index));
    parts.push(
      <EngineeringIcon
        key={`${match.index}-${match[0]}`}
        emoji={match[0]}
        size={size}
        className={iconClassName}
      />
    );
    cursor = match.index + match[0].length;
  }

  if (cursor < value.length) parts.push(value.slice(cursor));
  if (parts.length === 0) return value;

  return <span className={`inline-flex items-center gap-1.5 ${className}`}>{parts}</span>;
}

export const cx = (...classes) => classes.filter(Boolean).join(' ');

export const formatCount = (value) => {
  const number = Number(value || 0);
  if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(1)}m`;
  if (number >= 1_000) return `${(number / 1_000).toFixed(1)}k`;
  return String(number);
};

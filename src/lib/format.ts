const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB", "PB"];

const countFormat = new Intl.NumberFormat("pt-BR");
const relativeFormat = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
const dateFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" });
const timeFormat = new Intl.DateTimeFormat("pt-BR", { timeStyle: "short" });

export const BYTES_PER_GB = 1024 ** 3;

export function formatBytes(bytes: number | null) {
  if (bytes === null) return "—";

  const exponent = Math.min(Math.floor(Math.log(Math.max(bytes, 1)) / Math.log(1024)), BYTE_UNITS.length - 1);
  const value = bytes / 1024 ** exponent;
  const decimals = exponent === 0 || value >= 100 ? 0 : 1;

  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: decimals })} ${BYTE_UNITS[exponent]}`;
}

export function formatCount(value: number | null) {
  return value === null ? "—" : countFormat.format(value);
}

export function formatDate(value: string | null) {
  return value ? dateFormat.format(new Date(value)) : "—";
}

export function formatTime(value: string) {
  return timeFormat.format(new Date(value));
}

export function formatRelative(value: string | null, now = Date.now()) {
  if (!value) return "—";

  // Indexadores em outro fuso podem informar uma data levemente no futuro.
  const hours = Math.max(0, now - Date.parse(value)) / 3_600_000;
  const days = hours / 24;

  if (hours < 1) return "agora";
  if (days < 1) return relativeFormat.format(-Math.round(hours), "hour");
  if (days < 30) return relativeFormat.format(-Math.round(days), "day");
  if (days < 365) return relativeFormat.format(-Math.round(days / 30), "month");
  return relativeFormat.format(-Math.round(days / 365), "year");
}

export function formatAge(value: string | null, now = Date.now()) {
  if (!value) return "—";

  const hours = Math.max(0, now - Date.parse(value)) / 3_600_000;
  const days = hours / 24;

  if (hours < 1) return "agora";
  if (days < 1) return `${Math.round(hours)}h`;
  if (days < 30) return `${Math.round(days)}d`;
  if (days < 365) return `${Math.round(days / 30)}m`;
  return `${Math.round(days / 365)}a`;
}

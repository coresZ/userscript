/** 时间展示：相对时间 + 日期格式化（面板与气泡共用） */

/** ISO 时间 → 相对时间（刚刚 / n 分钟前 / n 小时前 / n 天前 / n 个月前 / n 年前） */
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (isNaN(then)) return '—';
  const diff = Date.now() - then;
  const MIN = 60_000;
  const HOUR = 3_600_000;
  const DAY = 86_400_000;
  if (diff < MIN) return '刚刚';
  if (diff < HOUR) return `${Math.floor(diff / MIN)} 分钟前`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} 小时前`;
  if (diff < DAY * 30) return `${Math.floor(diff / DAY)} 天前`;
  if (diff < DAY * 365) return `${Math.floor(diff / (DAY * 30))} 个月前`;
  return `${Math.floor(diff / (DAY * 365))} 年前`;
}

/** ISO 时间 → YYYY-MM-DD */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

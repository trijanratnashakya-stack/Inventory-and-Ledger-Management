export const BRAND = process.env.NEXT_PUBLIC_BRAND_NAME || 'Your Company';

export function money(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '-';
  return `Rs. ${Number(n).toLocaleString('en-IN')}`;
}

export function timeAgo(iso) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export const STATUS_LABEL = { in: 'In Stock', low: 'Low Stock', out: 'Out of Stock' };
export const CATEGORY_LABEL = { gem: 'Gem', non_gem: 'Non-Gem' };
export const canEdit = (user) => !!user && ['admin', 'manager'].includes(user.role);

// backend/utils/pagination.js
export function toPaging(p = "1", s = "24") {
  const page = Math.max(1, parseInt(p, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(s, 10) || 24));
  return { page, pageSize, offset: (page - 1) * pageSize, limit: pageSize };
}

import { buildPageLinks } from './pagination.js';

export function parsePagination(query, defaultLimit = 20) {
  const limit = query.limit
    ? Math.min(100, Math.max(1, parseInt(query.limit, 10)))
    : defaultLimit;
  const page = query.page ? Math.max(1, parseInt(query.page, 10)) : 1;
  return { page, limit };
}

export function linkBaseFromReq(req, suffix = '') {
  return `${req.protocol}://${req.get('host')}${req.baseUrl}${suffix}`;
}

export function toPaginatedBody({
  rows,
  page,
  limit,
  totalCount,
  countKey,
  linkBase,
  status,
  filters = {},
}) {
  const total = totalCount === 0 ? 0 : Math.ceil(totalCount / limit);
  const linkOpts = { page, limit, total, filters };
  if (status) linkOpts.status = status;

  return {
    status: 'success',
    page,
    limit,
    total,
    [countKey]: totalCount,
    links: buildPageLinks(linkBase, linkOpts),
    data: rows,
  };
}

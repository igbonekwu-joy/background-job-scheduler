export function buildPageLinks(linkBase, { page, limit, status, total }) {
  const build = (p) => {
    const params = new URLSearchParams({ page: String(p), limit: String(limit) });
    if (status) params.set('status', status);
    return `${linkBase}?${params}`;
  };

  return {
    self: build(page),
    next: page < total ? build(page + 1) : null,
    prev: page > 1 ? build(page - 1) : null,
  };
}

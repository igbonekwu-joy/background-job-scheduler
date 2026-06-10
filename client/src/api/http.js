export async function parseJsonResponse(res) {
  const body = await res.json();

  if (!res.ok) {
    const message = body.error || body.message || `Request failed (${res.status})`;
    throw new Error(typeof message === 'string' ? message : 'Request failed');
  }

  return body;
}

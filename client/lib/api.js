export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
    this.problems = null;
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    // empty or non-JSON body
  }
  if (!res.ok) {
    const err = new ApiError((data && data.error) || 'Request failed', res.status);
    if (data && data.problems) err.problems = data.problems;
    throw err;
  }
  return data;
}

/**
 * Lightweight test HTTP client.
 * Each instance manages its own cookie jar so multiple users can run in parallel.
 */

const BASE = process.env.API_URL ?? 'http://localhost:4000/api'

export class ApiClient {
  private cookies: Record<string, string> = {}

  private cookieHeader(): string {
    return Object.entries(this.cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ')
  }

  private storeCookies(headers: Headers) {
    const raw = headers.getSetCookie?.() ?? []
    for (const c of raw) {
      const [pair] = c.split(';')
      const [name, value] = pair.split('=')
      if (name && value !== undefined) this.cookies[name.trim()] = value.trim()
    }
  }

  async request(method: string, path: string, body?: unknown): Promise<{ status: number; data: any }> {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Cookie: this.cookieHeader(),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    this.storeCookies(res.headers)
    let data: any
    const ct = res.headers.get('content-type') ?? ''
    data = ct.includes('application/json') ? await res.json() : await res.text()
    return { status: res.status, data }
  }

  get(path: string) { return this.request('GET', path) }
  post(path: string, body?: unknown) { return this.request('POST', path, body) }
  put(path: string, body?: unknown) { return this.request('PUT', path, body) }
  patch(path: string, body?: unknown) { return this.request('PATCH', path, body) }
  delete(path: string, body?: unknown) { return this.request('DELETE', path, body) }
}

/** Register + login a fresh user, return a logged-in client and the user object */
export async function createUser(suffix: string) {
  const ts = Date.now()
  const email = `${suffix}_${ts}@test.local`
  const username = `${suffix}_${ts}`
  const password = 'Test1234!'

  const client = new ApiClient()
  const reg = await client.post('/auth/register', { email, username, password })
  if (reg.status !== 201) throw new Error(`Register failed: ${JSON.stringify(reg.data)}`)

  const login = await client.post('/auth/login', { email, password })
  if (login.status !== 200) throw new Error(`Login failed: ${JSON.stringify(login.data)}`)

  return { client, user: login.data as { id: string; username: string; email: string } }
}

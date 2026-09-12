import type { Role } from '@opsflow/contracts';

export async function demoSession(baseUrl: string, role: Role = 'admin'): Promise<string> {
  const headers = { 'content-type': 'application/json', 'x-opsflow-request': '1' };
  const body = JSON.stringify({ role });
  const response = await fetch(`${baseUrl}/api/session/demo`, { method: 'POST', headers, body });
  const cookie = response.headers.get('set-cookie')?.split(';')[0];
  if (response.status !== 204 || !cookie) throw new Error(`Demo session failed: HTTP ${response.status}`);
  return cookie;
}

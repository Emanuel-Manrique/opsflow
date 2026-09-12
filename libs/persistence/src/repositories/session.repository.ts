import { createHash, randomBytes } from 'node:crypto';
import type { DataSource } from 'typeorm';
import type { Membership } from '@opsflow/contracts';

const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const MEMBER_SELECT = `
  SELECT u.id AS "userId", u.email, m.tenant_id AS "tenantId", t.slug AS "tenantSlug", t.name AS "tenantName", m.role
  FROM sessions s
  JOIN users u ON u.id = s.user_id
  JOIN memberships m ON m.user_id = u.id
  JOIN tenants t ON t.id = m.tenant_id
`;

export class SessionRepository {
  constructor(private readonly dataSource: DataSource) {}

  async create(userId: string): Promise<string> {
    const token = randomBytes(32).toString('hex');
    await this.dataSource.transaction(async (manager) => {
      await manager.query('DELETE FROM sessions WHERE expires_at <= now()');
      await manager.query("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '8 hours')", [hash(token), userId]);
    });
    return token;
  }

  async list(token: string): Promise<Membership[]> {
    return this.dataSource.query<Membership[]>(`
      ${MEMBER_SELECT}
      WHERE s.token_hash = $1 AND s.expires_at > now()
      ORDER BY t.slug, t.id
    `, [hash(token)]);
  }

  async find(token: string, tenantId: string): Promise<Membership | undefined> {
    const [member] = await this.dataSource.query<Membership[]>(`
      ${MEMBER_SELECT}
      WHERE s.token_hash = $1 AND s.expires_at > now() AND m.tenant_id = $2
    `, [hash(token), tenantId]);
    return member;
  }

  async membership(userId: string, tenantId: string): Promise<Membership | undefined> {
    const [member] = await this.dataSource.query<Membership[]>(`
      SELECT u.id AS "userId", u.email, m.tenant_id AS "tenantId", t.slug AS "tenantSlug", t.name AS "tenantName", m.role
      FROM memberships m JOIN users u ON u.id = m.user_id JOIN tenants t ON t.id = m.tenant_id
      WHERE m.user_id = $1 AND m.tenant_id = $2
    `, [userId, tenantId]);
    return member;
  }

  async revoke(token: string): Promise<void> {
    await this.dataSource.query('DELETE FROM sessions WHERE token_hash = $1', [hash(token)]);
  }
}

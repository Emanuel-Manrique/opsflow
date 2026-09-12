import { EntitySchema } from 'typeorm';
import type { SessionRow } from './schema.types';

export const SessionEntity = new EntitySchema<SessionRow>({
  name: 'SessionEntity',
  tableName: 'sessions',
  columns: {
    tokenHash: { type: 'text', name: 'token_hash', primary: true },
    userId: { type: 'uuid', name: 'user_id' },
    expiresAt: { type: 'timestamptz', name: 'expires_at' },
  },
  foreignKeys: [
    { name: 'sessions_user_id_fkey', target: 'UserEntity', columnNames: ['userId'], referencedColumnNames: ['id'] },
  ],
  indices: [{ name: 'ix_sessions_expiry', columns: ['expiresAt'] }],
});

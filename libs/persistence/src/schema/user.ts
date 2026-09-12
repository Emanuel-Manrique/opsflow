import { EntitySchema } from 'typeorm';
import type { UserRow } from './schema.types';

export const UserEntity = new EntitySchema<UserRow>({
  name: 'UserEntity',
  tableName: 'users',
  columns: {
    id: { type: 'uuid', primary: true },
    email: { type: 'text' },
  },
  uniques: [{ name: 'users_email_key', columns: ['email'] }],
});

import { randomUUID } from 'crypto';
import { DataType, newDb } from 'pg-mem';

export const createPgMemAdapter = (): Record<string, unknown> => {
  const db = newDb({ autoCreateForeignKeyIndices: true });
  db.public.registerFunction({
    name: 'uuid_generate_v4',
    returns: DataType.uuid,
    implementation: randomUUID,
    impure: true,
  });
  db.public.registerFunction({
    name: 'version',
    returns: DataType.text,
    implementation: () => 'pg-mem',
  });
  db.public.registerFunction({
    name: 'current_database',
    returns: DataType.text,
    implementation: () => 'test',
  });
  db.public.registerFunction({
    name: 'current_schema',
    returns: DataType.text,
    implementation: () => 'public',
  });
  db.public.registerOperator({
    operator: '~',
    left: DataType.text,
    right: DataType.text,
    returns: DataType.bool,
    implementation: (value: string, pattern: string) => new RegExp(pattern).test(value),
  });
  return db.adapters.createPg() as unknown as Record<string, unknown>;
};

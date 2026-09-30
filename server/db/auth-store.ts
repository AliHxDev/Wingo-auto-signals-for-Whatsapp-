import {
  initAuthCreds,
  BufferJSON,
  proto,
  type AuthenticationCreds,
  type AuthenticationState,
  type SignalDataTypeMap,
} from '@whiskeysockets/baileys';
import { query } from './index.js';
import { logger } from '../services/logger.js';

/**
 * Checks whether valid, authenticated WhatsApp credentials exist in PostgreSQL.
 * Used on Render restart to verify if WhatsApp can reconnect automatically.
 */
export async function hasStoredAuth(): Promise<boolean> {
  try {
    const credsRes = await query<{ data: any }>(
      'SELECT data FROM whatsapp_auth WHERE id = $1',
      ['creds']
    );

    if (credsRes.rowCount === 0 || !credsRes.rows[0]?.data) {
      return false;
    }

    const raw = credsRes.rows[0].data;
    const parsed =
      typeof raw === 'string'
        ? JSON.parse(raw, BufferJSON.reviver)
        : JSON.parse(JSON.stringify(raw), BufferJSON.reviver);

    return !!(parsed?.me?.id || parsed?.registered === true);
  } catch (err: any) {
    logger.warn({ err: err.message }, 'Failed to check stored WhatsApp auth in PostgreSQL');
    return false;
  }
}

export async function usePostgresAuthState(): Promise<{
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
  clearAuth: () => Promise<void>;
}> {
  // 1. Fetch credentials
  const credsRes = await query<{ data: any }>(
    'SELECT data FROM whatsapp_auth WHERE id = $1',
    ['creds']
  );

  let creds: AuthenticationCreds;
  if (credsRes.rowCount > 0 && credsRes.rows[0]?.data) {
    try {
      const parsed =
        typeof credsRes.rows[0].data === 'string'
          ? JSON.parse(credsRes.rows[0].data, BufferJSON.reviver)
          : JSON.parse(JSON.stringify(credsRes.rows[0].data), BufferJSON.reviver);
      creds = parsed;
    } catch (err: any) {
      logger.warn({ err: err.message }, 'Failed to parse creds from DB, generating new');
      creds = initAuthCreds();
    }
  } else {
    creds = initAuthCreds();
  }

  // 2. saveCreds function
  const saveCreds = async () => {
    try {
      const serialized = JSON.stringify(creds, BufferJSON.replacer);
      await query(
        `INSERT INTO whatsapp_auth (id, data, updated_at)
         VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT (id) DO UPDATE
         SET data = EXCLUDED.data, updated_at = NOW()`,
        ['creds', serialized]
      );
    } catch (err: any) {
      logger.error({ err: err.message }, 'Failed to save creds to PostgreSQL');
    }
  };

  // 3. Clear auth function
  const clearAuth = async () => {
    try {
      await query('DELETE FROM whatsapp_auth');
      logger.info('WhatsApp auth state cleared from database.');
    } catch (err: any) {
      logger.error({ err: err.message }, 'Failed to clear WhatsApp auth state');
    }
  };

  // 4. keys store
  return {
    state: {
      creds,
      keys: {
        get: async <T extends keyof SignalDataTypeMap>(
          type: T,
          ids: string[]
        ): Promise<{ [id: string]: SignalDataTypeMap[T] }> => {
          const result: { [id: string]: SignalDataTypeMap[T] } = {};
          if (!ids || ids.length === 0) return result;

          for (const id of ids) {
            const rowKey = `${type}-${id}`;
            const res = await query<{ data: any }>(
              'SELECT data FROM whatsapp_auth WHERE id = $1',
              [rowKey]
            );
            if (res.rowCount > 0 && res.rows[0]?.data) {
              try {
                let value =
                  typeof res.rows[0].data === 'string'
                    ? JSON.parse(res.rows[0].data, BufferJSON.reviver)
                    : JSON.parse(JSON.stringify(res.rows[0].data), BufferJSON.reviver);

                if (type === 'app-state-sync-key' && value) {
                  value = proto.Message.AppStateSyncKeyData.fromObject(value);
                }
                result[id] = value;
              } catch (e: any) {
                logger.warn({ err: e.message, rowKey }, 'Error parsing key from DB');
              }
            }
          }
          return result;
        },
        set: async (data: any) => {
          for (const category of Object.keys(data)) {
            for (const id of Object.keys(data[category])) {
              const val = data[category][id];
              const key = `${category}-${id}`;
              if (val) {
                const serialized = JSON.stringify(val, BufferJSON.replacer);
                await query(
                  `INSERT INTO whatsapp_auth (id, data, updated_at)
                   VALUES ($1, $2::jsonb, NOW())
                   ON CONFLICT (id) DO UPDATE
                   SET data = EXCLUDED.data, updated_at = NOW()`,
                  [key, serialized]
                );
              } else {
                await query('DELETE FROM whatsapp_auth WHERE id = $1', [key]);
              }
            }
          }
        },
      },
    },
    saveCreds,
    clearAuth,
  };
}

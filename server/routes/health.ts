import { Router, type Request, type Response } from 'express';
import { botRunner } from '../bot/runner.js';
import { whatsAppManager } from '../whatsapp/client.js';
import { query } from '../db/index.js';

export const healthRouter = Router();

healthRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  let dbOk = false;
  try {
    const dbRes = await query('SELECT 1 as test');
    dbOk = dbRes.rowCount > 0;
  } catch {
    dbOk = false;
  }

  const waStatus = whatsAppManager.getStatus();
  const botStatus = botRunner.getStatus();

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    database: {
      connected: dbOk,
    },
    whatsapp: {
      status: waStatus.status,
      isRegistered: waStatus.isRegistered,
    },
    bot: {
      running: botStatus.running,
      lastIssue: botStatus.lastIssue,
    },
  });
});

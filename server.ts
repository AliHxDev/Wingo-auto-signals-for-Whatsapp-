import express from 'express';
import path from 'path';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './server/config/index.js';
import { logger } from './server/services/logger.js';
import { initDatabase } from './server/db/index.js';
import { apiRateLimiter } from './server/middleware/rate-limiter.js';
import { errorHandler } from './server/middleware/error.js';

// Route imports
import { authRouter } from './server/routes/auth.js';
import { whatsAppRouter } from './server/routes/whatsapp.js';
import { botRouter } from './server/routes/bot.js';
import { signalsRouter } from './server/routes/signals.js';
import { statisticsRouter } from './server/routes/statistics.js';
import { settingsRouter } from './server/routes/settings.js';
import { templatesRouter } from './server/routes/templates.js';
import { sessionsRouter } from './server/routes/sessions.js';
import { remindersRouter } from './server/routes/reminders.js';
import { healthRouter } from './server/routes/health.js';
import { sessionScheduler } from './server/services/sessionScheduler.js';
import { sessionReminderService } from './server/services/sessionReminderService.js';
import { whatsAppManager } from './server/whatsapp/client.js';
import { botModeManager } from './server/services/botModeManager.js';

async function startServer() {
  const app = express();
  const PORT = config.PORT || 3000;

  // Trust proxy for reverse proxies / Cloud Run load balancers
  app.set('trust proxy', 1);

  // Security Middleware
  app.use(
    helmet({
      contentSecurityPolicy: false, // Disabled for Vite dev server compatibility and WebSocket HMR
      crossOriginEmbedderPolicy: false,
    })
  );

  app.use(
    cors({
      origin: true,
      credentials: true,
    })
  );

  app.use(cookieParser());
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));

  // General API Rate Limiting
  app.use('/api', apiRateLimiter);

  // Mount API Routes
  app.use('/api/health', healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/whatsapp', whatsAppRouter);
  app.use('/api/bot', botRouter);
  app.use('/api/signals', signalsRouter);
  app.use('/api/statistics', statisticsRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/templates', templatesRouter);
  app.use('/api/sessions', sessionsRouter);
  app.use('/api/reminders', remindersRouter);

  // Initialize Database & Background Services
  try {
    await initDatabase();
    // Restore WhatsApp connection on startup if stored credentials exist (Requirement 16)
    await whatsAppManager.initOnStartup();
    // Restore authoritative Bot Mode (NORMAL | SESSION | STOPPED) from PostgreSQL (Requirement 17 & 18)
    await botModeManager.initOnStartup();
    // Start Pre-Session Reminder background scheduler (Single Node.js backend instance)
    await sessionReminderService.start();
  } catch (err: any) {
    logger.error({ err: err.message }, 'Database or service initialization warning');
  }

  // Vite development middleware or static production serving
  if (config.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Centralized Error Handler
  app.use(errorHandler);

  const server = app.listen(PORT, '0.0.0.0', () => {
    logger.info(`Server is running at http://0.0.0.0:${PORT} in ${config.NODE_ENV} mode`);
  });

  // Graceful shutdown handling
  const shutdown = () => {
    logger.info('Shutting down server gracefully...');
    server.close(() => {
      logger.info('HTTP server closed.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  return { app, server };
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});

import { DateTime } from 'luxon';
import { query } from '../db/index.js';
import { logger } from './logger.js';
import { whatsAppManager } from '../whatsapp/client.js';
import { getActiveWhatsAppDestination } from './destination.js';
import { templateService } from './templates.js';

export interface ReminderSettings {
  enabled: boolean;
  minutesBefore: number;
  websiteUrl: string;
  template: string;
  destination: string | null;
  timezone: string;
}

export interface SessionReminderRecord {
  id: number;
  session_config_id: number | null;
  session_name: string;
  schedule_date: string;
  session_time: string;
  session_time_formatted: string;
  reminder_time: string;
  reminder_time_formatted: string;
  status: 'SENT' | 'FAILED' | 'MISSED' | 'SKIPPED' | string;
  destination: string | null;
  message: string | null;
  error: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

export class SessionReminderService {
  private timer: NodeJS.Timeout | null = null;
  private isEvaluating = false;
  private defaultTimezone = 'Asia/Karachi';
  private defaultMinutesBefore = 30;
  private defaultWebsiteUrl = 'https://example.com';

  /**
   * Helper to format 24h "HH:mm" time to 12h "hh:mm AM/PM"
   */
  public format12h(time24: string): string {
    if (!time24) return '';
    const parts = time24.split(':');
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1] || '0', 10);
    if (isNaN(hours)) return time24;
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const h12 = hours % 12 || 12;
    return `${h12.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  }

  /**
   * Reads configured operating timezone from settings.
   */
  async getTimezone(): Promise<string> {
    try {
      const res = await query<{ value: string }>(
        `SELECT value FROM settings WHERE key = 'bot_timezone'`
      );
      return res.rows[0]?.value?.trim() || this.defaultTimezone;
    } catch {
      return this.defaultTimezone;
    }
  }

  /**
   * Retrieves current reminder configuration and message template.
   */
  async getSettings(): Promise<ReminderSettings> {
    try {
      const res = await query<{ key: string; value: string }>(
        `SELECT key, value FROM settings WHERE key IN (
          'reminder_enabled',
          'reminder_minutes_before',
          'reminder_website_url',
          'bot_timezone'
        )`
      );

      const map: Record<string, string> = {};
      for (const row of res.rows) {
        map[row.key] = row.value;
      }

      const tpl = await templateService.getTemplate('REMINDER');
      const destination = await getActiveWhatsAppDestination();
      const tz = map['bot_timezone'] || this.defaultTimezone;

      return {
        enabled: map['reminder_enabled'] !== 'false',
        minutesBefore: parseInt(map['reminder_minutes_before'] || `${this.defaultMinutesBefore}`, 10) || 30,
        websiteUrl: map['reminder_website_url'] || this.defaultWebsiteUrl,
        template: tpl.template,
        destination,
        timezone: tz,
      };
    } catch (err: any) {
      logger.error({ err: err.message }, 'Failed to load reminder settings from database');
      const tpl = await templateService.getTemplate('REMINDER');
      return {
        enabled: true,
        minutesBefore: 30,
        websiteUrl: this.defaultWebsiteUrl,
        template: tpl.template,
        destination: null,
        timezone: this.defaultTimezone,
      };
    }
  }

  /**
   * Saves updated reminder settings and custom message template.
   */
  async updateSettings(data: {
    enabled?: boolean;
    minutesBefore?: number;
    websiteUrl?: string;
    template?: string;
  }): Promise<ReminderSettings> {
    if (data.enabled !== undefined) {
      await query(
        `INSERT INTO settings (key, value, updated_at) VALUES ('reminder_enabled', $1, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [data.enabled ? 'true' : 'false']
      );
    }

    if (data.minutesBefore !== undefined) {
      const mins = Math.max(1, Math.min(1440, Number(data.minutesBefore) || 30));
      await query(
        `INSERT INTO settings (key, value, updated_at) VALUES ('reminder_minutes_before', $1, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [mins.toString()]
      );
    }

    if (data.websiteUrl !== undefined) {
      const url = data.websiteUrl.trim();
      await query(
        `INSERT INTO settings (key, value, updated_at) VALUES ('reminder_website_url', $1, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [url]
      );
    }

    if (data.template !== undefined) {
      await templateService.updateTemplate('REMINDER', data.template, true);
    }

    logger.info('Pre-session reminder settings updated successfully in PostgreSQL.');
    return this.getSettings();
  }

  /**
   * Resets reminder message template to the default prompt message.
   */
  async resetDefaultTemplate(): Promise<ReminderSettings> {
    await templateService.resetTemplate('REMINDER');
    return this.getSettings();
  }

  /**
   * Renders the reminder message template safely with all variables replaced.
   * Guarantees that "undefined", "null", or "[object Object]" is never output.
   */
  async renderReminderMessage(variables: {
    sessionName?: string;
    sessionTime?: string;
    targetWins?: number | string;
    websiteUrl?: string;
    date?: string;
    timezone?: string;
    minutesRemaining?: number;
    minutes_remaining?: number | string;
  }): Promise<string> {
    const settings = await this.getSettings();
    const tz = variables.timezone || settings.timezone;
    const nowTz = DateTime.now().setZone(tz);
    const dateStr = variables.date || nowTz.toFormat('yyyy-MM-dd');
    const minRem = variables.minutes_remaining !== undefined ? variables.minutes_remaining : variables.minutesRemaining ?? 30;

    return templateService.render('REMINDER', {
      session_name: variables.sessionName || 'Afternoon Session',
      sessionName: variables.sessionName || 'Afternoon Session',
      session_time: variables.sessionTime || '02:00 PM',
      sessionTime: variables.sessionTime || '02:00 PM',
      target: variables.targetWins || 10,
      targetWins: variables.targetWins || 10,
      website_link: variables.websiteUrl || settings.websiteUrl,
      websiteLink: variables.websiteUrl || settings.websiteUrl,
      date: dateStr,
      timezone: tz,
      minutes_remaining: minRem,
      minutesRemaining: minRem,
    });
  }

  /**
   * Sends a real test reminder to the active WhatsApp channel.
   * Does NOT start a session, create a prediction, count WIN/LOSS, or complete target.
   */
  async sendTestReminder(): Promise<{
    success: boolean;
    destination: string;
    messageId?: string;
    renderedMessage: string;
    message: string;
  }> {
    const settings = await this.getSettings();
    const destination = await getActiveWhatsAppDestination();

    if (!destination) {
      throw new Error('No WhatsApp Newsletter destination configured. Please configure your Channel JID in Settings.');
    }

    const waCheck = await whatsAppManager.isReady();
    if (!waCheck.ready) {
      throw new Error(`WhatsApp is not connected: ${waCheck.reason || 'Please connect WhatsApp first'}`);
    }

    const rendered = await this.renderReminderMessage({
      sessionName: 'Afternoon Session (Sample Test)',
      sessionTime: '02:00 PM',
      targetWins: 10,
      websiteUrl: settings.websiteUrl,
      timezone: settings.timezone,
    });

    const sendRes = await whatsAppManager.sendMessage(
      rendered,
      destination,
      'PRE_SESSION_REMINDER_TEST'
    );

    return {
      success: true,
      destination,
      messageId: sendRes.messageId,
      renderedMessage: rendered,
      message: `Test pre-session reminder delivered successfully to ${destination}`,
    };
  }

  /**
   * Retrieves reminder delivery history from database.
   */
  async getReminderHistory(limit = 50): Promise<SessionReminderRecord[]> {
    try {
      const res = await query<any>(
        `SELECT * FROM session_reminders ORDER BY created_at DESC LIMIT $1`,
        [Math.min(limit, 200)]
      );

      return res.rows.map((row: any) => ({
        id: row.id,
        session_config_id: row.session_config_id,
        session_name: row.session_name,
        schedule_date: row.schedule_date,
        session_time: row.session_time,
        session_time_formatted: this.format12h(row.session_time),
        reminder_time: row.reminder_time,
        reminder_time_formatted: this.format12h(row.reminder_time),
        status: row.status,
        destination: row.destination,
        message: row.message,
        error: row.error,
        sent_at: row.sent_at ? new Date(row.sent_at).toISOString() : null,
        created_at: row.created_at ? new Date(row.created_at).toISOString() : '',
        updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : '',
      }));
    } catch (err: any) {
      logger.error({ err: err.message }, 'Failed to query reminder history');
      return [];
    }
  }

  /**
   * Starts the background reminder scheduler singleton.
   * Runs 100% server-side in Node.js independent of browser or client.
   */
  async start(): Promise<void> {
    if (this.timer) {
      return;
    }

    logger.info('Starting WinGo Pre-Session Reminder Scheduler (Server-Side Node.js)...');

    // Initial immediate evaluation
    this.evaluateReminders().catch((err) => {
      logger.error({ err: err.message }, 'Error during initial reminder evaluation');
    });

    // Run evaluation every 5 seconds
    this.timer = setInterval(() => {
      this.evaluateReminders().catch((err) => {
        logger.error({ err: err.message }, 'Error in reminder evaluation loop');
      });
    }, 5000);
  }

  /**
   * Evaluates reminders immediately on bot / session scheduler startup.
   */
  async checkAndTriggerStartupReminder(): Promise<void> {
    logger.info('[REMINDER STARTUP] Checking upcoming sessions for on-time or catch-up pre-session reminders...');
    await this.evaluateReminders();
  }

  /**
   * Stops the background reminder scheduler.
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    logger.info('WinGo Pre-Session Reminder Scheduler stopped.');
  }

  /**
   * Core server-side evaluation algorithm.
   *
   * Features:
   * 1. 30-minute pre-session calculation strictly in configured timezone (Asia/Karachi).
   * 2. Persistent duplicate protection via PostgreSQL database state.
   * 3. Render restart recovery:
   *    - If restarted before reminder: sends on time at 30m prior to start.
   *    - If restarted after reminder (> 2 minutes late): marks as MISSED safely, NEVER sends outdated reminder.
   * 4. Session time changes: uses latest saved session time automatically.
   * 5. Disabled sessions: skips sending reminder.
   * 6. Independent multi-session support.
   * 7. WhatsApp connectivity verification: handles disconnects without crashing.
   * 8. Active WhatsApp Channel destination resolution.
   */
  async evaluateReminders(): Promise<void> {
    if (this.isEvaluating) return;
    this.isEvaluating = true;

    try {
      const settings = await this.getSettings();

      // If pre-session reminder feature is disabled by admin, skip evaluation
      if (!settings.enabled) {
        return;
      }

      const tz = settings.timezone || this.defaultTimezone;
      const nowTz = DateTime.now().setZone(tz);
      const todayDateStr = nowTz.toFormat('yyyy-MM-dd');
      const tomorrowDateStr = nowTz.plus({ days: 1 }).toFormat('yyyy-MM-dd');

      // Fetch all session configs
      const configsRes = await query<any>('SELECT * FROM session_configs ORDER BY start_time ASC');
      const configs = configsRes.rows;
      if (configs.length === 0) return;

      const destination = await getActiveWhatsAppDestination();
      const minutesBefore = settings.minutesBefore || 30;

      // Evaluate candidates for today and tomorrow (in case of midnight boundary crossings)
      type Candidate = {
        config: any;
        scheduleDate: string;
        sessionStartDt: DateTime;
        reminderDt: DateTime;
      };

      const candidates: Candidate[] = [];

      for (const config of configs) {
        if (!config.start_time || typeof config.start_time !== 'string') continue;
        const [h, m] = config.start_time.split(':').map(Number);
        if (isNaN(h) || isNaN(m)) continue;

        // Candidate 1: Today
        const todayStartDt = nowTz.set({ hour: h, minute: m, second: 0, millisecond: 0 });
        const todayReminderDt = todayStartDt.minus({ minutes: minutesBefore });
        candidates.push({
          config,
          scheduleDate: todayDateStr,
          sessionStartDt: todayStartDt,
          reminderDt: todayReminderDt,
        });

        // Candidate 2: Tomorrow (for sessions crossing midnight)
        const tomorrowStartDt = nowTz.plus({ days: 1 }).set({ hour: h, minute: m, second: 0, millisecond: 0 });
        const tomorrowReminderDt = tomorrowStartDt.minus({ minutes: minutesBefore });
        // Only consider tomorrow if reminder time is today (within 2 hours)
        if (tomorrowReminderDt.toFormat('yyyy-MM-dd') === todayDateStr) {
          candidates.push({
            config,
            scheduleDate: tomorrowDateStr,
            sessionStartDt: tomorrowStartDt,
            reminderDt: tomorrowReminderDt,
          });
        }
      }

      for (const item of candidates) {
        const { config, scheduleDate, sessionStartDt, reminderDt } = item;
        const sessionTimeStr = config.start_time;
        const reminderTimeStr = reminderDt.toFormat('HH:mm');

        // Clean up any stale records from previous session time edits before this reminder
        try {
          await query(
            `UPDATE session_reminders
             SET status = 'SKIPPED', error = 'Session time changed by admin to ' || $1, updated_at = NOW()
             WHERE session_config_id = $2 AND schedule_date = $3 AND session_time != $1 AND status = 'PENDING'`,
            [sessionTimeStr, config.id, scheduleDate]
          );
        } catch {}

        // Query existing reminder record for this specific session occurrence
        const existingRes = await query<any>(
          `SELECT * FROM session_reminders
           WHERE session_config_id = $1 AND schedule_date = $2 AND session_time = $3`,
          [config.id, scheduleDate, sessionTimeStr]
        );

        const existingRecord = existingRes.rows[0] || null;

        // DUPLICATE PROTECTION:
        // If already marked SENT, MISSED, or SKIPPED, do nothing!
        if (
          existingRecord &&
          (existingRecord.status === 'SENT' ||
            existingRecord.status === 'MISSED' ||
            existingRecord.status === 'SKIPPED')
        ) {
          continue;
        }

        // SESSION DISABLED:
        // If the session config is disabled, do NOT send the reminder!
        if (!config.enabled) {
          if (!existingRecord) {
            await query(
              `INSERT INTO session_reminders (
                session_config_id, session_name, schedule_date, session_time, reminder_time,
                status, destination, error, created_at, updated_at
              ) VALUES ($1, $2, $3, $4, $5, 'SKIPPED', $6, 'Session disabled by admin', NOW(), NOW())
              ON CONFLICT (session_config_id, schedule_date, session_time) DO NOTHING`,
              [config.id, config.session_name, scheduleDate, sessionTimeStr, reminderTimeStr, destination || 'none']
            );
          } else if (existingRecord.status === 'PENDING') {
            await query(
              `UPDATE session_reminders SET status = 'SKIPPED', error = 'Session disabled by admin', updated_at = NOW() WHERE id = $1`,
              [existingRecord.id]
            );
          }
          continue;
        }

        // Calculate diff between current time and reminder time in seconds
        const reminderDiffSeconds = Math.floor(nowTz.diff(reminderDt).as('seconds'));
        const sessionUntilStartSeconds = Math.floor(sessionStartDt.diff(nowTz).as('seconds'));

        // CASE 1: Reminder time has NOT arrived yet (reminderDiffSeconds < 0)
        // e.g. now is 01:15 PM, reminder is at 01:30 PM (reminderDiffSeconds = -900s)
        if (reminderDiffSeconds < 0) {
          // Do NOT send the reminder before time
          continue;
        }

        // CASE 2: DO NOT SEND AFTER SESSION START
        // If currentTime >= sessionStartTime (sessionUntilStartSeconds <= 0)
        // Example: Session: 02:00 PM, Bot starts: 02:05 PM
        // Do NOT send the reminder. The session has already started.
        if (sessionUntilStartSeconds <= 0) {
          // Outdated: Session already in progress or completed
          if (!existingRecord) {
            await query(
              `INSERT INTO session_reminders (
                session_config_id, session_name, schedule_date, session_time, reminder_time,
                status, destination, error, created_at, updated_at
              ) VALUES ($1, $2, $3, $4, $5, 'MISSED', $6, 'Session has already started. Reminder skipped safely.', NOW(), NOW())
              ON CONFLICT (session_config_id, schedule_date, session_time) DO NOTHING`,
              [config.id, config.session_name, scheduleDate, sessionTimeStr, reminderTimeStr, destination || 'none']
            );
          } else if (existingRecord.status !== 'SENT') {
            await query(
              `UPDATE session_reminders SET status = 'MISSED', error = 'Session has already started. Reminder skipped safely.', updated_at = NOW() WHERE id = $1`,
              [existingRecord.id]
            );
          }
          continue;
        }

        // CASE 3: CATCH-UP & NORMAL REMINDER WINDOW
        // reminderTime <= currentTime < sessionStartTime
        // AND the reminder for that session has not already been sent!
        // Calculate dynamic remaining time
        const remainingSeconds = sessionUntilStartSeconds;
        let minutesRemaining: number;
        if (remainingSeconds < 60) {
          minutesRemaining = 0; // Less than 1 minute
        } else {
          // Calculate dynamic remaining minutes:
          // Examples:
          // 01:45 PM -> 15 min
          // 01:50 PM -> 10 min
          // 01:55 PM -> 5 min
          // 01:58 PM -> 2 min
          // 01:59 PM -> 1 min
          minutesRemaining = Math.max(1, Math.round(remainingSeconds / 60));
        }

        const isCatchUp = reminderDiffSeconds > 60;

        if (!destination) {
          const errMsg = 'Cannot send reminder: No active WhatsApp Newsletter destination configured';
          logger.warn(errMsg);
          if (!existingRecord) {
            await query(
              `INSERT INTO session_reminders (
                session_config_id, session_name, schedule_date, session_time, reminder_time,
                status, destination, error, created_at, updated_at
              ) VALUES ($1, $2, $3, $4, $5, 'FAILED', 'none', $6, NOW(), NOW())
              ON CONFLICT (session_config_id, schedule_date, session_time) DO NOTHING`,
              [config.id, config.session_name, scheduleDate, sessionTimeStr, reminderTimeStr, errMsg]
            );
          }
          continue;
        }

        // WHATSAPP CONNECTION CHECK:
        // Check WhatsApp connection before sending.
        // If disconnected: do NOT mark as SENT; do not crash; use existing reconnect system.
        const isWaConnected = whatsAppManager.whatsappConnected();
        if (!isWaConnected) {
          const errMsg = 'WhatsApp is disconnected. Reminder dispatch deferred or waiting for reconnection.';
          logger.warn({ session: config.session_name }, errMsg);

          if (!existingRecord) {
            await query(
              `INSERT INTO session_reminders (
                session_config_id, session_name, schedule_date, session_time, reminder_time,
                status, destination, error, created_at, updated_at
              ) VALUES ($1, $2, $3, $4, $5, 'FAILED', $6, $7, NOW(), NOW())
              ON CONFLICT (session_config_id, schedule_date, session_time) DO NOTHING`,
              [config.id, config.session_name, scheduleDate, sessionTimeStr, reminderTimeStr, destination, errMsg]
            );
          } else {
            await query(
              `UPDATE session_reminders SET status = 'FAILED', error = $1, updated_at = NOW() WHERE id = $2`,
              [errMsg, existingRecord.id]
            );
          }

          // Trigger safe background reconnect if needed
          try {
            whatsAppManager.reconnect().catch(() => {});
          } catch {}
          continue;
        }

        // Render formatted message with dynamic remaining time
        const rendered = await this.renderReminderMessage({
          sessionName: config.session_name,
          sessionTime: this.format12h(sessionTimeStr),
          targetWins: config.target_wins || 10,
          websiteUrl: settings.websiteUrl,
          date: scheduleDate,
          timezone: tz,
          minutesRemaining,
          minutes_remaining: minutesRemaining,
        });

        // Send reminder to configured WhatsApp channel
        try {
          const logPrefix = isCatchUp ? '[CATCH-UP REMINDER ⚡]' : '[SCHEDULED REMINDER 🔔]';
          const remainingDesc = minutesRemaining < 1 ? 'less than 1 minute' : `${minutesRemaining} min`;
          logger.info(
            `${logPrefix} Sending pre-session reminder for "${config.session_name}" (Session: ${this.format12h(sessionTimeStr)}, Starting in: ${remainingDesc}) to ${destination}`
          );

          await whatsAppManager.sendMessage(
            rendered,
            destination,
            isCatchUp ? 'PRE_SESSION_REMINDER_CATCHUP' : 'PRE_SESSION_REMINDER'
          );

          // Atomic insert or update to SENT status
          if (!existingRecord) {
            await query(
              `INSERT INTO session_reminders (
                session_config_id, session_name, schedule_date, session_time, reminder_time,
                status, destination, message, error, sent_at, created_at, updated_at
              ) VALUES ($1, $2, $3, $4, $5, 'SENT', $6, $7, NULL, NOW(), NOW(), NOW())
              ON CONFLICT (session_config_id, schedule_date, session_time)
              DO UPDATE SET status = 'SENT', destination = EXCLUDED.destination, message = EXCLUDED.message, error = NULL, sent_at = NOW(), updated_at = NOW()`,
              [config.id, config.session_name, scheduleDate, sessionTimeStr, reminderTimeStr, destination, rendered]
            );
          } else {
            await query(
              `UPDATE session_reminders
               SET status = 'SENT', destination = $1, message = $2, error = NULL, sent_at = NOW(), updated_at = NOW()
               WHERE id = $3`,
              [destination, rendered, existingRecord.id]
            );
          }

          console.log(`[REMINDER] ✅ ${isCatchUp ? 'Catch-up' : 'Scheduled'} pre-session reminder delivered successfully to WhatsApp: ${destination}`);
        } catch (sendErr: any) {
          const errMsg = sendErr.message || 'WhatsApp message transmission failed';
          logger.error({ err: errMsg, session: config.session_name }, 'Failed to deliver pre-session reminder');

          if (!existingRecord) {
            await query(
              `INSERT INTO session_reminders (
                session_config_id, session_name, schedule_date, session_time, reminder_time,
                status, destination, message, error, created_at, updated_at
              ) VALUES ($1, $2, $3, $4, $5, 'FAILED', $6, $7, $8, NOW(), NOW())
              ON CONFLICT (session_config_id, schedule_date, session_time)
              DO UPDATE SET status = 'FAILED', error = EXCLUDED.error, updated_at = NOW()`,
              [config.id, config.session_name, scheduleDate, sessionTimeStr, reminderTimeStr, destination, rendered, errMsg]
            );
          } else {
            await query(
              `UPDATE session_reminders SET status = 'FAILED', error = $1, updated_at = NOW() WHERE id = $2`,
              [errMsg, existingRecord.id]
            );
          }
        }
      }
    } catch (err: any) {
      logger.error({ err: err.message }, 'Unexpected error in evaluateReminders');
    } finally {
      this.isEvaluating = false;
    }
  }
}

export const sessionReminderService = new SessionReminderService();

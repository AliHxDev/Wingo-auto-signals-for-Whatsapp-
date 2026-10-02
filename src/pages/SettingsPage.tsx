import React, { useState, useEffect } from 'react';
import {
  Sliders,
  Save,
  MessageSquare,
  Percent,
  Clock,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Info,
  Globe,
  RefreshCw,
  ExternalLink,
  Zap,
  Bell,
  Send,
  RotateCcw,
  Link,
  History,
  Check,
  Server,
  Database,
  Copy,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Key,
  Terminal,
  ShieldCheck,
} from 'lucide-react';
import { api } from '../services/api.js';
import type { AppSettings, WinGoStatus, ReminderSettings, SessionReminderRecord } from '../types/index.js';

interface SettingsPageProps {
  settings: AppSettings | null;
  onRefreshSettings: () => void;
  onNotification: (msg: string, isError?: boolean) => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  settings,
  onRefreshSettings,
  onNotification,
}) => {
  const [newsletterJid, setNewsletterJid] = useState('');
  const [channelInput, setChannelInput] = useState('');
  const [confidenceThreshold, setConfidenceThreshold] = useState(65);
  const [pollingInterval, setPollingInterval] = useState(60);
  const [wingoApiUrl, setWingoApiUrl] = useState('');
  const [botTimezone, setBotTimezone] = useState('Asia/Karachi');
  const [missedSessionPolicy, setMissedSessionPolicy] = useState('START_IF_WITHIN_WINDOW');
  const [missedSessionGraceMinutes, setMissedSessionGraceMinutes] = useState(120);
  const [loading, setLoading] = useState(false);
  const [resolvingChannel, setResolvingChannel] = useState(false);
  const [testingWingo, setTestingWingo] = useState(false);
  const [wingoTestResult, setWingoTestResult] = useState<any>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // 24/7 Hosting & Database Diagnostics State
  const [systemHealth, setSystemHealth] = useState<any>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [copiedHealthUrl, setCopiedHealthUrl] = useState(false);
  const [showDeployGuide, setShowDeployGuide] = useState(false);

  // Runtime Database & Environment Variable Management State
  const [dbUrlInput, setDbUrlInput] = useState('');
  const [dbSsl, setDbSsl] = useState(true);
  const [showDbPassword, setShowDbPassword] = useState(false);
  const [isConnectingDb, setIsConnectingDb] = useState(false);
  const [dbResultMsg, setDbResultMsg] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [envInfo, setEnvInfo] = useState<any>(null);
  const [showEnvManager, setShowEnvManager] = useState(false);
  const [adminUsernameInput, setAdminUsernameInput] = useState('admin');
  const [serverPortInput, setServerPortInput] = useState('3000');
  const [nodeEnvInput, setNodeEnvInput] = useState('production');
  const [isSavingEnv, setIsSavingEnv] = useState(false);

  // Pre-Session Reminder State
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [reminderMinutesBefore, setReminderMinutesBefore] = useState(30);
  const [websiteUrl, setWebsiteUrl] = useState('https://example.com');
  const [reminderTemplate, setReminderTemplate] = useState('');
  const [reminderDestination, setReminderDestination] = useState<string | null>(null);
  const [reminderLoading, setReminderLoading] = useState(false);
  const [savingReminder, setSavingReminder] = useState(false);
  const [resettingReminder, setResettingReminder] = useState(false);
  const [sendingTestReminder, setSendingTestReminder] = useState(false);
  const [testReminderResult, setTestReminderResult] = useState<string | null>(null);
  const [reminderHistory, setReminderHistory] = useState<SessionReminderRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const loadHealthData = async () => {
    try {
      setHealthLoading(true);
      const res = await api.getHealth();
      setSystemHealth(res);
    } catch {
      // Ignore
    } finally {
      setHealthLoading(false);
    }
  };

  // Load reminder settings & history
  const loadReminderData = async () => {
    try {
      setReminderLoading(true);
      const [remSettings, remHistory] = await Promise.all([
        api.getReminderSettings(),
        api.getReminderHistory(20),
      ]);
      setReminderEnabled(remSettings.enabled);
      setReminderMinutesBefore(remSettings.minutesBefore || 30);
      setWebsiteUrl(remSettings.websiteUrl || 'https://example.com');
      setReminderTemplate(remSettings.template);
      setReminderDestination(remSettings.destination);
      setReminderHistory(remHistory);
    } catch (err: any) {
      // Ignore or log softly
    } finally {
      setReminderLoading(false);
    }
  };

  // Load environment variables & runtime database info
  const loadEnvData = async () => {
    try {
      const res = await api.getEnvironment();
      setEnvInfo(res);
      if (res.rawEnv) {
        if (res.rawEnv.ADMIN_USERNAME) setAdminUsernameInput(res.rawEnv.ADMIN_USERNAME);
        if (res.rawEnv.PORT) setServerPortInput(res.rawEnv.PORT);
        if (res.rawEnv.NODE_ENV) setNodeEnvInput(res.rawEnv.NODE_ENV);
        if (res.rawEnv.DATABASE_SSL) setDbSsl(res.rawEnv.DATABASE_SSL !== 'false');
      }
    } catch {
      // Ignore
    }
  };

  useEffect(() => {
    loadReminderData();
    loadHealthData();
    loadEnvData();
  }, []);

  const handleConnectDatabase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dbUrlInput.trim()) {
      setDbResultMsg({ type: 'error', message: 'Please enter a valid PostgreSQL Database URL.' });
      return;
    }
    setIsConnectingDb(true);
    setDbResultMsg(null);
    try {
      const res = await api.updateDatabaseConnection(dbUrlInput.trim(), dbSsl);
      setDbResultMsg({ type: 'success', message: res.message });
      onNotification('PostgreSQL connected and tables synced successfully!');
      setDbUrlInput('');
      await loadHealthData();
      await loadEnvData();
      onRefreshSettings();
    } catch (err: any) {
      setDbResultMsg({ type: 'error', message: err.message || 'Failed to connect to database' });
      onNotification(err.message || 'Database connection failed', true);
    } finally {
      setIsConnectingDb(false);
    }
  };

  const handleSaveEnv = async () => {
    setIsSavingEnv(true);
    try {
      const res = await api.updateEnvironment({
        ADMIN_USERNAME: adminUsernameInput.trim(),
        PORT: serverPortInput.trim(),
        NODE_ENV: nodeEnvInput.trim(),
        DATABASE_SSL: dbSsl ? 'true' : 'false',
      });
      onNotification(res.message);
      await loadEnvData();
    } catch (err: any) {
      onNotification(err.message || 'Failed to update environment variables', true);
    } finally {
      setIsSavingEnv(false);
    }
  };

  const handleCopyHealthUrl = () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const healthUrl = `${origin}/health`;
    navigator.clipboard.writeText(healthUrl);
    setCopiedHealthUrl(true);
    onNotification(`Health check URL copied: ${healthUrl}`);
    setTimeout(() => setCopiedHealthUrl(false), 2500);
  };

  const handleSaveReminderSettings = async () => {
    if (!websiteUrl.trim()) {
      onNotification('Please provide a valid Website URL for the reminder.', true);
      return;
    }

    setSavingReminder(true);
    try {
      const res = await api.updateReminderSettings({
        enabled: reminderEnabled,
        minutesBefore: reminderMinutesBefore,
        websiteUrl: websiteUrl.trim(),
        template: reminderTemplate,
      });
      onNotification(res.message);
      setReminderEnabled(res.settings.enabled);
      setReminderMinutesBefore(res.settings.minutesBefore);
      setWebsiteUrl(res.settings.websiteUrl);
      setReminderTemplate(res.settings.template);
      setReminderDestination(res.settings.destination);
    } catch (err: any) {
      onNotification(err.message || 'Failed to save reminder settings', true);
    } finally {
      setSavingReminder(false);
    }
  };

  const handleResetReminderTemplate = async () => {
    setResettingReminder(true);
    try {
      const res = await api.resetReminderTemplate();
      setReminderTemplate(res.settings.template);
      onNotification(res.message);
    } catch (err: any) {
      onNotification(err.message || 'Failed to reset reminder template', true);
    } finally {
      setResettingReminder(false);
    }
  };

  const handleSendTestReminder = async () => {
    setSendingTestReminder(true);
    setTestReminderResult(null);
    try {
      const res = await api.sendTestReminder();
      setTestReminderResult(res.renderedMessage);
      onNotification(`Test reminder delivered to ${res.destination}`);
      // Refresh history to see newly recorded test if logged
      api.getReminderHistory(20).then(setReminderHistory).catch(() => {});
    } catch (err: any) {
      onNotification(err.message || 'Failed to send test reminder', true);
    } finally {
      setSendingTestReminder(false);
    }
  };

  const handleRefreshHistory = async () => {
    setHistoryLoading(true);
    try {
      const history = await api.getReminderHistory(30);
      setReminderHistory(history);
      onNotification('Reminder history refreshed');
    } catch (err: any) {
      onNotification(err.message || 'Failed to refresh reminder history', true);
    } finally {
      setHistoryLoading(false);
    }
  };

  const insertVariableIntoTemplate = (variableTag: string) => {
    setReminderTemplate((prev) => {
      return prev ? `${prev} ${variableTag}` : variableTag;
    });
  };

  // Real-time preview calculation
  const getRenderedPreview = (): string => {
    const cleanWeb = websiteUrl.trim() || 'https://example.com';
    const text = reminderTemplate || '';
    return text
      .replace(/start in \{minutes_remaining\}\s*minutes?/gi, 'start in 30 minutes')
      .replace(/\{minutes_remaining\}|\{minutesRemaining\}/g, '30')
      .replace(/\{session_name\}|\{sessionName\}/g, 'Afternoon Session')
      .replace(/\{session_time\}|\{sessionTime\}/g, '02:00 PM')
      .replace(/\{target\}|\{targetWins\}/g, '10')
      .replace(/\{website_link\}|\{websiteLink\}/g, cleanWeb)
      .replace(/\{date\}/g, new Date().toISOString().split('T')[0])
      .replace(/\{timezone\}/g, botTimezone || 'Asia/Karachi')
      .replace(/\b(undefined|null|\[object Object\])\b/g, '');
  };

  useEffect(() => {
    if (settings) {
      setNewsletterJid(settings.newsletterJid || '');
      setConfidenceThreshold(settings.confidenceThreshold || 65);
      setPollingInterval(settings.pollingInterval || 60);
      setWingoApiUrl(
        settings.wingoApiUrl ||
          'https://draw.ar-lottery01.com/WinGo/WinGo_1M/GetHistoryIssuePage.json'
      );
      if (settings.botTimezone) setBotTimezone(settings.botTimezone);
      if (settings.missedSessionPolicy) setMissedSessionPolicy(settings.missedSessionPolicy);
      if (settings.missedSessionGraceMinutes !== undefined) setMissedSessionGraceMinutes(settings.missedSessionGraceMinutes);
    }
  }, [settings]);

  const validateJid = (input: string): boolean => {
    const val = input.trim();
    if (!val) {
      setValidationError(null);
      return true;
    }

    if (val.endsWith('@g.us')) {
      setValidationError('Error: Group JID (@g.us) detected. WhatsApp Channels require a @newsletter JID.');
      return false;
    }
    if (val.endsWith('@s.whatsapp.net')) {
      setValidationError('Error: User JID (@s.whatsapp.net) detected. Channels require a @newsletter JID.');
      return false;
    }
    if (!val.endsWith('@newsletter')) {
      setValidationError('Error: Destination must end with @newsletter (e.g. 120363411395110604@newsletter).');
      return false;
    }

    setValidationError(null);
    return true;
  };

  const handleJidChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setNewsletterJid(val);
    validateJid(val);
  };

  const handleResolveChannel = async () => {
    const input = (channelInput || newsletterJid).trim();
    if (!input) {
      onNotification('Enter a channel invite link (e.g. https://whatsapp.com/channel/...) or JID.', true);
      return;
    }

    setResolvingChannel(true);
    try {
      const res = await api.resolveChannelLink(input);
      if (res?.jid) {
        setNewsletterJid(res.jid);
        validateJid(res.jid);
        onNotification(`Channel resolved successfully: ${res.name ? `"${res.name}" ` : ''}(${res.jid})`);
      }
    } catch (err: any) {
      onNotification(err.message || 'Could not resolve channel link. You can paste the raw @newsletter JID directly.', true);
    } finally {
      setResolvingChannel(false);
    }
  };

  const handleTestWingoFeed = async () => {
    setTestingWingo(true);
    setWingoTestResult(null);
    try {
      const res = await api.testWingoFeed(wingoApiUrl);
      setWingoTestResult(res);
      onNotification(`WinGo feed active: retrieved ${res.count} issues (${res.status.source === 'api' ? 'Live API' : 'Resilient Generator'})`);
    } catch (err: any) {
      onNotification(err.message || 'Failed to test WinGo feed', true);
    } finally {
      setTestingWingo(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateJid(newsletterJid)) {
      onNotification('Please correct the Newsletter JID format before saving.', true);
      return;
    }

    setLoading(true);
    try {
      const res = await api.updateSettings({
        newsletterJid: newsletterJid.trim(),
        confidenceThreshold,
        pollingInterval,
        wingoApiUrl: wingoApiUrl.trim(),
        botTimezone: botTimezone.trim(),
        missedSessionPolicy,
        missedSessionGraceMinutes,
      });

      onNotification(res.message);
      onRefreshSettings();
    } catch (err: any) {
      onNotification(err.message || 'Failed to save settings', true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl">
        <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
          <Sliders className="w-5 h-5 text-emerald-400" />
          <span>System & Channel Configuration</span>
        </h2>
        <p className="text-xs text-neutral-400 mt-0.5">
          Configuration is persisted directly in PostgreSQL and applied immediately to the active bot runner
        </p>
      </div>

      {/* Database Connection & Environment Variables Manager */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Database className="w-5 h-5 text-emerald-400" />
            <div>
              <h3 className="text-sm font-bold text-white tracking-tight">Database & Environment Variables Manager</h3>
              <p className="text-xs text-neutral-400">Configure PostgreSQL Database URL and server settings directly from this web dashboard</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              loadHealthData();
              loadEnvData();
            }}
            disabled={healthLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-neutral-950 hover:bg-neutral-800 text-neutral-300 border border-neutral-800 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${healthLoading ? 'animate-spin' : ''}`} />
            <span>Refresh Status</span>
          </button>
        </div>

        {/* Current Database Engine Status Card */}
        <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-neutral-400 flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5 text-neutral-400" />
              <span>Active Database Engine:</span>
            </span>
            {systemHealth?.database?.isRealPostgres || envInfo?.database?.isRealPostgres ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>PostgreSQL (Active & Connected)</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>In-Memory Fallback (No Postgres Linked)</span>
              </span>
            )}
          </div>
          {envInfo?.database?.maskedUrl && (
            <div className="text-[11px] text-neutral-300 font-mono bg-neutral-900/80 px-2.5 py-1.5 rounded-lg border border-neutral-800/80 break-all flex items-center gap-2">
              <span className="text-neutral-500 select-none">URL:</span>
              <span className="text-emerald-400">{envInfo.database.maskedUrl}</span>
            </div>
          )}
          <p className="text-[11px] text-neutral-400 leading-relaxed">
            {systemHealth?.database?.isRealPostgres || envInfo?.database?.isRealPostgres
              ? 'Persistent storage active. WhatsApp credentials, sessions, and templates survive all server restarts.'
              : 'Running in preview in-memory mode. Connect a real PostgreSQL database below (Oracle localhost, Supabase, Railway, or Render) to persist sessions 24/7.'}
          </p>
        </div>

        {/* Live Database URL Connection Form */}
        <form onSubmit={handleConnectDatabase} className="space-y-3.5 p-4 rounded-xl bg-neutral-950/70 border border-neutral-800">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="text-xs font-bold text-white flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-teal-400" />
              <span>Connect / Update PostgreSQL DATABASE_URL</span>
            </label>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-neutral-400">Quick Templates:</span>
              <button
                type="button"
                onClick={() => {
                  setDbUrlInput('postgresql://wingo_user:password@localhost:5432/wingo_bot');
                  setDbSsl(false);
                }}
                className="text-[10px] px-2 py-0.5 rounded bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border border-neutral-700 font-mono"
              >
                Oracle Localhost
              </button>
              <button
                type="button"
                onClick={() => {
                  setDbUrlInput('postgresql://postgres.your-id:your-password@aws-0-ap-south-1.pooler.supabase.com:6543/postgres');
                  setDbSsl(true);
                }}
                className="text-[10px] px-2 py-0.5 rounded bg-neutral-900 hover:bg-neutral-800 text-teal-300 border border-neutral-700 font-mono"
              >
                Supabase
              </button>
              <button
                type="button"
                onClick={() => {
                  setDbUrlInput('postgresql://postgres:your-password@postgres.railway.internal:5432/railway');
                  setDbSsl(true);
                }}
                className="text-[10px] px-2 py-0.5 rounded bg-neutral-900 hover:bg-neutral-800 text-purple-300 border border-neutral-700 font-mono"
              >
                Railway
              </button>
            </div>
          </div>

          <div className="relative">
            <input
              type={showDbPassword ? 'text' : 'password'}
              value={dbUrlInput}
              onChange={(e) => setDbUrlInput(e.target.value)}
              placeholder="postgresql://username:password@host:5432/database_name"
              className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-3.5 py-2.5 pr-10 text-xs text-white placeholder-neutral-500 font-mono focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            />
            <button
              type="button"
              onClick={() => setShowDbPassword(!showDbPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white"
            >
              {showDbPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-neutral-300">
              <input
                type="checkbox"
                checked={dbSsl}
                onChange={(e) => setDbSsl(e.target.checked)}
                className="rounded border-neutral-700 bg-neutral-900 text-emerald-500 focus:ring-emerald-500"
              />
              <span>Enable SSL mode (Check for Supabase/Neon/Railway/Render, uncheck for local Oracle VPS)</span>
            </label>

            <button
              type="submit"
              disabled={isConnectingDb || !dbUrlInput.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-950 active:scale-95"
            >
              {isConnectingDb ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              <span>{isConnectingDb ? 'Testing Connection...' : 'Test & Connect Database'}</span>
            </button>
          </div>

          {dbResultMsg && (
            <div
              className={`p-3 rounded-xl text-xs flex items-start gap-2 ${
                dbResultMsg.type === 'success'
                  ? 'bg-emerald-950/60 border border-emerald-800 text-emerald-300'
                  : 'bg-rose-950/60 border border-rose-800 text-rose-300'
              }`}
            >
              {dbResultMsg.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
              )}
              <span className="leading-relaxed">{dbResultMsg.message}</span>
            </div>
          )}
        </form>

        {/* Collapsible Additional Server Environment Variables (.env) */}
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setShowEnvManager(!showEnvManager)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-300 hover:text-white transition-colors"
          >
            <Terminal className="w-3.5 h-3.5 text-neutral-400" />
            <span>{showEnvManager ? 'Hide Server Environment Variables' : '⚙️ Manage Server Environment Variables (.env)'}</span>
            {showEnvManager ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showEnvManager && (
            <div className="mt-3 p-4 bg-neutral-950 rounded-xl border border-neutral-800 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-neutral-400 font-semibold text-[11px]">ADMIN_USERNAME</label>
                  <input
                    type="text"
                    value={adminUsernameInput}
                    onChange={(e) => setAdminUsernameInput(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-1.5 text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-neutral-400 font-semibold text-[11px]">PORT</label>
                  <input
                    type="text"
                    value={serverPortInput}
                    onChange={(e) => setServerPortInput(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-1.5 text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-neutral-400 font-semibold text-[11px]">NODE_ENV</label>
                  <select
                    value={nodeEnvInput}
                    onChange={(e) => setNodeEnvInput(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-1.5 text-white font-mono focus:outline-none focus:border-emerald-500"
                  >
                    <option value="production">production</option>
                    <option value="development">development</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={handleSaveEnv}
                  disabled={isSavingEnv}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                >
                  {isSavingEnv ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  <span>Save to .env</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 24/7 Keep-Alive & Health Monitor */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div className="p-3.5 rounded-xl bg-neutral-950 border border-neutral-800 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-neutral-400 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-neutral-400" />
                <span>24/7 Keep-Alive Uptime</span>
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-teal-500/10 text-teal-400 border border-teal-500/30">
                <Zap className="w-3 h-3" />
                <span>Active (/health)</span>
              </span>
            </div>
            <p className="text-[11px] text-neutral-400 leading-relaxed">
              Uptime: <strong className="text-white font-mono">{systemHealth?.uptimeSeconds ? `${Math.floor(systemHealth.uptimeSeconds / 60)}m ${systemHealth.uptimeSeconds % 60}s` : 'Active'}</strong>
            </p>
          </div>

          <div className="p-3.5 bg-neutral-950 rounded-xl border border-neutral-800 flex items-center justify-between gap-2">
            <div className="space-y-0.5">
              <span className="text-xs font-semibold text-white block">Health Monitor URL</span>
              <p className="text-[11px] text-neutral-400">Ping in UptimeRobot if hosted on Render</p>
            </div>
            <button
              type="button"
              onClick={handleCopyHealthUrl}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-neutral-200 border border-neutral-700 rounded-lg text-xs font-semibold transition-all active:scale-95 shrink-0"
            >
              {copiedHealthUrl ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedHealthUrl ? 'Copied!' : 'Copy URL'}</span>
            </button>
          </div>
        </div>

        {/* Deploy Guide Toggle */}
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setShowDeployGuide(!showDeployGuide)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-400 hover:text-teal-300 transition-colors"
          >
            <span>{showDeployGuide ? 'Hide Cloud Deployment Guides' : '📖 View Step-by-Step Cloud Deployment Guides (Oracle, Railway, Render)'}</span>
            {showDeployGuide ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showDeployGuide && (
            <div className="mt-3 p-4 bg-neutral-950 rounded-xl border border-neutral-800 text-xs text-neutral-300 space-y-3 leading-relaxed">
              <div className="space-y-1">
                <p className="font-bold text-white flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] flex items-center justify-center font-bold">1</span>
                  <span>Oracle Cloud Always Free (Recommended - Never Sleeps):</span>
                </p>
                <p className="text-neutral-400 text-[11px] pl-5">
                  Clone your repo on your Oracle Ubuntu VPS, run <code className="text-emerald-400 font-mono">chmod +x setup-oracle.sh && ./setup-oracle.sh</code>. It installs PostgreSQL locally and runs 24/7 on PM2! You can also connect it using the form above.
                </p>
              </div>

              <div className="space-y-1">
                <p className="font-bold text-white flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-purple-500/20 text-purple-400 text-[10px] flex items-center justify-center font-bold">2</span>
                  <span>Railway (1-Click Deploy):</span>
                </p>
                <p className="text-neutral-400 text-[11px] pl-5">
                  Connect your GitHub repo on <a href="https://railway.app" target="_blank" rel="noreferrer" className="text-purple-400 underline">Railway.app</a>, click <strong>+ Create → Database → Add PostgreSQL</strong>. Railway will link your DATABASE_URL automatically.
                </p>
              </div>

              <div className="space-y-1">
                <p className="font-bold text-white flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-teal-500/20 text-teal-400 text-[10px] flex items-center justify-center font-bold">3</span>
                  <span>Render (Free Tier):</span>
                </p>
                <p className="text-neutral-400 text-[11px] pl-5">
                  Deploy Web Service on Render and link with free Render PostgreSQL or Supabase URI using the <code className="text-teal-300 font-mono">render.yaml</code> Blueprint.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* WhatsApp Newsletter JID Section */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl">
          <div className="flex items-center gap-2 text-white font-bold text-base mb-1">
            <MessageSquare className="w-4 h-4 text-emerald-400" />
            <span>Active WhatsApp Channel Destination</span>
          </div>
          <p className="text-xs text-neutral-400 mb-4">
            Destination where all signals, WIN, and LOSS messages are broadcasted.
            Must be a valid WhatsApp Newsletter JID ending in <code className="text-emerald-400 font-mono">@newsletter</code>.
          </p>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-1.5">
                Channel JID (@newsletter)
              </label>
              <div className="flex gap-2">
                <input
                  id="settings-newsletter-jid-input"
                  type="text"
                  value={newsletterJid}
                  onChange={handleJidChange}
                  placeholder="120363411395110604@newsletter"
                  className="flex-1 px-4 py-2.5 bg-neutral-950 border border-neutral-800 rounded-xl text-white font-mono text-sm focus:outline-hidden focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
                />
              </div>
            </div>

            {/* Channel Link Resolver helper */}
            <div className="p-3 bg-neutral-950 rounded-xl border border-neutral-800">
              <label className="block text-[11px] font-semibold text-neutral-400 mb-1">
                Have a Channel Invite Link instead? (e.g. https://whatsapp.com/channel/0029Va...)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={channelInput}
                  onChange={(e) => setChannelInput(e.target.value)}
                  placeholder="https://whatsapp.com/channel/..."
                  className="flex-1 px-3 py-1.5 bg-neutral-900 border border-neutral-800 rounded-lg text-xs text-white font-mono focus:outline-hidden focus:border-emerald-500"
                />
                <button
                  type="button"
                  onClick={handleResolveChannel}
                  disabled={resolvingChannel}
                  className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-emerald-400 border border-neutral-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors disabled:opacity-50"
                >
                  {resolvingChannel ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5" />}
                  <span>Resolve to JID</span>
                </button>
              </div>
            </div>
          </div>

          {validationError && (
            <div className="mt-2.5 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{validationError}</span>
            </div>
          )}

          {!validationError && newsletterJid.endsWith('@newsletter') && (
            <div className="mt-2.5 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Valid WhatsApp Newsletter Channel identifier. Ensure your linked phone number is an Admin of this channel.</span>
            </div>
          )}
        </div>

        {/* WinGo Data Feed Configuration */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-white font-bold text-sm">
              <Globe className="w-4 h-4 text-emerald-400" />
              <span>WinGo 1M Data Feed & Fallback Engine</span>
            </div>
            <button
              type="button"
              onClick={handleTestWingoFeed}
              disabled={testingWingo}
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-neutral-800 hover:bg-neutral-700 text-emerald-400 border border-neutral-700 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
            >
              {testingWingo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
              <span>Test Feed Now</span>
            </button>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-1.5">
              API Feed URL
            </label>
            <input
              id="settings-wingo-url-input"
              type="url"
              value={wingoApiUrl}
              onChange={(e) => setWingoApiUrl(e.target.value)}
              placeholder="https://draw.ar-lottery01.com/WinGo/WinGo_1M/GetHistoryIssuePage.json"
              className="w-full px-4 py-2.5 bg-neutral-950 border border-neutral-800 rounded-xl text-white font-mono text-xs focus:outline-hidden focus:border-emerald-500"
            />
          </div>

          {wingoTestResult && (
            <div className="p-3 bg-neutral-950 rounded-xl border border-neutral-800 text-xs space-y-1 font-mono">
              <div className="flex items-center justify-between text-emerald-400 font-bold">
                <span>Feed Status: OK</span>
                <span>Source: {wingoTestResult.status?.source}</span>
              </div>
              <div className="text-neutral-400">
                Latest period: <span className="text-neutral-200">{wingoTestResult.sample?.[0]?.issueNumber}</span> (Number: {wingoTestResult.sample?.[0]?.number}, Size: {wingoTestResult.sample?.[0]?.size})
              </div>
            </div>
          )}

          <div className="p-3 bg-neutral-950/60 rounded-xl border border-neutral-800/80 text-[11px] text-neutral-400 flex items-start gap-2">
            <Info className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>
              <strong>Resilient Architecture:</strong> If the external WinGo endpoint blocks or rate-limits requests, the autonomous simulation engine immediately provides deterministic outcomes synchronized to the exact UTC clock minute, ensuring 100% bot uptime.
            </span>
          </div>
        </div>

        {/* Prediction & Confidence Settings */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl space-y-6">
          {/* Confidence Threshold */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-white font-bold text-sm">
                <Percent className="w-4 h-4 text-emerald-400" />
                <span>Minimum Confidence Threshold</span>
              </div>
              <span className="text-base font-black font-mono text-emerald-400">
                {confidenceThreshold}%
              </span>
            </div>
            <p className="text-xs text-neutral-400 mb-3">
              Signals will only be broadcast to WhatsApp if the algorithm's confidence score meets or exceeds this threshold.
            </p>
            <input
              id="settings-confidence-slider"
              type="range"
              min={50}
              max={95}
              step={1}
              value={confidenceThreshold}
              onChange={(e) => setConfidenceThreshold(parseInt(e.target.value, 10))}
              className="w-full accent-emerald-500 cursor-pointer"
            />
            <div className="flex justify-between text-[11px] text-neutral-500 mt-1 font-mono">
              <span>50% (Permissive)</span>
              <span>65% (Recommended)</span>
              <span>95% (Strict)</span>
            </div>
          </div>

          {/* Polling Interval */}
          <div className="pt-4 border-t border-neutral-800/80">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-white font-bold text-sm">
                <Clock className="w-4 h-4 text-emerald-400" />
                <span>Bot Execution Interval</span>
              </div>
              <span className="text-base font-black font-mono text-white">
                {pollingInterval}s
              </span>
            </div>
            <p className="text-xs text-neutral-400 mb-3">
              WinGo 1M rounds occur every 60 seconds. The bot evaluates history and settles predictions on every cycle.
            </p>
            <select
              id="settings-polling-select"
              value={pollingInterval}
              onChange={(e) => setPollingInterval(parseInt(e.target.value, 10))}
              className="w-full px-4 py-2.5 bg-neutral-950 border border-neutral-800 rounded-xl text-white text-sm focus:outline-hidden focus:border-emerald-500 transition-colors"
            >
              <option value={30}>30 seconds (High frequency)</option>
              <option value={60}>60 seconds (Standard WinGo 1M)</option>
              <option value={120}>120 seconds (Slow polling)</option>
            </select>
          </div>
        </div>

        {/* Timezone & Random Signal Timing Configuration */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl space-y-6">
          <div className="flex items-center gap-2 text-white font-bold text-sm">
            <Clock className="w-4 h-4 text-emerald-400" />
            <span>Timezone & Signal Timing Window</span>
          </div>
          <p className="text-xs text-neutral-400">
            Control the timezone used for scheduled session triggers (e.g. Asia/Karachi for Pakistan Time) and the randomized signal delay window.
          </p>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-1.5">
              Bot Operating Timezone (IANA)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={botTimezone}
                onChange={(e) => setBotTimezone(e.target.value)}
                placeholder="Asia/Karachi"
                className="flex-1 px-4 py-2.5 bg-neutral-950 border border-neutral-800 rounded-xl text-white font-mono text-sm focus:outline-hidden focus:border-emerald-500"
              />
              <select
                onChange={(e) => {
                  if (e.target.value) setBotTimezone(e.target.value);
                }}
                className="px-3 py-2.5 bg-neutral-950 border border-neutral-800 rounded-xl text-neutral-300 text-xs focus:outline-hidden"
              >
                <option value="">Presets...</option>
                <option value="Asia/Karachi">Asia/Karachi (PKT - Pakistan)</option>
                <option value="Asia/Kolkata">Asia/Kolkata (IST - India)</option>
                <option value="Asia/Dhaka">Asia/Dhaka (BST - Bangladesh)</option>
                <option value="Asia/Dubai">Asia/Dubai (GST - UAE)</option>
                <option value="UTC">UTC (Universal)</option>
                <option value="Europe/London">Europe/London (GMT/BST)</option>
                <option value="America/New_York">America/New_York (EST/EDT)</option>
              </select>
            </div>
            <span className="text-[11px] text-neutral-500 mt-1 block">
              Used by the automated scheduler to trigger sessions at exact local wall-clock times.
            </span>
          </div>

          <div className="p-4 bg-emerald-950/20 rounded-xl border border-emerald-500/30 text-xs text-neutral-300 flex items-start gap-3">
            <Info className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-white mb-1">Fixed 15-Second Signal Timing (WinGo 1M Synchronized)</p>
              <p className="text-neutral-400 leading-relaxed">
                Every signal in both Normal Bot and Session modes is dispatched at exactly 15 seconds into each WinGo 1M issue. Signal timing is anchored strictly to server time, with zero random delay. WIN/LOSS results are settled and broadcast immediately upon draw.
              </p>
            </div>
          </div>
        </div>

        {/* Save General Settings Button */}
        <div className="flex justify-end">
          <button
            id="settings-save-btn"
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-semibold transition-all shadow-lg shadow-emerald-950/40 active:scale-95 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>Save System Settings</span>
          </button>
        </div>
      </form>

      {/* Pre-Session Reminder Configuration Section */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl space-y-6">
        <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                <span>Pre-Session Reminder</span>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                  reminderEnabled
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    : 'bg-neutral-800 border-neutral-700 text-neutral-400'
                }`}>
                  {reminderEnabled ? 'ACTIVE (30m BEFORE)' : 'OFF'}
                </span>
              </h3>
              <p className="text-xs text-neutral-400 mt-0.5">
                Automatically delivers a reminder to your WhatsApp channel exactly 30 minutes before each scheduled session starts.
              </p>
            </div>
          </div>

          {/* ON / OFF Toggle */}
          <button
            type="button"
            onClick={() => setReminderEnabled(!reminderEnabled)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 border ${
              reminderEnabled
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500 shadow-lg shadow-emerald-950/40'
                : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border-neutral-700'
            }`}
          >
            {reminderEnabled ? <Check className="w-3.5 h-3.5" /> : null}
            <span>Session Reminder: {reminderEnabled ? 'ON' : 'OFF'}</span>
          </button>
        </div>

        {/* Destination & Timing Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Reminder Timing */}
          <div className="p-4 bg-neutral-950 rounded-xl border border-neutral-800/80">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Reminder Before Session</span>
              <span className="text-xs font-mono font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                {reminderMinutesBefore} Minutes
              </span>
            </div>
            <p className="text-xs text-neutral-300 font-mono">
              Calculation: Session Start Time − 30 minutes
            </p>
            <div className="mt-2 text-[11px] text-neutral-500 flex items-center gap-3">
              <span>06:00 AM → 05:30 AM</span>
              <span>•</span>
              <span>02:00 PM → 01:30 PM</span>
              <span>•</span>
              <span>08:00 PM → 07:30 PM</span>
            </div>
          </div>

          {/* Active WhatsApp Destination */}
          <div className="p-4 bg-neutral-950 rounded-xl border border-neutral-800/80">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">WhatsApp Destination</span>
              <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                Same As Bot Channel
              </span>
            </div>
            <p className="text-xs text-neutral-200 font-mono truncate" title={newsletterJid || 'No channel configured'}>
              {newsletterJid || '⚠️ Please configure Newsletter JID above'}
            </p>
            <p className="text-[11px] text-neutral-500 mt-1">
              Sent to the exact same WhatsApp Newsletter Channel configured above.
            </p>
          </div>
        </div>

        {/* Website URL Setting */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-1.5">
            Website URL (Displayed inside the reminder message)
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-500">
              <Link className="w-4 h-4 text-emerald-400" />
            </div>
            <input
              id="reminder-website-url-input"
              type="url"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://example.com"
              className="w-full pl-10 pr-4 py-2.5 bg-neutral-950 border border-neutral-800 rounded-xl text-white font-mono text-sm focus:outline-hidden focus:border-emerald-500"
            />
          </div>
          <span className="text-[11px] text-neutral-400 mt-1.5 block">
            Important: The reminder contains this <strong>Website URL only</strong> (no WhatsApp channel invite link). Inserted into the template via <code className="text-emerald-400 font-mono">{`{website_link}`}</code>.
          </span>
        </div>

        {/* Custom Reminder Template */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400">
              Reminder Template (Customizable)
            </label>
            <span className="text-[11px] text-neutral-500">Click a variable to append:</span>
          </div>

          {/* Variable quick-insert chips */}
          <div className="flex flex-wrap gap-1.5 mb-2.5">
            {[
              { tag: '{session_name}', label: 'Session Name' },
              { tag: '{session_time}', label: 'Session Time' },
              { tag: '{minutes_remaining}', label: 'Minutes Remaining' },
              { tag: '{target}', label: 'Target WINs' },
              { tag: '{website_link}', label: 'Website URL' },
              { tag: '{date}', label: 'Date' },
              { tag: '{timezone}', label: 'Timezone' },
            ].map((v) => (
              <button
                key={v.tag}
                type="button"
                onClick={() => insertVariableIntoTemplate(v.tag)}
                className="px-2.5 py-1 bg-neutral-950 hover:bg-neutral-800 text-emerald-400 border border-neutral-800 rounded-lg text-xs font-mono font-semibold transition-colors"
                title={`Insert ${v.tag}`}
              >
                + {v.tag}
              </button>
            ))}
          </div>

          <textarea
            id="reminder-template-input"
            rows={12}
            value={reminderTemplate}
            onChange={(e) => setReminderTemplate(e.target.value)}
            className="w-full px-4 py-3 bg-neutral-950 border border-neutral-800 rounded-xl text-white font-mono text-xs focus:outline-hidden focus:border-emerald-500 leading-relaxed"
            placeholder="Enter custom reminder message..."
          />
        </div>

        {/* Real-Time Live Message Preview */}
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-2 flex items-center justify-between">
            <span>Live Message Preview (What WhatsApp Channel Receives)</span>
            <span className="text-[10px] text-emerald-400 font-mono">Real-time variables replaced</span>
          </div>
          <div className="p-4 bg-neutral-950 rounded-xl border border-neutral-800 text-xs font-mono text-neutral-200 whitespace-pre-wrap leading-relaxed shadow-inner">
            {getRenderedPreview()}
          </div>
        </div>

        {/* Test Result Feedback (if test reminder was sent) */}
        {testReminderResult && (
          <div className="p-4 bg-emerald-950/40 border border-emerald-500/40 rounded-xl text-xs space-y-1">
            <div className="flex items-center gap-2 text-emerald-400 font-bold">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Test reminder sent to {newsletterJid || 'configured WhatsApp channel'}!</span>
            </div>
            <p className="text-neutral-400 text-[11px]">
              Note: This test did NOT start a session, create a prediction, or alter WIN/LOSS statistics.
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-neutral-800">
          <div className="flex flex-wrap items-center gap-2">
            {/* Reset Default Template */}
            <button
              type="button"
              onClick={handleResetReminderTemplate}
              disabled={resettingReminder}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
            >
              {resettingReminder ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
              <span>Reset Default Template</span>
            </button>

            {/* Send Test Reminder */}
            <button
              id="send-test-reminder-btn"
              type="button"
              onClick={handleSendTestReminder}
              disabled={sendingTestReminder || !newsletterJid}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-semibold transition-all shadow-md shadow-amber-950/40 active:scale-95 disabled:opacity-50"
            >
              {sendingTestReminder ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              <span>📨 Send Test Reminder</span>
            </button>
          </div>

          {/* Save Reminder Settings */}
          <button
            id="save-reminder-settings-btn"
            type="button"
            onClick={handleSaveReminderSettings}
            disabled={savingReminder}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold transition-all shadow-lg shadow-emerald-950/40 active:scale-95 disabled:opacity-50"
          >
            {savingReminder ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>Save Reminder Settings</span>
          </button>
        </div>

        {/* Reminder History Table */}
        <div className="pt-6 border-t border-neutral-800 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-white font-bold text-sm">
              <History className="w-4 h-4 text-emerald-400" />
              <span>Reminder Delivery History</span>
            </div>
            <button
              type="button"
              onClick={handleRefreshHistory}
              disabled={historyLoading}
              className="inline-flex items-center gap-1 px-3 py-1 bg-neutral-950 hover:bg-neutral-800 text-neutral-400 hover:text-white border border-neutral-800 rounded-lg text-[11px] font-semibold transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${historyLoading ? 'animate-spin' : ''}`} />
              <span>Refresh Log</span>
            </button>
          </div>

          {reminderHistory.length === 0 ? (
            <div className="p-6 bg-neutral-950 rounded-xl border border-neutral-800 text-center text-xs text-neutral-500">
              No reminder events recorded yet. Reminders will be recorded automatically exactly 30 minutes before each scheduled session.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-neutral-800 bg-neutral-950">
              <table className="w-full text-left text-xs">
                <thead className="bg-neutral-900/80 text-neutral-400 uppercase text-[10px] tracking-wider font-semibold border-b border-neutral-800">
                  <tr>
                    <th className="py-2.5 px-4">Session</th>
                    <th className="py-2.5 px-4">Session Time</th>
                    <th className="py-2.5 px-4">Reminder Time</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4">Sent At</th>
                    <th className="py-2.5 px-4">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/60 font-mono">
                  {reminderHistory.map((item) => {
                    const statusColor =
                      item.status === 'SENT'
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                        : item.status === 'MISSED'
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                        : item.status === 'FAILED'
                        ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                        : 'bg-neutral-800 text-neutral-400 border-neutral-700';

                    return (
                      <tr key={item.id} className="hover:bg-neutral-900/40 transition-colors">
                        <td className="py-2.5 px-4 font-sans font-medium text-white">
                          {item.session_name}
                        </td>
                        <td className="py-2.5 px-4 text-neutral-300">
                          {item.session_time_formatted || item.session_time}
                        </td>
                        <td className="py-2.5 px-4 text-amber-400">
                          {item.reminder_time_formatted || item.reminder_time}
                        </td>
                        <td className="py-2.5 px-4">
                          <span className={`inline-flex px-2 py-0.5 text-[10px] font-bold rounded-md border ${statusColor}`}>
                            {item.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-neutral-400 text-[11px]">
                          {item.sent_at ? new Date(item.sent_at).toLocaleTimeString() : '—'}
                        </td>
                        <td className="py-2.5 px-4 text-neutral-400 text-[11px] truncate max-w-xs" title={item.error || item.destination || ''}>
                          {item.error ? (
                            <span className="text-rose-400">{item.error}</span>
                          ) : item.destination ? (
                            <span className="text-neutral-400">{item.destination}</span>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

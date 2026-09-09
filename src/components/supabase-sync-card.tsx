import { useState, useEffect, useMemo } from "react";
import {
  Database,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  UploadCloud,
  Copy,
  Check,
  Globe,
  Table as TableIcon,
  Key,
  ShieldCheck,
  Eye,
  EyeOff,
  RotateCcw,
  ExternalLink,
  Code2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useCars, useCarsSource, useCarsRefresh } from "@/lib/cars-store";
import { fetchCarsFromSupabase } from "@/lib/supabase-cars";
import {
  useSupabaseConfig,
  testSupabaseConnection,
  DEFAULT_SUPABASE_CONFIG,
} from "@/lib/supabase-config";
import { resetSupabaseClient } from "@/integrations/supabase/client";

export function SupabaseSyncCard() {
  const cars = useCars();
  const { source, syncAllToSupabase } = useCarsSource();
  const { refresh } = useCarsRefresh();
  const { config, update, reset } = useSupabaseConfig();

  // Local editing state for form fields
  const [urlInput, setUrlInput] = useState(config.url);
  const [keyInput, setKeyInput] = useState(config.key);
  const [tableInput, setTableInput] = useState(config.tableName);
  const [showKey, setShowKey] = useState(false);

  // Status & Testing state
  const [supabaseCount, setSupabaseCount] = useState<number | null>(null);
  const [checking, setChecking] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    durationMs?: number;
    rowCount?: number;
  } | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Syncing state
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [copiedSql, setCopiedSql] = useState(false);
  const [copiedCreateTable, setCopiedCreateTable] = useState(false);

  // Keep inputs synchronized when external config changes
  useEffect(() => {
    setUrlInput(config.url);
    setKeyInput(config.key);
    setTableInput(config.tableName);
  }, [config.url, config.key, config.tableName]);

  const checkCount = async () => {
    setChecking(true);
    setStatusMessage(null);
    try {
      const data = await fetchCarsFromSupabase();
      if (data !== null) {
        setSupabaseCount(data.length);
      } else {
        setSupabaseCount(null);
      }
    } catch {
      setSupabaseCount(null);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    checkCount();
  }, [config.tableName]);

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testSupabaseConnection(urlInput, keyInput, tableInput);
      setTestResult(result);
    } catch (err) {
      setTestResult({
        success: false,
        message: (err as Error).message || "Connection test failed",
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSaveConfig = () => {
    update({
      url: urlInput.trim(),
      key: keyInput.trim(),
      tableName: tableInput.trim() || "tesoro_raw",
    });
    resetSupabaseClient();
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
    checkCount();
    refresh();
  };

  const handleResetDefaults = () => {
    reset();
    resetSupabaseClient();
    setUrlInput(DEFAULT_SUPABASE_CONFIG.url);
    setKeyInput(DEFAULT_SUPABASE_CONFIG.key);
    setTableInput(DEFAULT_SUPABASE_CONFIG.tableName);
    setTestResult(null);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
    checkCount();
    refresh();
  };

  const handleSync = async () => {
    if (syncing) return;
    setSyncing(true);
    setStatusMessage(null);
    setProgress({ current: 0, total: cars.length });

    const result = await syncAllToSupabase((inserted, total) => {
      setProgress({ current: inserted, total });
    });

    if (result.success) {
      setStatusMessage({
        type: "success",
        text: `Successfully synced ${result.count} cars into '${config.tableName}' on Supabase!`,
      });
      await checkCount();
      await refresh();
    } else {
      setStatusMessage({
        type: "error",
        text:
          result.error ||
          "Sync failed. If Row-Level Security (RLS) is enabled, see the RLS Policies tab.",
      });
    }
    setSyncing(false);
  };

  const isModified = useMemo(() => {
    return (
      urlInput.trim() !== config.url ||
      keyInput.trim() !== config.key ||
      tableInput.trim() !== config.tableName
    );
  }, [urlInput, keyInput, tableInput, config]);

  const isCustomFromDefaults = useMemo(() => {
    return (
      config.url !== DEFAULT_SUPABASE_CONFIG.url ||
      config.key !== DEFAULT_SUPABASE_CONFIG.key ||
      config.tableName !== DEFAULT_SUPABASE_CONFIG.tableName
    );
  }, [config]);

  const sqlSnippet = useMemo(() => {
    const table = config.tableName.trim() || "tesoro_raw";
    return `-- Run this in your Supabase SQL Editor to allow reading & writing to public.${table}:
ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read" ON public.${table} FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.${table} FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.${table} FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow public delete" ON public.${table} FOR DELETE USING (true);`;
  }, [config.tableName]);

  const createTableSql = useMemo(() => {
    const table = config.tableName.trim() || "tesoro_raw";
    return `-- Run this in your Supabase SQL Editor to create the complete ${table} table:
CREATE TABLE IF NOT EXISTS public.${table} (
  "Car ID" TEXT PRIMARY KEY,
  "Name" TEXT,
  "Make" TEXT,
  "Model" TEXT,
  "Variant" TEXT,
  "Year" TEXT,
  "Type" TEXT,
  "Series" TEXT,
  "Sub Series" TEXT,
  "Car Number" TEXT,
  "Colour" TEXT,
  "Brand" TEXT,
  "Assortment" TEXT,
  "Size" TEXT,
  "Spent" NUMERIC,
  "MRP" NUMERIC,
  "Shipping Cost" NUMERIC,
  "Seller" TEXT,
  "Status" TEXT,
  "Payment" TEXT,
  "Paid" NUMERIC,
  "Month" TEXT,
  "Date" TEXT,
  "O_Date" TEXT,
  "O_Month" TEXT,
  "Transit Info / ETA" TEXT,
  "Shipping ID" TEXT,
  "Balance" NUMERIC,
  "Chase" BOOLEAN DEFAULT false,
  "Favourite" BOOLEAN DEFAULT false,
  "Official" BOOLEAN DEFAULT false,
  "Open" BOOLEAN DEFAULT false,
  "Image URL" TEXT
);

-- If your table already exists, run this to add Image URL and Shipping Cost:
ALTER TABLE public.${table} ADD COLUMN IF NOT EXISTS "Image URL" TEXT;
ALTER TABLE public.${table} ADD COLUMN IF NOT EXISTS "Shipping Cost" NUMERIC;`;
  }, [config.tableName]);

  const copySql = () => {
    navigator.clipboard.writeText(sqlSnippet);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };

  const copyCreateTable = () => {
    navigator.clipboard.writeText(createTableSql);
    setCopiedCreateTable(true);
    setTimeout(() => setCopiedCreateTable(false), 2000);
  };

  return (
    <section
      id="supabase-config-section"
      className="card-elevated p-5 space-y-4"
      aria-label="Supabase database configuration"
    >
      {/* Card Header with Connection Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-3.5">
        <div className="flex items-center gap-2.5">
          <div className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
            <Database className="size-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-foreground flex items-center gap-2">
              Supabase Database
              {isCustomFromDefaults && (
                <span className="text-[10px] font-normal uppercase tracking-wider rounded bg-primary/10 px-1.5 py-0.5 text-primary border border-primary/20">
                  Custom
                </span>
              )}
            </h2>
            <div className="text-xs text-muted-foreground">
              Connected Table:{" "}
              <span className="font-mono font-medium text-foreground">{config.tableName}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {supabaseCount !== null ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-3.5" />
              Connected ({supabaseCount} rows)
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
              <AlertCircle className="size-3.5" />
              {checking ? "Checking..." : "Awaiting Verification"}
            </span>
          )}
        </div>
      </div>

      {/* Tabs in Section for Supabase Configuration */}
      <Tabs defaultValue="config" className="w-full space-y-4">
        <TabsList className="grid w-full grid-cols-4 h-9">
          <TabsTrigger value="config" id="tab-supabase-config" className="gap-1.5 text-xs">
            <Database className="size-3.5" />
            <span className="hidden sm:inline">Configuration</span>
            <span className="sm:hidden">Config</span>
          </TabsTrigger>
          <TabsTrigger value="sync" id="tab-supabase-sync" className="gap-1.5 text-xs">
            <RefreshCw className="size-3.5" />
            <span className="hidden sm:inline">Sync & Status</span>
            <span className="sm:hidden">Sync</span>
          </TabsTrigger>
          <TabsTrigger value="rls" id="tab-supabase-rls" className="gap-1.5 text-xs">
            <ShieldCheck className="size-3.5" />
            <span className="hidden sm:inline">RLS Policies</span>
            <span className="sm:hidden">RLS</span>
          </TabsTrigger>
          <TabsTrigger value="schema" id="tab-supabase-schema" className="gap-1.5 text-xs">
            <Code2 className="size-3.5" />
            <span className="hidden sm:inline">Table Schema</span>
            <span className="sm:hidden">Schema</span>
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: CONFIGURATION (Add Supabase URLs & Table Names) */}
        <TabsContent value="config" className="space-y-4 pt-1">
          <div className="space-y-3 rounded-lg border border-border/70 bg-muted/20 p-4">
            {/* Supabase URL Input */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label
                  htmlFor="supabase-url-input"
                  className="text-xs font-semibold flex items-center gap-1.5 text-foreground"
                >
                  <Globe className="size-3.5 text-primary" />
                  Supabase Project URL
                </Label>
                {urlInput && urlInput.includes(".supabase.co") && (
                  <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <Check className="size-3" /> Valid Domain
                  </span>
                )}
              </div>
              <Input
                id="supabase-url-input"
                type="url"
                placeholder="https://your-project.supabase.co"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                className="font-mono text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                Found in your Supabase project dashboard under Settings &gt; API (Project URL).
              </p>
            </div>

            {/* Supabase Table Name Input */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label
                  htmlFor="supabase-table-input"
                  className="text-xs font-semibold flex items-center gap-1.5 text-foreground"
                >
                  <TableIcon className="size-3.5 text-primary" />
                  Database Table Name
                </Label>
                <span className="text-[11px] font-mono text-muted-foreground">
                  public.{tableInput.trim() || "tesoro_raw"}
                </span>
              </div>
              <Input
                id="supabase-table-input"
                type="text"
                placeholder="tesoro_raw"
                value={tableInput}
                onChange={(e) => setTableInput(e.target.value)}
                className="font-mono text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                The Postgres table where your collection data lives (default:{" "}
                <code className="bg-muted px-1 py-0.5 rounded font-mono">tesoro_raw</code>).
              </p>
            </div>

            {/* Supabase API Key Input */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label
                  htmlFor="supabase-key-input"
                  className="text-xs font-semibold flex items-center gap-1.5 text-foreground"
                >
                  <Key className="size-3.5 text-primary" />
                  Supabase Anon / Publishable API Key
                </Label>
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 cursor-pointer"
                >
                  {showKey ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                  <span>{showKey ? "Mask" : "Reveal"}</span>
                </button>
              </div>
              <div className="relative">
                <Input
                  id="supabase-key-input"
                  type={showKey ? "text" : "password"}
                  placeholder="sb_publishable_... or anon JWT (eyJhbGci...)"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  className="font-mono text-xs pr-10"
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Both standard anon JWTs and new{" "}
                <code className="bg-muted px-1 py-0.5 rounded font-mono">sb_publishable_</code> keys
                are supported.
              </p>
            </div>
          </div>

          {/* Test & Save Action Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-2">
              <Button
                id="save-supabase-config-btn"
                size="sm"
                onClick={handleSaveConfig}
                disabled={!urlInput.trim() || !keyInput.trim() || !tableInput.trim()}
                className="gap-1.5 shadow-sm"
              >
                <Check className="size-4" />
                <span>Save Configuration</span>
              </Button>

              <Button
                id="test-supabase-conn-btn"
                variant="outline"
                size="sm"
                onClick={handleTestConnection}
                disabled={testing || !urlInput.trim() || !keyInput.trim()}
                className="gap-1.5"
              >
                <RefreshCw className={`size-3.5 ${testing ? "animate-spin" : ""}`} />
                <span>{testing ? "Testing..." : "Test Connection"}</span>
              </Button>
            </div>

            <Button
              id="reset-supabase-config-btn"
              variant="ghost"
              size="sm"
              onClick={handleResetDefaults}
              className="text-xs text-muted-foreground hover:text-foreground gap-1"
            >
              <RotateCcw className="size-3" />
              <span>Reset to Defaults</span>
            </Button>
          </div>

          {/* Success Banner */}
          {saveSuccess && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="size-4 shrink-0" />
              <span>
                Configuration updated and saved to local storage! Supabase client reinitialized.
              </span>
            </div>
          )}

          {/* Test Connection Result Alert */}
          {testResult && (
            <div
              className={`flex items-start gap-2.5 rounded-lg border p-3 text-xs ${
                testResult.success
                  ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  : "border-destructive/20 bg-destructive/10 text-destructive dark:text-rose-400"
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="size-4 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="size-4 shrink-0 mt-0.5" />
              )}
              <div className="space-y-0.5">
                <div className="font-semibold">
                  {testResult.success ? "Connection Verified!" : "Connection Test Failed"}
                </div>
                <div>{testResult.message}</div>
              </div>
            </div>
          )}
        </TabsContent>

        {/* TAB 2: SYNC & STATUS */}
        <TabsContent value="sync" className="space-y-4 pt-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-1">
              <div className="text-muted-foreground">Configured Table</div>
              <div className="font-mono font-semibold text-foreground">
                public.{config.tableName}
              </div>
              <div className="text-[11px] text-muted-foreground">
                Current live rows:{" "}
                {checking ? (
                  <span className="animate-pulse">checking...</span>
                ) : supabaseCount !== null ? (
                  <span className="font-semibold text-foreground">{supabaseCount} cars</span>
                ) : (
                  <span className="text-amber-500">unreachable / empty</span>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-1">
              <div className="text-muted-foreground">Active App Data Source</div>
              <div className="font-semibold text-foreground capitalize">
                {source === "supabase"
                  ? `Supabase (${config.tableName})`
                  : "Google Sheet (Live Fallback)"}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {source === "supabase"
                  ? "All metrics, edits, and adds sync directly through Supabase."
                  : "Using local/sheet dataset until collection is synced."}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              id="sync-cars-supabase-btn"
              size="sm"
              onClick={handleSync}
              disabled={syncing || cars.length === 0}
              className="gap-1.5 shadow-sm"
            >
              {syncing ? (
                <RefreshCw className="size-4 animate-spin" />
              ) : (
                <UploadCloud className="size-4" />
              )}
              <span>
                {syncing ? "Syncing to Supabase..." : `Sync ${cars.length} Cars to Supabase`}
              </span>
            </Button>

            <Button
              id="check-supabase-status-btn"
              variant="outline"
              size="sm"
              onClick={checkCount}
              disabled={checking || syncing}
              className="gap-1.5"
            >
              <RefreshCw className={`size-3.5 ${checking ? "animate-spin" : ""}`} />
              <span>Check Table Status</span>
            </Button>
          </div>

          {progress && (
            <div className="space-y-1 text-xs">
              <div className="flex justify-between text-muted-foreground">
                <span>Syncing progress</span>
                <span>
                  {progress.current} / {progress.total}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {statusMessage && (
            <div
              className={`flex items-start gap-2 rounded-lg p-3 text-xs ${
                statusMessage.type === "success"
                  ? "border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  : "border border-destructive/20 bg-destructive/10 text-destructive dark:text-rose-400"
              }`}
            >
              {statusMessage.type === "success" ? (
                <CheckCircle2 className="size-4 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="size-4 shrink-0 mt-0.5" />
              )}
              <div className="space-y-1">
                <p className="font-medium">{statusMessage.text}</p>
              </div>
            </div>
          )}
        </TabsContent>

        {/* TAB 3: RLS POLICIES */}
        <TabsContent value="rls" className="space-y-3 pt-1">
          <div className="rounded-lg border border-border/80 bg-background/50 p-3 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-semibold text-foreground">
                <ShieldCheck className="size-4 text-primary" />
                <span>Row Level Security (RLS) for public.{config.tableName}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={copySql}
                className="h-7 px-2 text-xs gap-1"
              >
                {copiedSql ? (
                  <>
                    <Check className="size-3 text-emerald-500" />
                    <span className="text-emerald-500">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="size-3" />
                    <span>Copy SQL</span>
                  </>
                )}
              </Button>
            </div>
            <p className="text-muted-foreground text-[11px]">
              If write or read requests return a 401/403 or policy violation, run this SQL script in
              your Supabase SQL Editor:
            </p>
            <pre className="overflow-x-auto rounded bg-muted/60 p-2.5 font-mono text-[11px] text-foreground leading-relaxed">
              {sqlSnippet}
            </pre>
          </div>
        </TabsContent>

        {/* TAB 4: TABLE SCHEMA REFERENCE */}
        <TabsContent value="schema" className="space-y-3 pt-1">
          <div className="rounded-lg border border-border/80 bg-background/50 p-3 space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-semibold text-foreground">
                <Code2 className="size-4 text-primary" />
                <span>Create Table SQL for public.{config.tableName}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={copyCreateTable}
                className="h-7 px-2 text-xs gap-1"
              >
                {copiedCreateTable ? (
                  <>
                    <Check className="size-3 text-emerald-500" />
                    <span className="text-emerald-500">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="size-3" />
                    <span>Copy CREATE TABLE</span>
                  </>
                )}
              </Button>
            </div>
            <p className="text-muted-foreground text-[11px]">
              Setting up a fresh Supabase database? Execute this SQL to create the exact schema
              expected by Tesoro:
            </p>
            <pre className="overflow-x-auto rounded bg-muted/60 p-2.5 font-mono text-[11px] text-foreground max-h-48 leading-relaxed">
              {createTableSql}
            </pre>
          </div>
        </TabsContent>
      </Tabs>
    </section>
  );
}

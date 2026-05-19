'use client';

import { useQuery } from '@tanstack/react-query';
import { Activity, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { Fragment, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import type {
  OutboxAdminEventDTO,
  OutboxRelayHealthDTO,
} from '@/services/player-financial/dtos';

// ── Types ──────────────────────────────────────────────────────────────────────

interface ObservabilityResponse {
  health: OutboxRelayHealthDTO | null;
  events: OutboxAdminEventDTO[];
}

interface Filters {
  eventType: string;
  status: string;
  searchId: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EVENT_TYPE_OPTIONS = [
  { value: 'all', label: 'All Events' },
  { value: 'buyin.recorded', label: 'buyin.recorded' },
  { value: 'cashout.recorded', label: 'cashout.recorded' },
  { value: 'adjustment.recorded', label: 'adjustment.recorded' },
  { value: 'grind.observed', label: 'grind.observed' },
  { value: 'fill.recorded', label: 'fill.recorded' },
  { value: 'credit.recorded', label: 'credit.recorded' },
];

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Status' },
  { value: 'pending', label: 'Pending' },
  { value: 'processed', label: 'Processed' },
  { value: 'failing', label: 'Failing' },
  { value: 'poison', label: 'Poison Candidate' },
];

// ── Formatters ─────────────────────────────────────────────────────────────────

function formatAge(seconds: number | null | undefined): string {
  if (seconds == null) return '—';
  const s = Math.floor(seconds);
  if (s < 60) return `${s}s`;
  if (s < 3600) {
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
  }
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatRelative(iso: string | null | undefined): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function truncateId(id: string | null | undefined): string {
  if (!id) return '—';
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

// ── Data Fetch ─────────────────────────────────────────────────────────────────

async function fetchObservability(
  filters: Filters,
): Promise<ObservabilityResponse> {
  const params = new URLSearchParams();
  if (filters.eventType !== 'all') params.set('event_type', filters.eventType);
  if (filters.status !== 'all') params.set('status', filters.status);
  if (filters.searchId) params.set('search_id', filters.searchId);
  const qs = params.toString();
  const res = await fetch(
    `/api/internal/outbox-observability${qs ? `?${qs}` : ''}`,
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<ObservabilityResponse>;
}

// ── Relay Health Card ──────────────────────────────────────────────────────────

function RelayHealthCard({ health }: { health: OutboxRelayHealthDTO | null }) {
  const poisonCount = health?.poison_candidate_count ?? 0;

  const stats: Array<{
    label: string;
    value: string | number;
    highlight?: boolean;
  }> = [
    { label: 'Pending', value: health?.pending_count ?? '—' },
    {
      label: 'Oldest Pending Age',
      value: formatAge(health?.oldest_pending_age_seconds),
    },
    {
      label: 'Retry Pressure (≥1 attempt)',
      value: health?.retry_row_count ?? '—',
    },
    {
      label: 'Poison Candidates (≥3 attempts)',
      value: health?.poison_candidate_count ?? '—',
      highlight: poisonCount > 0,
    },
    { label: 'Processed (24h)', value: health?.processed_count_24h ?? '—' },
  ];

  return (
    <Card className="border-2 border-border/50">
      <CardHeader className="pb-3">
        <CardTitle
          className="text-sm font-bold uppercase tracking-widest"
          style={{ fontFamily: 'monospace' }}
        >
          Relay Health
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
          {stats.map((stat) => (
            <div key={stat.label} className="space-y-1">
              <div
                className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
                style={{ fontFamily: 'monospace' }}
              >
                {stat.label}
              </div>
              <div
                className={`text-2xl font-bold tabular-nums ${
                  stat.highlight ? 'text-amber-500' : 'text-foreground'
                }`}
                style={{
                  fontFamily: 'monospace',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {String(stat.value)}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Row Detail ─────────────────────────────────────────────────────────────────

function RowDetail({ event }: { event: OutboxAdminEventDTO }) {
  const payloadStr = JSON.stringify(event.payload, null, 2);
  const truncated = payloadStr.length > 2000;
  const displayPayload = truncated ? payloadStr.slice(0, 2000) : payloadStr;

  const fields: Array<{ label: string; value: string | number | null }> = [
    { label: 'Event ID', value: event.event_id },
    { label: 'Event Type', value: event.event_type },
    { label: 'Fact Class', value: event.fact_class },
    { label: 'Origin Label', value: event.origin_label },
    { label: 'Casino ID', value: event.casino_id },
    { label: 'Table ID', value: event.table_id },
    { label: 'Player ID', value: event.player_id },
    { label: 'Aggregate ID', value: event.aggregate_id },
    { label: 'Created At', value: event.created_at },
    { label: 'Processed At', value: event.processed_at },
    { label: 'Delivery Attempts', value: event.delivery_attempts },
    { label: 'Last Attempted At', value: event.last_attempted_at },
    { label: 'Last Error', value: event.last_error },
  ];

  return (
    <div className="bg-muted/20 space-y-4 p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
        {fields.map((f) => (
          <div key={f.label} className="space-y-0.5">
            <div
              className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
              style={{ fontFamily: 'monospace' }}
            >
              {f.label}
            </div>
            <div className="break-all font-mono text-xs text-foreground">
              {f.value ?? '—'}
            </div>
          </div>
        ))}
      </div>
      <div className="space-y-1">
        <div
          className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
          style={{ fontFamily: 'monospace' }}
        >
          Payload
        </div>
        <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded border border-border/50 bg-card p-3 font-mono text-xs">
          {displayPayload}
          {truncated && (
            <span className="text-muted-foreground">
              {'\n'}(payload truncated at 2000 chars)
            </span>
          )}
        </pre>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function OutboxObservabilityClient() {
  const [eventType, setEventType] = useState('all');
  const [status, setStatus] = useState('all');
  const [searchInput, setSearchInput] = useState('');
  const [searchId, setSearchId] = useState('');
  const [searchError, setSearchError] = useState('');
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  const filters: Filters = { eventType, status, searchId };

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['outbox-observability', filters],
    queryFn: () => fetchObservability(filters),
    staleTime: 30_000,
  });

  function applySearch() {
    if (!searchInput) {
      setSearchId('');
      setSearchError('');
      return;
    }
    if (!UUID_RE.test(searchInput)) {
      setSearchError('Must be a valid UUID');
      return;
    }
    setSearchError('');
    setSearchId(searchInput);
  }

  function handleSearchClear() {
    setSearchInput('');
    setSearchId('');
    setSearchError('');
  }

  function toggleRow(id: string) {
    setExpandedRowId((prev) => (prev === id ? null : id));
  }

  return (
    <div className="flex flex-1 flex-col space-y-4">
      {/* Header */}
      <div className="flex-none">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Activity className="h-6 w-6 text-accent" />
            <h3
              className="text-xl font-bold uppercase tracking-widest"
              style={{ fontFamily: 'monospace' }}
            >
              Outbox Observability
            </h3>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-xs font-semibold uppercase tracking-wider"
            onClick={() => {
              void refetch();
            }}
          >
            <RefreshCw className="h-3 w-3" />
            Refresh
          </Button>
        </div>
        <p className="mt-1 pl-[34px] text-base text-muted-foreground">
          Finance outbox relay health and event queue — read-only operational
          view.
        </p>
      </div>
      <Separator className="flex-none" />

      {/* Relay Health Card */}
      {isLoading ? (
        <Card className="border-2 border-border/50">
          <CardContent className="pt-6">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="h-14 animate-pulse rounded bg-muted/50"
                />
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <RelayHealthCard health={data?.health ?? null} />
      )}

      {/* Filter Bar */}
      <Card className="border-2 border-border/50">
        <CardContent className="pb-4 pt-4">
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              applySearch();
            }}
          >
            <div className="space-y-1">
              <Label
                className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
                style={{ fontFamily: 'monospace' }}
              >
                Event Type
              </Label>
              <Select value={eventType} onValueChange={setEventType}>
                <SelectTrigger className="h-8 w-48 font-mono text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_TYPE_OPTIONS.map((opt) => (
                    <SelectItem
                      key={opt.value}
                      value={opt.value}
                      className="font-mono text-xs"
                    >
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label
                className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
                style={{ fontFamily: 'monospace' }}
              >
                Status
              </Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="h-8 w-44 font-mono text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((opt) => (
                    <SelectItem
                      key={opt.value}
                      value={opt.value}
                      className="font-mono text-xs"
                    >
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label
                className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
                style={{ fontFamily: 'monospace' }}
              >
                Search ID
              </Label>
              <div className="flex items-start gap-1.5">
                <div className="space-y-0.5">
                  <Input
                    className="h-8 w-72 font-mono text-xs tabular-nums"
                    placeholder="event_id / aggregate_id / table_id"
                    value={searchInput}
                    onChange={(e) => {
                      setSearchInput(e.target.value);
                      if (searchError) setSearchError('');
                    }}
                  />
                  {searchError && (
                    <p className="text-xs text-destructive">{searchError}</p>
                  )}
                </div>
                <Button
                  type="submit"
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0 text-xs font-semibold uppercase tracking-wider"
                >
                  Search
                </Button>
                {(searchInput || searchId) && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 shrink-0 text-xs"
                    onClick={handleSearchClear}
                  >
                    Clear
                  </Button>
                )}
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Event Table */}
      <Card className="flex-1 border-2 border-border/50">
        <CardHeader className="pb-3">
          <CardTitle
            className="text-sm font-bold uppercase tracking-widest"
            style={{ fontFamily: 'monospace' }}
          >
            Events
            {!isLoading && data && (
              <span className="ml-2 font-normal text-muted-foreground">
                ({data.events.length})
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isError ? (
            <div className="px-6 py-6">
              <div
                className="text-xs font-bold uppercase tracking-widest text-destructive"
                style={{ fontFamily: 'monospace' }}
              >
                {error instanceof Error
                  ? error.message
                  : 'Failed to load events'}
              </div>
            </div>
          ) : isLoading ? (
            <div className="space-y-2 p-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-10 animate-pulse rounded bg-muted/50"
                />
              ))}
            </div>
          ) : data?.events.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <div
                className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
                style={{ fontFamily: 'monospace' }}
              >
                No events match the current filters
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full font-mono text-xs">
                <thead>
                  <tr className="border-b border-border/50 bg-muted/30">
                    {[
                      'Event Type',
                      'Fact Class',
                      'Origin Label',
                      'Table ID',
                      'Player ID',
                      'Created At',
                      'Processed At',
                      'Attempts',
                      'Last Error',
                    ].map((col) => (
                      <th
                        key={col}
                        className="whitespace-nowrap px-3 py-2 text-left text-xs font-bold uppercase tracking-widest text-muted-foreground"
                        style={{ fontFamily: 'monospace' }}
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data?.events.map((event) => {
                    const isPoison =
                      event.delivery_attempts >= 3 && !event.processed_at;
                    const isExpanded = expandedRowId === event.event_id;
                    return (
                      <Fragment key={event.event_id}>
                        <tr
                          className={`cursor-pointer border-b border-border/30 transition-colors hover:bg-muted/30 ${
                            isExpanded ? 'bg-accent/5' : ''
                          }`}
                          onClick={() => {
                            toggleRow(event.event_id);
                          }}
                        >
                          <td className="whitespace-nowrap px-3 py-2">
                            <div className="flex items-center gap-1.5">
                              {isExpanded ? (
                                <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                              )}
                              {event.event_type}
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2">
                            <Badge
                              variant="outline"
                              className="border-border/50 bg-muted/30 font-mono text-[10px] text-muted-foreground"
                            >
                              {event.fact_class}
                            </Badge>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2">
                            <Badge
                              variant="outline"
                              className="border-border/50 bg-muted/30 font-mono text-[10px] text-muted-foreground"
                            >
                              {event.origin_label}
                            </Badge>
                          </td>
                          <td
                            className="whitespace-nowrap px-3 py-2"
                            title={event.table_id}
                          >
                            {truncateId(event.table_id)}
                          </td>
                          <td
                            className="whitespace-nowrap px-3 py-2"
                            title={event.player_id ?? undefined}
                          >
                            {truncateId(event.player_id)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2">
                            {formatRelative(event.created_at)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2">
                            {event.processed_at ? (
                              formatRelative(event.processed_at)
                            ) : (
                              <Badge
                                variant="outline"
                                className="border-border/50 bg-muted/30 font-mono text-[10px] text-muted-foreground"
                              >
                                pending
                              </Badge>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2">
                            <div className="flex items-center gap-1.5">
                              {event.delivery_attempts}
                              {isPoison && (
                                <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                                  poison
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="max-w-xs px-3 py-2">
                            {event.last_error ? (
                              <span
                                className="text-destructive/80"
                                title={event.last_error}
                              >
                                {event.last_error.length > 80
                                  ? `${event.last_error.slice(0, 80)}…`
                                  : event.last_error}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td
                              colSpan={9}
                              className="border-b border-border/30 p-0"
                            >
                              <RowDetail event={event} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

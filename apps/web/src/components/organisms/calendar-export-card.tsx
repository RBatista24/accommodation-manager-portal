import * as React from 'react';
import { CheckIcon, CircleAlertIcon, CopyIcon, PowerOffIcon, RefreshCwIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/atoms/alert';
import { Badge } from '@/components/atoms/badge';
import { Button } from '@/components/atoms/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/atoms/card';
import { Spinner } from '@/components/atoms/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/atoms/table';
import { ConfirmDialog } from '@/components/molecules/confirm-dialog';
import { useToggleCalendarExport } from '@/hooks/queries';
import { errorMessage } from '@/lib/api';
import { formatTimestamp } from '@/lib/dates';
import type { CalendarExport } from '@/lib/types';

/** The private part of a link is never shown in full; Copy copies the whole link. */
function maskUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}/…${url.slice(-10)}`;
  } catch {
    return '(hidden)';
  }
}

const isLocal = (url: string | null) => !!url && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(url);

/**
 * Outgoing calendar links, one per unit: Booking.com imports them so that
 * direct reservations and blocked dates close the room there too.
 */
export function CalendarExportCard({ exports }: { exports: CalendarExport[] }) {
  const toggle = useToggleCalendarExport();
  const [confirm, setConfirm] = React.useState<{ item: CalendarExport; action: 'rotate' | 'disable' } | null>(null);
  const [copied, setCopied] = React.useState<string | null>(null);
  const multipleProperties = new Set(exports.map((e) => e.propertyId)).size > 1;
  const local = exports.some((e) => isLocal(e.url));

  async function copy(item: CalendarExport) {
    if (!item.url) return;
    try {
      await navigator.clipboard.writeText(item.url);
      setCopied(item.unitId);
      setTimeout(() => setCopied((c) => (c === item.unitId ? null : c)), 2000);
    } catch {
      window.prompt('Copy this link', item.url);
    }
  }

  return (
    <Card className="gap-3 pb-2">
      <CardHeader>
        <CardTitle>Calendar export to Booking.com</CardTitle>
        <CardDescription>
          Booking.com does not know about your direct reservations and blocked dates. Give each room&apos;s link to Booking (extranet →
          Rates &amp; Availability → Sync calendars → <strong>Import calendar</strong>) and those nights close there too. The calendar says
          only &ldquo;Not available&rdquo; — no guest names.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 px-0">
        {local && (
          <div className="px-6">
            <Alert variant="warning">
              <CircleAlertIcon />
              <AlertTitle>Booking cannot reach these links yet</AlertTitle>
              <AlertDescription>
                <p>
                  They point to this computer (localhost). Booking can read them only once the calendar address is reachable from the internet
                  and <code>PUBLIC_BASE_URL</code> is set — see the vault note &ldquo;Skill - Publish Calendars to Booking&rdquo;.
                </p>
              </AlertDescription>
            </Alert>
          </div>
        )}
        {toggle.isError && <p className="text-destructive px-6 text-sm">{errorMessage(toggle.error)}</p>}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-6">Unit</TableHead>
              <TableHead>Link</TableHead>
              <TableHead className="pr-6 text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {exports.map((e) => {
              const busy = toggle.isPending && toggle.variables?.unitId === e.unitId;
              return (
                <TableRow key={e.unitId}>
                  <TableCell className="pl-6 font-medium">
                    {multipleProperties ? `${e.propertyName} · ${e.unitName}` : e.unitName}
                  </TableCell>
                  <TableCell>
                    {e.enabled && e.url ? (
                      <div className="grid gap-0.5">
                        <code className="text-xs">{maskUrl(e.url)}</code>
                        <span className="text-muted-foreground text-xs">Created {formatTimestamp(e.createdAt)}</span>
                      </div>
                    ) : (
                      <Badge variant="secondary">Off</Badge>
                    )}
                  </TableCell>
                  <TableCell className="pr-6">
                    <div className="flex flex-wrap justify-end gap-2">
                      {e.enabled ? (
                        <>
                          <Button variant="outline" size="sm" onClick={() => copy(e)}>
                            {copied === e.unitId ? <CheckIcon /> : <CopyIcon />} {copied === e.unitId ? 'Copied' : 'Copy link'}
                          </Button>
                          <Button variant="ghost" size="sm" disabled={busy} onClick={() => setConfirm({ item: e, action: 'rotate' })}>
                            <RefreshCwIcon /> New link
                          </Button>
                          <Button variant="ghost" size="sm" disabled={busy} onClick={() => setConfirm({ item: e, action: 'disable' })}>
                            <PowerOffIcon /> Turn off
                          </Button>
                        </>
                      ) : (
                        <Button variant="outline" size="sm" disabled={busy} onClick={() => toggle.mutate({ unitId: e.unitId, enable: true })}>
                          {busy && <Spinner />} Create link
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {exports.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-muted-foreground pl-6">
                  No active units.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm?.action === 'rotate' ? 'Replace this link?' : 'Turn off this link?'}
        description={
          confirm?.action === 'rotate'
            ? `The current link of ${confirm.item.unitName} stops working immediately. Paste the new one in Booking.com, replacing the old one.`
            : `Booking.com will stop receiving the direct reservations and blocked dates of ${confirm?.item.unitName}. Also remove the calendar in the Booking extranet.`
        }
        confirmLabel={confirm?.action === 'rotate' ? 'Replace link' : 'Turn off'}
        destructive
        pending={toggle.isPending}
        onConfirm={() =>
          confirm &&
          toggle.mutate(
            { unitId: confirm.item.unitId, enable: confirm.action === 'rotate' },
            { onSuccess: () => setConfirm(null) },
          )
        }
      />
    </Card>
  );
}

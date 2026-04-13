import { ListFilter } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ParsedEvent } from "@/lib/types";
import { formatTimestamp, statusCodeTone } from "@/lib/utils";

interface LogsTableProps {
  events: ParsedEvent[];
  isLoading: boolean;
  hasResult: boolean;
}

const MAX_VISIBLE_EVENTS = 200;

export function LogsTable({ events, isLoading, hasResult }: LogsTableProps) {
  const visibleEvents = events.slice(0, MAX_VISIBLE_EVENTS);
  const isTruncated = events.length > MAX_VISIBLE_EVENTS;

  return (
    <Card className="border-white/10 bg-slate-950/50">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Parsed events</CardTitle>
            <CardDescription className="mt-2 leading-6 text-slate-300">
              Structured web access rows from the latest upload. Sticky headers keep the table readable during long investigations.
            </CardDescription>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-sky-200">
            <ListFilter className="h-5 w-5" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-12 w-full" />
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/10 bg-slate-950/30 px-5 py-10 text-center text-sm leading-6 text-slate-400">
            {hasResult ? "No parsed events were returned for the latest result." : "Parsed events will appear here after the upload is analyzed."}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
              <Badge variant="outline">Showing {visibleEvents.length} rows</Badge>
              {isTruncated ? <Badge variant="secondary">Trimmed from {events.length} total events</Badge> : null}
            </div>
            <div className="rounded-3xl border border-white/10 bg-slate-950/30">
              <ScrollArea className="h-[480px]">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur">
                    <TableRow>
                      <TableHead>IP</TableHead>
                      <TableHead>Endpoint</TableHead>
                      <TableHead>Status code</TableHead>
                      <TableHead>Timestamp</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleEvents.map((event) => (
                      <TableRow key={`${event.ip}-${event.timestamp}-${event.endpoint}`}>
                        <TableCell className="font-medium text-slate-100">{event.ip}</TableCell>
                        <TableCell className="font-mono text-xs text-slate-300">{event.endpoint}</TableCell>
                        <TableCell>
                          <Badge className={statusCodeTone(event.status_code)} variant="outline">
                            {event.status_code}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-slate-300">{formatTimestamp(event.timestamp)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

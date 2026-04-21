"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, RadioTower, Send, Square, UploadCloud, Waves } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buildWebSocketUrl, isLiveReadyMessage, normalizeLiveStreamUpdate } from "@/lib/platform-api";
import type { CaseReference, UploadResponse } from "@/lib/types";

type ConnectionState = "idle" | "connecting" | "live" | "stopping" | "error";

interface LiveModePanelProps {
  caseId?: string;
  onSnapshot: (snapshot: UploadResponse) => void;
  onCaseReady?: (caseReference: CaseReference) => void;
  onAuthRequired?: () => void;
}

export function LiveModePanel({ caseId, onSnapshot, onCaseReady, onAuthRequired }: LiveModePanelProps) {
  const [connectionState, setConnectionState] = useState<ConnectionState>("idle");
  const [manualLines, setManualLines] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [attachedCase, setAttachedCase] = useState<CaseReference | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const replayCancelledRef = useRef(false);
  const pendingStartFilenameRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    return () => {
      replayCancelledRef.current = true;
      socketRef.current?.close();
    };
  }, []);

  function startSession(filename?: string) {
    if (socketRef.current && (socketRef.current.readyState === WebSocket.OPEN || socketRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    pendingStartFilenameRef.current = filename;
    replayCancelledRef.current = false;
    setConnectionState("connecting");

    const socket = new WebSocket(buildWebSocketUrl("/ws/log-stream"));
    socketRef.current = socket;

    socket.onopen = () => {
      socket.send(JSON.stringify({
        type: "start",
        case_id: caseId,
        filename: filename,
      }));
    };

    socket.onmessage = (event) => {
      const payload = JSON.parse(event.data) as unknown;
      if (isLiveReadyMessage(payload)) {
        setAttachedCase(payload.case);
        onCaseReady?.(payload.case);
        setConnectionState("live");
        toast.success("Live stream connected", {
          description: `Attached to ${payload.case.name}.`,
        });
        return;
      }

      if (payload && typeof payload === "object" && "events" in payload) {
        const update = normalizeLiveStreamUpdate(payload as never);
        onSnapshot(update);
        if (update.case) {
          setAttachedCase(update.case);
          onCaseReady?.(update.case);
        }
        return;
      }

      if (payload && typeof payload === "object" && "detail" in payload) {
        toast.error("Live stream error", {
          description: String((payload as { detail?: unknown }).detail ?? "Unexpected live stream error."),
        });
      }

      if (payload && typeof payload === "object" && (payload as { error?: unknown }).error === "AUTH_REQUIRED") {
        onAuthRequired?.();
        toast.error("Login required", {
          description: String((payload as { message?: unknown }).message ?? "Please login to continue using the platform."),
        });
      }
    };

    socket.onerror = () => {
      setConnectionState("error");
      toast.error("Live stream failed", {
        description: "The browser could not connect to the live log stream.",
      });
    };

    socket.onclose = () => {
      socketRef.current = null;
      setConnectionState("idle");
    };
  }

  function stopSession() {
    replayCancelledRef.current = true;
    if (!socketRef.current) {
      setConnectionState("idle");
      return;
    }
    setConnectionState("stopping");
    if (socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: "end" }));
    } else {
      socketRef.current.close();
    }
  }

  function sendManualLines() {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      toast.message("Start a live session first.");
      return;
    }

    const lines = manualLines
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      return;
    }

    socket.send(JSON.stringify({ type: "batch", lines }));
    setManualLines("");
  }

  async function replayFile() {
    const socket = socketRef.current;
    if (!selectedFile) {
      return;
    }
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      toast.message("Start a live session before replaying a file.");
      return;
    }

    const lines = (await selectedFile.text())
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      return;
    }

    replayCancelledRef.current = false;
    for (let index = 0; index < lines.length; index += 10) {
      if (replayCancelledRef.current || socket.readyState !== WebSocket.OPEN) {
        break;
      }
      socket.send(JSON.stringify({ type: "batch", lines: lines.slice(index, index + 10) }));
      await new Promise((resolve) => window.setTimeout(resolve, 300));
    }
  }

  const activeCase = attachedCase?.name ?? (caseId ? "Attached to current case" : "A persistent case will be created automatically");
  const selectedFileSummary = selectedFile ? `${selectedFile.name} | ${(selectedFile.size / 1024).toFixed(1)} KB` : "No replay file selected";

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  function clearSelectedFile() {
    setSelectedFile(null);
    pendingStartFilenameRef.current = undefined;
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  return (
    <Card className="overflow-hidden border-white/10 bg-slate-950/55">
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle>Live mode</CardTitle>
            <CardDescription className="mt-2 max-w-3xl leading-6 text-slate-300">
              Stream log lines over WebSocket for real-time parser, detector, correlation, and risk updates. Live mode uses heuristic analysis during the stream and saves the final snapshot when the session ends.
            </CardDescription>
          </div>
          <Badge variant={connectionState === "live" ? "success" : connectionState === "error" ? "destructive" : "secondary"}>
            {connectionState === "live" ? "Live" : connectionState === "connecting" ? "Connecting" : connectionState === "stopping" ? "Stopping" : connectionState === "error" ? "Error" : "Idle"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 px-4 pb-4 pt-0 sm:px-6 sm:pb-6">
        <div className="min-w-0 space-y-4 rounded-[24px] border border-white/10 bg-slate-950/35 p-4 sm:p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Button
              type="button"
              className="w-full whitespace-normal text-center"
              onClick={() => startSession(pendingStartFilenameRef.current)}
              disabled={connectionState === "connecting" || connectionState === "live" || connectionState === "stopping"}
            >
              {connectionState === "connecting" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RadioTower className="h-4 w-4" />}
              Start live session
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="w-full whitespace-normal text-center"
              onClick={stopSession}
              disabled={connectionState === "idle" || connectionState === "stopping"}
            >
              <Square className="h-4 w-4" />
              Stop and save snapshot
            </Button>
          </div>

          <div className="min-w-0 rounded-[22px] border border-white/10 bg-white/[0.03] px-4 py-4 text-sm text-slate-300">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Session attachment</p>
            <p className="mt-2 break-words text-slate-100">{activeCase}</p>
          </div>

          <div className="space-y-3">
            <label className="text-sm font-medium text-slate-100" htmlFor="live-manual-input">
              Manual log lines
            </label>
            <textarea
              id="live-manual-input"
              value={manualLines}
              onChange={(event) => setManualLines(event.target.value)}
              className="min-h-[140px] w-full resize-y rounded-[22px] border border-white/10 bg-slate-950/45 px-3 py-3 text-sm text-slate-100 outline-none transition focus:border-sky-300/40 sm:min-h-[180px] sm:px-4 sm:py-4"
              placeholder='203.0.113.10 - - [09/Apr/2026:10:00:00 +0000] "GET /login HTTP/1.1" 401 123 "-" "Mozilla/5.0"'
            />
            <Button
              type="button"
              variant="secondary"
              className="w-full whitespace-normal sm:w-auto"
              onClick={sendManualLines}
              disabled={connectionState !== "live"}
            >
              <Send className="h-4 w-4" />
              Send manual batch
            </Button>
          </div>

          <div className="space-y-3 rounded-[22px] border border-white/10 bg-white/[0.03] p-4 sm:p-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">File replay</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Simulate live ingestion by replaying a local log file in batches over the WebSocket stream.
              </p>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".log,.txt,text/plain"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                setSelectedFile(file);
                pendingStartFilenameRef.current = file?.name;
              }}
            />

            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
              <Button type="button" variant="secondary" className="w-full whitespace-normal text-center" onClick={openFilePicker}>
                <UploadCloud className="h-4 w-4" />
                Choose replay file
              </Button>
              {selectedFile ? (
                <Button type="button" variant="ghost" className="w-full whitespace-normal text-center sm:w-auto" onClick={clearSelectedFile}>
                  Clear selection
                </Button>
              ) : null}
            </div>

            <div className="min-w-0 rounded-[20px] border border-white/10 bg-slate-950/35 px-4 py-4 text-sm text-slate-300">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Replay file</p>
              <p className="mt-2 break-words text-slate-100">{selectedFileSummary}</p>
            </div>

            <Button
              type="button"
              variant="secondary"
              className="w-full whitespace-normal text-center"
              onClick={replayFile}
              disabled={connectionState !== "live" || !selectedFile}
            >
              <UploadCloud className="h-4 w-4" />
              Replay selected file
            </Button>
          </div>

          <div className="rounded-[22px] border border-white/10 bg-slate-950/35 p-4 text-sm leading-6 text-slate-300 sm:p-5">
            <div className="flex items-center gap-2 text-slate-100">
              <Waves className="h-4 w-4 text-sky-200" />
              Deterministic live analysis
            </div>
            <p className="mt-2 text-slate-400">
              Parser, detections, campaigns, timeline, and risk score update live. The final saved snapshot is attached to the active case when you stop the session.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

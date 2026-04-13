import { clsx, type ClassValue } from "clsx";
import type { AnalysisStage, DetectionSeverity, ParsedEvent } from "@/lib/types";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTimestamp(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function countHighSeverity(severities: DetectionSeverity[]) {
  return severities.filter((severity) => severity === "High" || severity === "Critical").length;
}

export function countUniqueIps(events: ParsedEvent[]) {
  return new Set(events.map((event) => event.ip)).size;
}

export function severityTone(severity: DetectionSeverity) {
  switch (severity) {
    case "Critical":
      return "border-rose-400/30 bg-rose-500/15 text-rose-100";
    case "High":
      return "border-red-400/30 bg-red-500/15 text-red-100";
    case "Medium":
      return "border-amber-400/30 bg-amber-500/15 text-amber-100";
    case "Moderate":
      return "border-yellow-400/30 bg-yellow-500/15 text-yellow-100";
    default:
      return "border-emerald-400/30 bg-emerald-500/15 text-emerald-100";
  }
}

export function statusCodeTone(statusCode: number) {
  if (statusCode >= 500) {
    return "border-rose-400/30 bg-rose-500/15 text-rose-100";
  }
  if (statusCode >= 400) {
    return "border-amber-400/30 bg-amber-500/15 text-amber-100";
  }
  if (statusCode >= 300) {
    return "border-sky-400/30 bg-sky-500/15 text-sky-100";
  }
  return "border-emerald-400/30 bg-emerald-500/15 text-emerald-100";
}

export function riskTone(riskLevel: "Low" | "Medium" | "High" | "Critical") {
  if (riskLevel === "Critical") {
    return "border-rose-400/30 bg-rose-500/15 text-rose-100";
  }
  if (riskLevel === "High") {
    return "border-red-400/30 bg-red-500/15 text-red-100";
  }
  if (riskLevel === "Medium") {
    return "border-amber-400/30 bg-amber-500/15 text-amber-100";
  }
  return "border-emerald-400/30 bg-emerald-500/15 text-emerald-100";
}

export function formatDetectionLabel(type: string) {
  return type.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export function formatAnalysisStage(stage: AnalysisStage) {
  switch (stage) {
    case "uploading":
      return "Uploading";
    case "parsing":
      return "Parsing logs";
    case "detecting":
      return "Detecting threats";
    case "ai":
      return "Analyzing with AI";
    default:
      return "Waiting";
  }
}

export function describeAnalysisStage(stage: AnalysisStage) {
  switch (stage) {
    case "uploading":
      return "Transferring the selected file to the backend.";
    case "parsing":
      return "Normalizing access log lines into structured events.";
    case "detecting":
      return "Running brute force, scanning, and probing rules.";
    case "ai":
      return "Generating the analyst summary from detections only.";
    default:
      return "Select a supported log file to begin analysis.";
  }
}

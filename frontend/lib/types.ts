export type DetectionSeverity = "Low" | "Moderate" | "Medium" | "High" | "Critical";
export type AIRiskLevel = "Low" | "Medium" | "High" | "Critical";
export type UploadStatus = "idle" | "running" | "success" | "error";
export type AnalysisStage = "idle" | "uploading" | "parsing" | "detecting" | "ai";

export interface ParsedEvent {
  ip: string;
  endpoint: string;
  status_code: number;
  timestamp: string;
}

export interface Detection {
  type: string;
  severity: DetectionSeverity;
  description: string;
  source_ip: string;
  count: number;
  evidence: string[];
}

export interface AIExplanation {
  explanation: string;
  risk_level: AIRiskLevel;
  recommended_action: string;
  source: "ollama" | "fallback";
  warning?: string | null;
}

export interface UploadResponse {
  events: ParsedEvent[];
  detections: Detection[];
  ai_analysis: AIExplanation;
}

export interface DashboardState {
  status: UploadStatus;
  analysisStage: AnalysisStage;
  uploadProgress: number;
  error: string | null;
  result: UploadResponse | null;
  lastUploadedFile: string | null;
}

export interface UploadLogOptions {
  onUploadProgress?: (progress: number) => void;
  onUploadComplete?: () => void;
}

export type DetectionSeverity = "Low" | "Moderate" | "Medium" | "High" | "Critical";
export type AIRiskLevel = "Low" | "Medium" | "High" | "Critical";

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

export interface AIAnalysis {
  explanation: string;
  risk_level: AIRiskLevel;
  recommended_action: string;
  source: "ollama" | "fallback";
  warning?: string | null;
}

export interface UploadResponse {
  events: ParsedEvent[];
  detections: Detection[];
  ai_analysis: AIAnalysis;
}

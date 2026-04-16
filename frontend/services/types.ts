export type DetectionSeverity = "Low" | "Moderate" | "Medium" | "High" | "Critical";
export type AIRiskLevel = "Low" | "Medium" | "High" | "Critical";
export type IncidentRiskLevel = "Low" | "Medium" | "High";
export type SessionSourceType = "upload" | "live_stream";
export type APIKeyScope = "read" | "ingest";

export interface ParsedEvent {
  ip: string;
  endpoint: string;
  status_code: number;
  timestamp: string;
}

export interface GeoLocation {
  ip: string;
  country: string;
  lat: number;
  lon: number;
}

export interface Detection {
  type: string;
  severity: DetectionSeverity;
  description: string;
  source_ip: string;
  count: number;
  evidence: string[];
  geo?: GeoLocation | null;
}

export interface AttackTimelineItem {
  timestamp: string;
  title: string;
  description: string;
  severity: DetectionSeverity;
  type: string;
  ip: string;
}

export interface RiskAssessment {
  risk_score: number;
  risk_level: IncidentRiskLevel;
}

export interface CampaignEventSummary {
  timestamp: string;
  title: string;
  description: string;
  endpoint: string;
  status_code: number;
  detection_type: string;
}

export interface CampaignPhase {
  phase: string;
  events: CampaignEventSummary[];
}

export interface AttackCampaign {
  attacker_ip: string;
  campaign_name: string;
  phases: CampaignPhase[];
  severity: DetectionSeverity;
  risk_score: number;
  risk_level: IncidentRiskLevel;
  timeline: AttackTimelineItem[];
  geo?: GeoLocation | null;
}

export interface CaseReference {
  id: string;
  name: string;
  created_at: string;
}

export interface SessionReference {
  id: string;
  filename: string;
  uploaded_at: string;
  source_type: SessionSourceType;
}

export interface AIAnalysis {
  explanation: string;
  risk_level: AIRiskLevel;
  risk_score: number;
  recommended_action: string;
  next_steps: string[];
  source: "ollama" | "fallback";
  warning?: string | null;
}

export interface UploadResponse {
  events: ParsedEvent[];
  detections: Detection[];
  ai_analysis: AIAnalysis;
  timeline: AttackTimelineItem[];
  risk_assessment: RiskAssessment;
  attack_campaigns: AttackCampaign[];
  case?: CaseReference | null;
  session?: SessionReference | null;
}

export interface UploadSessionDetail {
  id: string;
  filename: string;
  uploaded_at: string;
  source_type: SessionSourceType;
  risk_score: number;
  snapshot: UploadResponse;
}

export interface RiskTrendPoint {
  session_id: string;
  filename: string;
  uploaded_at: string;
  risk_score: number;
}

export interface RepeatedAttacker {
  ip: string;
  appearances: number;
  latest_geo?: GeoLocation | null;
}

export interface CaseSummary {
  id: string;
  name: string;
  created_at: string;
  session_count: number;
  latest_uploaded_at?: string | null;
  latest_risk_score: number;
  repeated_attacker_count: number;
}

export interface CaseDetail {
  id: string;
  name: string;
  created_at: string;
  sessions: UploadSessionDetail[];
  risk_trend: RiskTrendPoint[];
  repeated_attackers: RepeatedAttacker[];
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  created_at: string;
}

export interface AuthResponse {
  user: AuthenticatedUser;
}

export interface SearchSessionMatch {
  session: SessionReference;
  matched_event_count: number;
  matched_detection_count: number;
}

export interface SearchEventMatch {
  session: SessionReference;
  event: ParsedEvent;
}

export interface SearchDetectionMatch {
  session: SessionReference;
  detection: Detection;
}

export interface SearchResponse {
  query: string;
  case: CaseReference;
  sessions: SearchSessionMatch[];
  events: SearchEventMatch[];
  detections: SearchDetectionMatch[];
}

export interface ShareCaseResponse {
  token: string;
  expires_at: string;
}

export interface SharedCaseView {
  case: CaseDetail;
  expires_at: string;
}

export interface ExecutiveCountryStat {
  country: string;
  count: number;
}

export interface ExecutiveRiskTrendPoint {
  day: string;
  average_risk_score: number;
  session_count: number;
}

export interface ExecutiveSummary {
  total_incidents: number;
  total_sessions: number;
  average_risk_score: number;
  top_attacker_countries: ExecutiveCountryStat[];
  risk_trend: ExecutiveRiskTrendPoint[];
}

export interface RulesConfig {
  brute_force_threshold: number;
  brute_force_critical_threshold: number;
  scan_threshold: number;
  scan_high_threshold: number;
  probe_threshold: number;
  probe_high_threshold: number;
  time_window_seconds: number;
  campaign_gap_minutes: number;
  compromise_failure_threshold: number;
  compromise_success_window_seconds: number;
  compromise_success_status_codes: number[];
  auth_endpoint_prefixes: string[];
  path_traversal_threshold: number;
  path_traversal_critical_threshold: number;
  path_traversal_patterns: string[];
  path_traversal_sensitive_targets: string[];
  sql_injection_threshold: number;
  sql_injection_critical_threshold: number;
  sql_injection_patterns: string[];
  command_injection_threshold: number;
  command_injection_critical_threshold: number;
  command_injection_patterns: string[];
  suspicious_user_agent_threshold: number;
  suspicious_user_agent_critical_threshold: number;
  suspicious_user_agent_signatures: string[];
  suspicious_user_agent_immediate_signatures: string[];
}

export interface APIKeySummary {
  id: string;
  name: string;
  scope: APIKeyScope;
  created_at: string;
  revoked_at?: string | null;
}

export interface APIKeyCreateResponse {
  api_key: string;
  key: APIKeySummary;
}

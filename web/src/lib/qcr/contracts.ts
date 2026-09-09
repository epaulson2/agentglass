export type QcrTypedRef = { type: string; id: string; revision?: number };

export type QcrProjectionEntry<T = unknown> = { kind: string; key: string; value: T };

export type QcrBootstrap = {
  protocol_version: string;
  stream_id: string;
  cursor: number;
  projection_generation: string;
  projection_version: string;
  reducer_version: string;
  replacement: true;
  projections: QcrProjectionEntry[];
};

export type QcrStreamEnvelope = {
  protocol_version: string;
  stream_id: string;
  cursor: number;
  event_type: string;
  projection_generation: string;
  projection_version: string;
  reducer_version: string;
  payload: {
    operation?: "REPLACE_PROJECTIONS" | "EVENT_ONLY";
    projections?: QcrProjectionEntry[];
    reason?: string;
    replacement_snapshot?: string;
  };
};

export type QcrFieldProvenance = {
  classification: "CANONICAL" | "OBSERVED" | "DERIVED";
  source_refs: string[];
  derivation_rule?: string | null;
  observed_at?: string | null;
};

export type QcrTopologyNode = {
  node_id: string;
  entity_ref: QcrTypedRef;
  node_type: "ROLE" | "ENTITY";
  label: string;
  role_key?: string | null;
  stage_class?: string | null;
  semantic_state: string;
  observed_health?: string | null;
  indicators: Record<string, unknown>;
  provenance: Record<string, QcrFieldProvenance>;
};

export type QcrTopologyEdge = {
  edge_id: string;
  edge_type: "HANDOFF" | "DEPENDENCY" | "RELATIONSHIP";
  relationship_type: string;
  source_node_id: string;
  target_node_id: string;
  entity_ref?: QcrTypedRef | null;
  lifecycle_state?: string | null;
  validity_state?: string | null;
  classification: "CANONICAL" | "OBSERVED" | "DERIVED";
  provenance: QcrFieldProvenance;
};

export type QcrProjectionMetadata = {
  projection_generation: string;
  source_version: number;
  generated_at: string;
  freshness: string;
  valid_until?: string | null;
};

export type QcrTopology = {
  mode: "ORGANIZATION" | "INITIATIVE";
  initiative_ref?: QcrTypedRef | null;
  nodes: QcrTopologyNode[];
  edges: QcrTopologyEdge[];
  diagnostics: string[];
  metadata: QcrProjectionMetadata;
};

export type QcrPortfolioInitiative = {
  initiative_id: string;
  title: string;
  lifecycle_state: string;
  validity_state: string;
  priority: number;
  urgency: number;
  current_stage?: string | null;
  pending_attention: number;
  risk_level: string;
};

export type QcrPortfolio = {
  initiatives: QcrPortfolioInitiative[];
  active_lease_count: number;
  queued_lease_request_count: number;
  resource_pressure: QcrResourcePressure[];
  metadata?: QcrProjectionMetadata;
};

export type QcrResourcePressure = {
  resource_type: string;
  display_locator: string;
  active_leases: number;
  queued_requests: number;
  capacity_used?: number | null;
  capacity_limit?: number | null;
  capacity_state: "AVAILABLE" | "CONTESTED" | "EXHAUSTED";
};

export type QcrResponseOption = {
  option_id: string;
  label: string;
  action_type?: string | null;
  parameters?: Record<string, unknown> | null;
};

export type QcrAttention = {
  attention_id: string;
  initiative_id?: string | null;
  attention_type: string;
  subject_ref?: QcrTypedRef | null;
  owning_domain: string;
  priority: "CRITICAL" | "HIGH" | "NORMAL" | "LOW";
  severity?: string | null;
  reason_code: string;
  summary: string;
  blocking: boolean;
  lifecycle_state: string;
  legal_responses: QcrResponseOption[];
  actionable: boolean;
  state_version: number;
  created_at: string;
};

export type QcrAttentionProjection = { items: QcrAttention[]; actionable_count: number };

export type QcrLegalTransition = {
  action_type: string;
  target_ref?: QcrTypedRef | null;
  eligible: boolean;
  reason_codes: string[];
};

export type QcrResourceConflict = {
  resource_type: string;
  display_locator: string;
  initiative_ids: string[];
  reason: string;
};

export type QcrInitiative = {
  initiative_ref: QcrTypedRef;
  title: string;
  initiative_state: string;
  validity_state: string;
  risk_level: string;
  resource_conflicts: QcrResourceConflict[];
  next_legal_transitions: QcrLegalTransition[];
  metadata: QcrProjectionMetadata;
};

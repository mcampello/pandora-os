// ────────────────────────────────────────────
// Pandora OS — Tipos do banco (espelham schema Supabase)
// ────────────────────────────────────────────

// Conectores
export type ConnectorType = 'gmail' | 'whatsapp' | 'fathom' | 'calcom' | 'telegram' | 'asaas';
export type ConnectorStatus = 'connected' | 'disconnected' | 'error';

export interface Connector {
  id: string;
  type: ConnectorType;
  label: string;
  status: ConnectorStatus;
  credentials?: Record<string, unknown>;
  metadata?: Record<string, string>;
  last_sync_at?: string;
  error_message?: string;
  created_at: string;
  updated_at: string;
}

// Contatos
export interface Contact {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  role?: string;
  linkedin_url?: string;
  website?: string;
  source?: 'whatsapp' | 'email' | 'fathom' | 'calcom' | 'manual' | 'indication';
  tags?: string[];
  notes?: string;
  ai_summary?: string;
  ai_summary_updated_at?: string;
  created_at: string;
  updated_at: string;
}

// Clientes
export type ClientStatus = 'prospect' | 'active' | 'paused' | 'former';

export interface Client {
  id: string;
  contact_id?: string;
  company_name: string;
  status: ClientStatus;
  monthly_fee?: number;
  dedication_hours?: number;
  contract_start?: string;
  contract_end?: string;
  renewal_auto: boolean;
  notes?: string;
  created_at: string;
  updated_at: string;
}

// Oportunidades
export type OpportunityChannel    = 'whatsapp' | 'email' | 'calcom' | 'manual' | 'group';
export type OpportunityConfidence = 'very_high' | 'high' | 'medium' | 'low';
export type OpportunityStatus     = 'new' | 'qualified' | 'dismissed' | 'converted';

export interface Opportunity {
  id: string;
  contact_id?: string;
  channel: OpportunityChannel;
  confidence: OpportunityConfidence;
  title: string;
  description?: string;
  raw_content?: string;
  source_url?: string;
  status: OpportunityStatus;
  detected_at: string;
  qualified_at?: string;
  converted_to_client_id?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

// Propostas
export type ProposalStatus = 'draft' | 'sent' | 'viewed' | 'accepted' | 'rejected' | 'expired';

export interface Proposal {
  id: string;
  client_id?: string;
  proposal_group_id: string;
  version: number;
  title: string;
  content_md?: string;
  value?: number;
  status: ProposalStatus;
  viewer_url?: string;
  sent_at?: string;
  viewed_at?: string;
  responded_at?: string;
  created_at: string;
  updated_at: string;
}

// Contratos
export type ContractStatus = 'draft' | 'in_review' | 'signed' | 'active' | 'ended' | 'cancelled';

export interface Contract {
  id: string;
  client_id?: string;
  contract_group_id: string;
  version: number;
  title: string;
  content_md?: string;
  value?: number;
  status: ContractStatus;
  viewer_url?: string;
  signed_at?: string;
  starts_at?: string;
  ends_at?: string;
  signature_provider?: string;
  signature_external_id?: string;
  created_at: string;
  updated_at: string;
}

// Interações (log unificado por contato)
export type InteractionChannel = 'email' | 'whatsapp' | 'fathom' | 'calcom' | 'manual';
export type InteractionType    = 'message_in' | 'message_out' | 'meeting' | 'email_in' | 'email_out' | 'booking' | 'note';

export interface Interaction {
  id: string;
  contact_id?: string;
  channel: InteractionChannel;
  type: InteractionType;
  subject?: string;
  summary?: string;
  content?: string;
  external_id?: string;
  external_url?: string;
  metadata?: Record<string, unknown>;
  occurred_at: string;
  created_at: string;
}

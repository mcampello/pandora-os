// ────────────────────────────────────────────
// Pandora OS — Tipos do banco (espelham schema Supabase)
// ────────────────────────────────────────────

// Empresas
export type CompanySize = 'startup' | 'pequena' | 'media' | 'grande' | 'enterprise';

export interface Company {
  id: string;
  name: string;
  cnpj?: string;
  website?: string;
  industry?: string;
  size?: CompanySize;
  notes?: string;
  address_street?: string;
  address_number?: string;
  address_complement?: string;
  address_city?: string;
  address_state?: string;
  address_zip?: string;
  responsible_contact_id?: string;
  created_at: string;
  updated_at: string;
}

// Conectores
export type ConnectorType = 'gmail' | 'gcalendar' | 'whatsapp' | 'fathom' | 'calcom' | 'telegram' | 'asaas';
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

// Categoria do contato — define o "ângulo" de análise da AI
export type ContactCategory =
  | 'prospect'
  | 'cliente'
  | 'fornecedor'
  | 'desenvolvedor'
  | 'parceiro'
  | 'casual'
  | 'desconhecido';

// Contatos
export interface Contact {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  company_id?: string;
  role?: string;
  linkedin_url?: string;
  website?: string;
  source?: 'whatsapp' | 'email' | 'fathom' | 'calcom' | 'manual' | 'indication';
  category?: ContactCategory;
  tags?: string[];
  notes?: string;
  ai_summary?: string;
  ai_summary_updated_at?: string;
  // Timestamps reais de último contato por canal (atualizados por trigger)
  last_whatsapp_at?: string;
  last_email_at?: string;
  last_meeting_at?: string;
  created_at: string;
  updated_at: string;
}

// Contact enriquecido com stats de interações (view contacts_with_stats)
export interface ContactWithStats extends Contact {
  last_interaction_at?: string;
  last_interaction_channel?: string;
  last_interaction_subject?: string;
  interaction_count: number;
}

// Clientes
export type ClientStatus = 'prospect' | 'active' | 'paused' | 'former';

export interface Client {
  id: string;
  contact_id?: string;
  company_id?: string;
  company_name: string;
  status: ClientStatus;
  monthly_fee?: number;
  dedication_hours?: number;
  contract_start?: string;
  contract_end?: string;
  renewal_auto: boolean;
  notes?: string;
  health_score?: number;
  health_notes?: string;
  health_updated_at?: string;
  created_at: string;
  updated_at: string;
}

// Oportunidades
export type OpportunityChannel    = 'whatsapp' | 'email' | 'calcom' | 'manual' | 'group';
export type OpportunityConfidence = 'very_high' | 'high' | 'medium' | 'low';
export type OpportunityStatus     = 'nova' | 'em_contato' | 'proposta' | 'contrato' | 'operacional' | 'perdida';

// Qualificação estilo BANT — cada critério tem um estado + observações
export type QualificationState = 'unknown' | 'partial' | 'confirmed';
export type QualificationKey   = 'budget' | 'authority' | 'need' | 'timeline';

export interface QualificationItem {
  status: QualificationState;
  notes?: string;
}

export interface OpportunityQualification {
  budget?: QualificationItem;
  authority?: QualificationItem;
  need?: QualificationItem;
  timeline?: QualificationItem;
  /** Resumo do deal gerado pela IA ("qual o status?") */
  summary?: string;
  /** Próximos passos sugeridos pela IA */
  next_steps?: string[];
  /** Riscos/sinais de alerta identificados pela IA */
  risk?: string;
  updated_at?: string;
  /** true quando o último preenchimento veio da IA */
  ai_generated?: boolean;
}

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
  status_changed_at?: string;
  converted_to_client_id?: string;
  notes?: string;
  value?: number;
  contract_model?: string;
  company?: string;
  qualification?: OpportunityQualification | null;
  created_at: string;
  updated_at: string;
}

export interface OpportunityProposalSnippet {
  id: string;
  title: string;
  value?: number;
  status: string;
}

export interface OpportunityWithContact extends Opportunity {
  contact?: Pick<Contact, "id" | "name" | "company" | "email" | "phone"> | null;
  proposals?: OpportunityProposalSnippet[];
}

// Propostas
export type ProposalStatus = 'draft' | 'sent' | 'viewed' | 'accepted' | 'rejected' | 'expired';

export interface Proposal {
  id: string;
  client_id?: string;
  opportunity_id?: string;
  company_id?: string;
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

export interface ProposalWithRefs extends Proposal {
  client?: Pick<Client, "id" | "company_name" | "status"> | null;
  opportunity?: Pick<Opportunity, "id" | "title" | "status"> | null;
}

// Contratos
export type ContractStatus = 'draft' | 'in_review' | 'signed' | 'active' | 'ended' | 'cancelled';

export interface Contract {
  id: string;
  client_id?: string;
  opportunity_id?: string;
  company_id?: string;
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
  billing_type?: 'mensal' | 'fechado' | null;
  billing_day?: number | null;
  created_at: string;
  updated_at: string;
}

export interface ContractWithRefs extends Contract {
  client?: Pick<Client, "id" | "company_name" | "status"> | null;
  opportunity?: Pick<Opportunity, "id" | "title" | "status"> | null;
}

// Financeiro — NFs e cobranças
export type InvoiceStatus = 'pendente' | 'emitida' | 'paga' | 'cancelada';

export interface Invoice {
  id: string;
  contract_id?: string;
  company_id?: string;
  client_id?: string;
  month: string;       // ISO date, always 1st of month
  number?: string;
  amount: number;
  status: InvoiceStatus;
  due_date?: string;
  issued_at?: string;
  paid_at?: string;
  asaas_id?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

// Financeiro — Pessoas do contrato
export interface ContractContact {
  id: string;
  contract_id: string;
  contact_id: string;
  role?: string;
  contact?: Pick<Contact, 'id' | 'name' | 'email' | 'phone' | 'role'>;
  created_at: string;
}

// Financeiro — Contrato enriquecido para listagem
export interface ContractFinanceiro extends Contract {
  company?: Pick<Company, 'id' | 'name' | 'cnpj'> | null;
  client?: Pick<Client, 'id' | 'company_name' | 'status' | 'monthly_fee'> | null;
  pending_invoices: number;
  total_invoiced: number;
}

// Snapshots de análise AI por contato
export interface AnalysisSnapshot {
  id: string;
  contact_id: string;
  who?: string;
  status?: string;
  topics?: string[];
  sales_strategy?: string;
  next_steps?: string[];
  last_doc_id?: number;
  message_count: number;
  model?: string;
  created_at: string;
}

// Operação — entregas mensais e horas
export interface Deliverable {
  id: string;
  client_id: string;
  month: string; // date, always first day of month: '2026-05-01'
  title: string;
  done: boolean;
  notes?: string;
  due_date?: string;
  created_at: string;
  updated_at: string;
}

export interface HoursEntry {
  id: string;
  client_id: string;
  date: string; // date
  hours: number;
  description?: string;
  created_at: string;
  updated_at: string;
}

// Operação — iniciativas e tarefas
export type InitiativeStatus = 'backlog' | 'active' | 'paused' | 'done';
export type InitiativeTaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done';

export interface Initiative {
  id: string;
  client_id: string;
  title: string;
  description?: string;
  status: InitiativeStatus;
  priority?: number;
  start_date?: string;
  due_date?: string;
  created_at: string;
  updated_at: string;
  tasks?: InitiativeTask[];
}

export interface InitiativeTask {
  id: string;
  initiative_id: string;
  title: string;
  status: InitiativeTaskStatus;
  assignee?: string;
  due_date?: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// Agente de Operações — ações propostas (não aplicadas sem aprovação)
export type ProposedActionType =
  | 'create_initiative'
  | 'create_task'
  | 'update_task'
  | 'update_initiative'
  | 'add_deliverable';

export interface ProposedAction {
  id: string;
  type: ProposedActionType;
  description: string;
  reasoning: string;
  payload: Record<string, unknown>;
}

// Financeiro — Custos por contrato (serviços pagos pela Pandora em nome do cliente)
export type CostRecurrence = 'mensal' | 'anual' | 'pontual';

export interface ContractCost {
  id: string;
  contract_id: string;
  name: string;
  category?: string;
  amount: number;
  currency: string;
  recurrence: CostRecurrence;
  notes?: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

// Financeiro — Despesas da Pandora Tech (ferramentas, subscriptions, custos fixos)
export interface CompanyExpense {
  id: string;
  name: string;
  category?: string;
  amount: number;
  currency: string;
  recurrence: CostRecurrence;
  notes?: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

// Interações (log unificado por contato)
export type InteractionChannel = 'email' | 'whatsapp' | 'fathom' | 'calcom' | 'manual';
export type InteractionType    = 'message_in' | 'message_out' | 'meeting' | 'email_in' | 'email_out' | 'booking' | 'note';

export interface Interaction {
  id: string;
  contact_id?: string;
  opportunity_id?: string;
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

// Pessoas envolvidas numa oportunidade (além do contato principal)
export interface OpportunityContact {
  id: string;
  opportunity_id: string;
  contact_id: string;
  role?: string;
  contact?: Pick<Contact, 'id' | 'name' | 'email' | 'phone' | 'company' | 'role'>;
  created_at: string;
}

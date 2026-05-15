export type ConnectorType = 'gmail' | 'whatsapp' | 'fathom' | 'calcom' | 'telegram' | 'asaas';
export type ConnectorStatus = 'connected' | 'disconnected' | 'error';

export interface Connector {
  id: string;
  type: ConnectorType;
  label: string;
  status: ConnectorStatus;
  metadata?: Record<string, string>;
  last_sync_at?: string;
  error_message?: string;
  created_at: string;
  updated_at: string;
}

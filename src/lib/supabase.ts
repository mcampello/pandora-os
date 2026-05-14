import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(url, key)

export type ConnectorType = 'gmail' | 'whatsapp' | 'fathom' | 'calcom' | 'telegram' | 'asaas'
export type ConnectorStatus = 'connected' | 'disconnected' | 'error'

export interface Connector {
  id: string
  type: ConnectorType
  label: string
  status: ConnectorStatus
  metadata?: Record<string, string>
  last_sync_at?: string
  error_message?: string
  created_at: string
  updated_at: string
}

export interface Project {
  id: string
  name: string
  description?: string
  base_url: string
  created_at: string
  updated_at: string
}

export interface CrawlSession {
  id: string
  project_id: string
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'
  pages_visited: number
  pages_total: number
  errors_count: number
  started_at?: string
  completed_at?: string
  last_error?: string
}

export interface GraphNode {
  id: string
  node_type: string
  name: string
  label: string
  url?: string
  content?: string
  properties?: Record<string, any>
}

export interface GraphEdge {
  id: string
  source_id: string
  target_id: string
  edge_type: string
  label?: string
  properties?: Record<string, any>
}

export interface PageSnapshot {
  id: string
  url: string
  url_hash: string
  title: string
  snapshot_type: 'full' | 'dom' | 'screenshot' | 'interaction'
  captured_at: string
  http_status: number
  load_time_ms: number
  resource_count: number
}

export interface Workflow {
  id: string
  name: string
  description?: string
  category?: string
  difficulty: 'easy' | 'medium' | 'hard'
  steps: WorkflowStep[]
}

export interface WorkflowStep {
  step_number: number
  action: string
  description: string
  expected_outcome?: string
}

export interface GraphStats {
  nodes: number
  edges: number
  pages: number
  elements: number
}

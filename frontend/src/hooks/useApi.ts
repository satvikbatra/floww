import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Projects
export const getProjects = () => api.get('/projects')
export const getProject = (id: string) => api.get(`/projects/${id}`)
export const createProject = (data: any) => api.post('/projects', data)
export const deleteProject = (id: string) => api.delete(`/projects/${id}`)

// Crawl
export const startCrawl = (projectId: string, data?: any) =>
  api.post(`/projects/${projectId}/crawl`, data || {})
export const getCrawlSessions = (projectId: string) =>
  api.get(`/projects/${projectId}/crawl`)
export const getCrawlStatus = (projectId: string, sessionId: string) =>
  api.get(`/projects/${projectId}/crawl/${sessionId}`)
export const sendCrawlAction = (projectId: string, sessionId: string, action: string) =>
  api.post(`/projects/${projectId}/crawl/action`, { sessionId, action })

// Documents
export const generateDocument = (projectId: string, data: any) =>
  api.post(`/projects/${projectId}/documents`, data)
export const getDocuments = (projectId: string) =>
  api.get(`/projects/${projectId}/documents`)
export const getDocument = (projectId: string, docId: string) =>
  api.get(`/projects/${projectId}/documents/${docId}`)
export const downloadDocument = (projectId: string, docId: string) =>
  api.get(`/projects/${projectId}/documents/${docId}/content`, { responseType: 'blob' })
export const deleteDocument = (projectId: string, docId: string) =>
  api.delete(`/projects/${projectId}/documents/${docId}`)

// Analysis
export const startAnalysis = (projectId: string, crawlSessionId?: string) =>
  api.post(`/projects/${projectId}/analyze`, { crawlSessionId })
export const getAnalysisStatus = (projectId: string) =>
  api.get(`/projects/${projectId}/analyze/status`)

// Graph
export const getGraphNodes = (projectId: string, params?: any) => 
  api.get(`/projects/${projectId}/graph/nodes`, { params })
export const getGraphEdges = (projectId: string, params?: any) => 
  api.get(`/projects/${projectId}/graph/edges`, { params })
export const getGraphStats = (projectId: string) => 
  api.get(`/projects/${projectId}/graph/stats`)
export const getWorkflows = (projectId: string) => 
  api.get(`/projects/${projectId}/graph/workflows`)
export const getVisualizationData = (projectId: string, pageUrl?: string) => 
  api.get(`/projects/${projectId}/graph/visualization`, { params: { page_url: pageUrl } })

// Archive
export const getSnapshots = (projectId: string, url?: string) => 
  api.get(`/projects/${projectId}/archive/snapshots`, { params: { url } })
export const getTimeline = (projectId: string, urlHash: string) => 
  api.get(`/projects/${projectId}/archive/timeline/${urlHash}`)
export const getArchiveStats = (projectId: string) => 
  api.get(`/projects/${projectId}/archive/stats`)

// Auth
export const login = (email: string, password: string) => 
  api.post('/auth/login', { email, password })
export const register = (data: any) => 
  api.post('/auth/register', data)

export default api

import { Routes, Route } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { AuthLayout } from './layouts/AuthLayout'
import { AppLayout } from './layouts/AppLayout'
import { LoginPage } from './pages/auth/LoginPage'
import { RegisterPage } from './pages/auth/RegisterPage'
import Dashboard from './pages/Dashboard'
import ProjectList from './pages/ProjectList'
import ProjectCreate from './pages/ProjectCreate'
import ProjectDetail from './pages/ProjectDetail'
import GraphExplorer from './pages/GraphExplorer'
import ArchiveBrowser from './pages/ArchiveBrowser'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ToastProvider } from './components/Toast'


function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            {/* Public auth routes */}
            <Route element={<AuthLayout />}>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
            </Route>

            {/* Protected app routes */}
            <Route element={<AppLayout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/projects" element={<ProjectList />} />
              <Route path="/projects/new" element={<ProjectCreate />} />
              <Route path="/projects/:id" element={<ProjectDetail />} />
              <Route path="/graph" element={<GraphExplorer />} />
              <Route path="/archive" element={<ArchiveBrowser />} />
            </Route>
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  )
}

export default App

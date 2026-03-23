import React, { useState } from 'react'
import { Routes, Route, Link } from 'react-router-dom'
import { LayoutDashboard, Archive, Share2, FileText, Settings } from 'lucide-react'
import ProjectList from './pages/ProjectList'
import ProjectCreate from './pages/ProjectCreate'
import ProjectDetail from './pages/ProjectDetail'
import GraphExplorer from './pages/GraphExplorer'
import ArchiveBrowser from './pages/ArchiveBrowser'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ToastProvider } from './components/Toast'
import './App.css'

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true)

  return (
    <ErrorBoundary>
      <ToastProvider>
        <div className="app">
          <aside className={`sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
            <div className="sidebar-header">
              <h1 className="logo">Floww</h1>
              <button onClick={() => setSidebarOpen(!sidebarOpen)} className="toggle-btn">
                {sidebarOpen ? '\u2190' : '\u2192'}
              </button>
            </div>

            <nav className="sidebar-nav">
              <Link to="/" className="nav-item">
                <LayoutDashboard size={20} />
                {sidebarOpen && <span>Dashboard</span>}
              </Link>
              <Link to="/projects" className="nav-item">
                <FileText size={20} />
                {sidebarOpen && <span>Projects</span>}
              </Link>
              <Link to="/graph" className="nav-item">
                <Share2 size={20} />
                {sidebarOpen && <span>Graph Explorer</span>}
              </Link>
              <Link to="/archive" className="nav-item">
                <Archive size={20} />
                {sidebarOpen && <span>Archive</span>}
              </Link>
            </nav>

            <div className="sidebar-footer">
              <Link to="/settings" className="nav-item">
                <Settings size={20} />
                {sidebarOpen && <span>Settings</span>}
              </Link>
            </div>
          </aside>

          <main className="main-content">
            <ErrorBoundary>
              <Routes>
                <Route path="/" element={<ProjectList />} />
                <Route path="/projects" element={<ProjectList />} />
                <Route path="/projects/new" element={<ProjectCreate />} />
                <Route path="/projects/:id" element={<ProjectDetail />} />
                <Route path="/graph" element={<GraphExplorer />} />
                <Route path="/archive" element={<ArchiveBrowser />} />
              </Routes>
            </ErrorBoundary>
          </main>
        </div>
      </ToastProvider>
    </ErrorBoundary>
  )
}

export default App

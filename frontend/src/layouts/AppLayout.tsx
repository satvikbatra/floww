import { useState } from 'react'
import { Outlet, Link, useLocation, Navigate } from 'react-router-dom'
import {
  LayoutDashboard,
  FolderOpen,
  Share2,
  Archive,
  Settings,
  Menu,
  X,
  LogOut,
  ChevronLeft,
} from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useAuth } from '../hooks/useAuth'
import { Avatar } from '../components/ui/Avatar'
import { Dropdown } from '../components/ui/Dropdown'
import { Breadcrumb } from '../components/ui/Breadcrumb'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { cn } from '../utils/cn'
import styles from './AppLayout.module.css'

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/', icon: LayoutDashboard, exact: true },
  { label: 'Projects', href: '/projects', icon: FolderOpen, exact: false },
  { label: 'Graph Explorer', href: '/graph', icon: Share2, exact: false },
  { label: 'Archive', href: '/archive', icon: Archive, exact: false },
]

function getBreadcrumbs(pathname: string) {
  const segments = pathname.split('/').filter(Boolean)
  const items: Array<{ label: string; href?: string }> = [
    { label: 'Home', href: '/' },
  ]
  let path = ''
  for (const segment of segments) {
    path += `/${segment}`
    const label =
      segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' ')
    items.push({ label, href: path })
  }
  // Last item has no href (current page)
  if (items.length > 1) {
    delete items[items.length - 1].href
  }
  return items
}

export function AppLayout() {
  const { user, isAuthenticated, isLoading, logout } = useAuth()
  const location = useLocation()
  const isMobile = useMediaQuery('(max-width: 768px)')
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  if (isLoading) {
    return null
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  const displayName = user?.fullName || user?.username || 'User'
  const userRole = user?.role || 'member'
  const breadcrumbs = getBreadcrumbs(location.pathname)

  const isActive = (href: string, exact: boolean) => {
    if (exact) return location.pathname === href
    return location.pathname.startsWith(href)
  }

  const handleNavClick = () => {
    if (isMobile) {
      setMobileOpen(false)
    }
  }

  const userDropdownItems = [
    {
      label: 'Settings',
      icon: <Settings size={14} />,
      onClick: () => {},
    },
    {
      label: '',
      icon: undefined,
      onClick: () => {},
      divider: true,
    },
    {
      label: 'Log out',
      icon: <LogOut size={14} />,
      onClick: logout,
      danger: true,
    },
  ]

  return (
    <div className={styles.layout}>
      {/* Mobile overlay */}
      {isMobile && mobileOpen && (
        <div
          className={styles.mobileOverlay}
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          styles.sidebar,
          !isMobile && collapsed && styles.sidebarCollapsed,
          isMobile && mobileOpen && styles.sidebarOpen,
        )}
      >
        <div className={styles.sidebarHeader}>
          {(!collapsed || isMobile) && <div className={styles.logo}>Floww</div>}
          {isMobile ? (
            <button
              className={styles.collapseBtn}
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
              style={{ display: 'flex' }}
            >
              <X size={18} />
            </button>
          ) : (
            <button
              className={styles.collapseBtn}
              onClick={() => setCollapsed((prev) => !prev)}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <ChevronLeft
                size={18}
                style={{
                  transform: collapsed ? 'rotate(180deg)' : 'none',
                  transition: `transform var(--duration-slow) var(--ease-default)`,
                }}
              />
            </button>
          )}
        </div>

        <nav className={styles.nav}>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const active = isActive(item.href, item.exact)
            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn(styles.navItem, active && styles.navItemActive)}
                onClick={handleNavClick}
                title={collapsed && !isMobile ? item.label : undefined}
              >
                <span className={styles.navIcon}>
                  <Icon size={20} />
                </span>
                {(!collapsed || isMobile) && (
                  <span className={styles.navLabel}>{item.label}</span>
                )}
              </Link>
            )
          })}
        </nav>

        <div className={styles.userSection}>
          <Dropdown
            trigger={
              <div className={styles.userTrigger}>
                <Avatar name={displayName} size="sm" src={user?.avatarUrl} />
                {(!collapsed || isMobile) && (
                  <div className={styles.userInfo}>
                    <div className={styles.userName}>{displayName}</div>
                    <div className={styles.userRole}>{userRole}</div>
                  </div>
                )}
              </div>
            }
            items={userDropdownItems}
            align="left"
          />
        </div>
      </aside>

      {/* Top bar */}
      <header
        className={cn(
          styles.topbar,
          !isMobile && collapsed && styles.topbarCollapsed,
        )}
      >
        <div className={styles.topbarContent}>
          <div className={styles.topbarLeft}>
            {isMobile && (
              <button
                className={styles.mobileMenuBtn}
                onClick={() => setMobileOpen(true)}
                aria-label="Open menu"
              >
                <Menu size={20} />
              </button>
            )}
            <Breadcrumb items={breadcrumbs} />
          </div>
          <div className={styles.topbarRight}>
            <Dropdown
              trigger={
                <div className={styles.topbarAvatar}>
                  <Avatar
                    name={displayName}
                    size="sm"
                    src={user?.avatarUrl}
                  />
                </div>
              }
              items={userDropdownItems}
            />
          </div>
        </div>
      </header>

      {/* Main content */}
      <main
        className={cn(
          styles.mainContent,
          !isMobile && collapsed && styles.mainContentCollapsed,
        )}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            className={styles.contentInner}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  )
}

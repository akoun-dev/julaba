'use client'

import { type ReactNode } from 'react'
import { useBackofficeStore, BO_COLOR, hasModuleAccess, SIDEBAR_ITEMS } from '@/lib/stores/backoffice-store'
import { useAppStore } from '@/lib/stores/app-store'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  LayoutDashboard,
  Users,
  FileCheck,
  Map,
  Target,
  Eye,
  UserCog,
  BarChart3,
  Shield,
  Building2,
  AlertTriangle,
  ArrowLeftRight,
  BookOpen,
  Bot,
  Radio,
  TrendingUp,
  CreditCard,
  Key,
  ShoppingCart,
  Truck,
  MessageSquare,
  Clock,
  Settings,
  Wallet,
  Search,
  Bell,
  LogOut,
  ChevronsLeft,
  ChevronsRight,
  ChevronRight,
  Monitor,
  AlertCircle,
} from 'lucide-react'

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard,
  Users,
  FileCheck,
  Map,
  Target,
  Eye,
  UserCog,
  BarChart3,
  Shield,
  Building2,
  AlertTriangle,
  ArrowLeftRight,
  BookOpen,
  Bot,
  Radio,
  TrendingUp,
  CreditCard,
  Key,
  ShoppingCart,
  Truck,
  MessageSquare,
  Clock,
  Settings,
  Wallet,
}

const SYSTEM_SERVICES = [
  { name: 'API', status: 'ok' as const },
  { name: 'Base de données', status: 'ok' as const },
  { name: 'STT', status: 'ok' as const },
  { name: 'SMS', status: 'slow' as const },
]

function SidebarItem({ item, collapsed, isActive, hasAccess, onClick }: {
  item: typeof SIDEBAR_ITEMS[0]
  collapsed: boolean
  isActive: boolean
  hasAccess: boolean
  onClick: () => void
}) {
  const Icon = ICON_MAP[item.icon]

  if (!hasAccess) return null

  const content = (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150 group relative
        ${isActive
          ? 'bg-white text-[#333333] font-semibold shadow-sm'
          : 'text-gray-300 hover:bg-white/10 hover:text-white'
        }
        ${!hasAccess ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}
      `}
    >
      {Icon && <Icon className={`w-[18px] h-[18px] shrink-0 ${isActive ? 'text-[#333333]' : 'text-gray-400 group-hover:text-white'}`} />}
      {!collapsed && (
        <span className='truncate'>{item.label}</span>
      )}
      {!collapsed && item.badge && item.badge > 0 && (
        <span className='ml-auto bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center'>
          {item.badge > 99 ? '99+' : item.badge}
        </span>
      )}
      {collapsed && item.badge && item.badge > 0 && (
        <span className='absolute -top-1 -right-1 bg-red-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center'>
          {item.badge > 99 ? '!' : item.badge}
        </span>
      )}
    </button>
  )

  if (collapsed) {
    return (
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>{content}</TooltipTrigger>
          <TooltipContent side='right' className='bg-gray-800 text-white border-gray-700'>
            <p className='text-sm'>{item.label}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return content
}

export function BoLayout({ children }: { children: ReactNode }) {
  const {
    boUser,
    boUserRole,
    boCurrentScreen,
    boNavigate,
    sidebarCollapsed,
    toggleSidebar,
    alerts,
    ticker,
    enrolments,
  } = useBackofficeStore()
  const { navigate, logout, setUserRole } = useAppStore()

  const pendingEnrolments = enrolments.filter(e => e.status === 'en_attente').length
  const unacknowledgedAlerts = alerts.filter(a => !a.acknowledged).length

  const handleLogout = () => {
    logout()
    setUserRole('marchand')
  }

  // Add badge to enrolement item
  const itemsWithBadges = SIDEBAR_ITEMS.map(item => {
    if (item.id === 'bo-enrolement') return { ...item, badge: pendingEnrolments }
    return item
  })

  return (
    <div className='h-screen flex flex-col overflow-hidden bg-[#F8F9FA]'>
      {/* HEADER */}
      <header
        className='h-14 flex items-center justify-between px-4 border-b shrink-0 z-20'
        style={{ backgroundColor: '#333333', borderColor: '#444444' }}
      >
        <div className='flex items-center gap-3'>
          <div className='flex items-center gap-2'>
            <div className='w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center'>
              <Monitor className='w-4 h-4 text-white' />
            </div>
            <span className='text-white font-bold text-lg tracking-tight'>Jùlaba</span>
            <Badge variant='outline' className='text-[10px] text-orange-300 border-orange-300/30 ml-1'>BO</Badge>
          </div>
          <Separator orientation='vertical' className='h-6 bg-white/20 mx-2' />
          <span className='text-gray-400 text-sm hidden md:block'>BackOffice Administration</span>
        </div>

        {/* Search */}
        <div className='hidden lg:flex items-center flex-1 max-w-md mx-8'>
          <div className='relative w-full'>
            <Search className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400' />
            <input
              type='text'
              placeholder='Rechercher partout... (Ctrl+K)'
              className='w-full pl-10 pr-4 py-1.5 bg-white/10 border border-white/10 rounded-lg text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-white/30 transition-colors'
            />
          </div>
        </div>

        <div className='flex items-center gap-2'>
          {/* Real-time ticker */}
          <div className='hidden md:flex items-center gap-4 mr-4 text-xs text-gray-400'>
            <span className='flex items-center gap-1'>
              <span className='w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse' />
              {ticker.transactionsPerMin} tr/min
            </span>
            <span className='flex items-center gap-1'>
              <span className='w-1.5 h-1.5 rounded-full bg-blue-400' />
              {ticker.activeUsers.toLocaleString()} actifs
            </span>
          </div>

          {/* Alerts */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant='ghost' size='icon' className='relative text-gray-300 hover:text-white hover:bg-white/10'>
                <Bell className='w-4 h-4' />
                {unacknowledgedAlerts > 0 && (
                  <span className='absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-bold'>
                    {unacknowledgedAlerts}
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end' className='w-80'>
              <DropdownMenuLabel className='flex items-center justify-between'>
                <span>Notifications</span>
                {unacknowledgedAlerts > 0 && (
                  <Badge variant='destructive' className='text-[10px]'>{unacknowledgedAlerts} nouvelles</Badge>
                )}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {alerts.slice(0, 5).map(alert => (
                <DropdownMenuItem key={alert.id} className='flex flex-col items-start gap-1 p-3'>
                  <div className='flex items-center gap-2 w-full'>
                    <span className={`w-2 h-2 rounded-full shrink-0 ${
                      alert.severity === 'critique' ? 'bg-red-500' :
                      alert.severity === 'haute' ? 'bg-orange-500' :
                      alert.severity === 'moyenne' ? 'bg-yellow-500' : 'bg-blue-500'
                    }`} />
                    <span className='text-sm font-medium flex-1'>{alert.title}</span>
                    {!alert.acknowledged && <span className='w-1.5 h-1.5 rounded-full bg-blue-500' />}
                  </div>
                  <p className='text-xs text-gray-500 pl-4'>{alert.message}</p>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* User menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant='ghost' className='flex items-center gap-2 text-gray-300 hover:text-white hover:bg-white/10 px-2'>
                <Avatar className='w-7 h-7'>
                  <AvatarFallback className='bg-white/20 text-white text-xs'>
                    {boUser?.name?.charAt(0) || 'BO'}
                  </AvatarFallback>
                </Avatar>
                <span className='hidden md:block text-sm'>{boUser?.name || 'Admin'}</span>
                <ChevronRight className='w-3 h-3 rotate-90' />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end' className='w-56'>
              <DropdownMenuLabel>
                <div className='flex flex-col'>
                  <span>{boUser?.name || 'Admin'}</span>
                  <span className='text-xs text-gray-500 font-normal'>{boUser?.email}</span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate('bo-dashboard')}>
                <LayoutDashboard className='w-4 h-4 mr-2' />
                Tableau de bord
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className='text-red-600 focus:text-red-600'>
                <LogOut className='w-4 h-4 mr-2' />
                Se déconnecter
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className='flex flex-1 overflow-hidden'>
        {/* SIDEBAR */}
        <aside
          className={`shrink-0 flex flex-col border-r bg-[#1A1A1A] transition-all duration-200 z-10 ${sidebarCollapsed ? 'w-16' : 'w-60'}`}
          style={{ borderColor: '#2A2A2A' }}
        >
          <div className='flex-1 overflow-y-auto overflow-x-hidden py-3 px-2'>
            <div className='space-y-0.5'>
              {itemsWithBadges.map(item => (
                <SidebarItem
                  key={item.id}
                  item={item}
                  collapsed={sidebarCollapsed}
                  isActive={boCurrentScreen === item.id}
                  hasAccess={hasModuleAccess(boUserRole, item.id.replace('bo-', '') as any)}
                  onClick={() => boNavigate(item.id)}
                />
              ))}
            </div>
          </div>

          {/* Sidebar footer */}
          <div className='p-2 border-t' style={{ borderColor: '#2A2A2A' }}>
            <button
              onClick={toggleSidebar}
              className='w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors text-sm'
            >
              {sidebarCollapsed ? <ChevronsRight className='w-4 h-4' /> : <ChevronsLeft className='w-4 h-4' />}
              {!sidebarCollapsed && <span>Réduire</span>}
            </button>
          </div>
        </aside>

        {/* MAIN CONTENT */}
        <main className='flex-1 overflow-auto'>
          {children}
        </main>
      </div>

      {/* STATUS BAR */}
      <footer
        className='h-7 flex items-center justify-between px-4 text-[11px] border-t shrink-0'
        style={{ backgroundColor: '#333333', borderColor: '#444444', color: '#999999' }}
      >
        <div className='flex items-center gap-4'>
          <span className='flex items-center gap-1.5'>
            <span className='w-1.5 h-1.5 rounded-full bg-emerald-400' />
            Système OK
          </span>
          <span>{ticker.activeUsers.toLocaleString()} actifs</span>
          <span>{ticker.transactionsPerMin} transactions/min</span>
        </div>
        <div className='flex items-center gap-4'>
          {SYSTEM_SERVICES.map(svc => (
            <span key={svc.name} className='flex items-center gap-1'>
              <span className={`w-1.5 h-1.5 rounded-full ${
                svc.status === 'ok' ? 'bg-emerald-400' :
                svc.status === 'slow' ? 'bg-yellow-400' : 'bg-red-400'
              }`} />
              <span className='hidden sm:inline'>{svc.name}</span>
              <span className={`hidden sm:inline ${svc.status === 'ok' ? 'text-emerald-400' : svc.status === 'slow' ? 'text-yellow-400' : 'text-red-400'}`}>
                {svc.status === 'ok' ? 'OK' : svc.status === 'slow' ? 'Lent' : 'ERR'}
              </span>
            </span>
          ))}
          <span>v5.0</span>
        </div>
      </footer>
    </div>
  )
}

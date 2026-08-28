'use client'

import { type ReactNode, useEffect } from 'react'
import { useBackofficeStore, hasModuleAccess, SIDEBAR_ITEMS } from '@/lib/stores/backoffice-store'
import { useAppStore } from '@/lib/stores/app-store'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
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
  ChevronDown,
  Activity,
  Sun,
  Moon,
} from 'lucide-react'

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard, Users, FileCheck, Map, Target, Eye, UserCog, BarChart3,
  Shield, Building2, AlertTriangle, ArrowLeftRight, BookOpen, Bot, Radio,
  TrendingUp, CreditCard, Key, ShoppingCart, Truck, MessageSquare, Clock, Settings, Wallet,
}

const SYSTEM_SERVICES = [
  { name: 'API', status: 'ok' as const },
  { name: 'BDD', status: 'ok' as const },
  { name: 'STT', status: 'ok' as const },
  { name: 'SMS', status: 'slow' as const },
]

function SidebarItem({ item, collapsed, isActive, hasAccess, onClick, isDark }: {
  item: typeof SIDEBAR_ITEMS[0]
  collapsed: boolean
  isActive: boolean
  hasAccess: boolean
  onClick: () => void
  isDark: boolean
}) {
  const Icon = ICON_MAP[item.icon]
  if (!hasAccess) return null

  const content = (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 group relative
        ${isActive
          ? isDark
            ? 'bg-blue-500/15 text-blue-400 font-semibold'
            : 'bg-blue-50 text-blue-600 font-semibold'
          : isDark
            ? 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
            : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
        }
        ${!hasAccess ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}
      `}
    >
      {isActive && (
        <span className={`absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full ${isDark ? 'bg-blue-400' : 'bg-blue-500'}`} />
      )}
      {Icon && <Icon className={`w-5 h-5 shrink-0 ${isActive
        ? isDark ? 'text-blue-400' : 'text-blue-600'
        : isDark ? 'text-slate-500 group-hover:text-slate-300' : 'text-slate-400 group-hover:text-slate-600'
      }`} />}
      {!collapsed && <span className='truncate'>{item.label}</span>}
      {!collapsed && item.badge && item.badge > 0 && (
        <span className='ml-auto bg-red-500 text-white text-[10px] rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 font-semibold'>
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
          <TooltipContent side='right' className={`${isDark ? 'bg-slate-700 text-white border-slate-600' : 'bg-slate-800 text-white border-slate-700'}`}>
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
    boUser, boUserRole, boCurrentScreen, boNavigate,
    sidebarCollapsed, toggleSidebar, alerts, ticker, enrolments,
    boTheme, toggleBoTheme,
  } = useBackofficeStore()
  const { navigate, logout, setUserRole } = useAppStore()

  const isDark = boTheme === 'dark'

  // Sync dark class to <html> so CSS variables and Tailwind dark: variants work
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
  }, [isDark])
  const pendingEnrolments = enrolments.filter(e => e.status === 'en_attente').length
  const unacknowledgedAlerts = alerts.filter(a => !a.acknowledged).length

  const handleLogout = () => {
    logout()
    setUserRole('marchand')
  }

  const itemsWithBadges = SIDEBAR_ITEMS.map(item => {
    if (item.id === 'bo-enrolement') return { ...item, badge: pendingEnrolments }
    return item
  })

  const currentLabel = SIDEBAR_ITEMS.find(i => i.id === boCurrentScreen)?.label || 'Tableau de bord'

  return (
    <div className={`h-screen flex flex-col overflow-hidden transition-colors duration-200 ${isDark ? 'bg-slate-900' : 'bg-[#F8FAFC]'}`}>
      {/* HEADER */}
      <header className={`h-16 flex items-center justify-between px-6 border-b shrink-0 z-20 transition-colors duration-200 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
        <div className='flex items-center gap-4'>
          <div className='flex items-center gap-2'>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isDark ? 'bg-blue-500' : 'bg-slate-900'}`}>
              <span className='text-white font-bold text-sm'>J</span>
            </div>
            <span className={`font-bold text-lg tracking-tight hidden sm:block ${isDark ? 'text-white' : 'text-slate-900'}`}>Jùlaba</span>
          </div>
          <div className={`h-6 w-px hidden sm:block ${isDark ? 'bg-slate-700' : 'bg-slate-200'}`} />
          <h1 className={`font-semibold text-base hidden md:block ${isDark ? 'text-slate-300' : 'text-slate-900'}`}>{currentLabel}</h1>
        </div>

        {/* Search */}
        <div className='hidden lg:flex items-center flex-1 max-w-md mx-8'>
          <div className='relative w-full'>
            <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
            <input
              type='text'
              placeholder='Rechercher partout...'
              className={`w-full pl-10 pr-4 py-2 rounded-lg text-sm border border-transparent transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300
                ${isDark
                  ? 'bg-slate-700/50 text-white placeholder:text-slate-500 focus:bg-slate-700'
                  : 'bg-slate-100 text-slate-900 placeholder:text-slate-400 focus:bg-white'
                }`}
            />
          </div>
        </div>

        {/* Right actions */}
        <div className='flex items-center gap-2'>
          <div className={`hidden md:flex items-center gap-4 mr-2 text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
            <span className='flex items-center gap-1.5'>
              <span className='w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse' />
              {ticker.transactionsPerMin} tr/min
            </span>
            <span className='flex items-center gap-1.5'>
              <Activity className='w-3 h-3' />
              {ticker.uptime}%
            </span>
          </div>

          {/* Theme toggle */}
          <button
            onClick={toggleBoTheme}
            className={`p-2 rounded-lg transition-colors ${isDark ? 'text-slate-400 hover:text-yellow-400 hover:bg-slate-700' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}`}
            title={isDark ? 'Mode clair' : 'Mode sombre'}
          >
            {isDark ? <Sun className='w-[18px] h-[18px]' /> : <Moon className='w-[18px] h-[18px]' />}
          </button>

          {/* Alerts */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={`relative p-2 rounded-lg transition-colors ${isDark ? 'text-slate-400 hover:bg-slate-700 hover:text-slate-200' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'}`}>
                <Bell className='w-5 h-5' />
                {unacknowledgedAlerts > 0 && (
                  <span className='absolute top-1 right-1 bg-red-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-bold'>
                    {unacknowledgedAlerts}
                  </span>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end' className={`w-80 ${isDark ? 'bg-slate-800 border-slate-700' : ''}`}>
              <DropdownMenuLabel className='flex items-center justify-between'>
                <span className={isDark ? 'text-white' : 'text-slate-900'}>Notifications</span>
                {unacknowledgedAlerts > 0 && <Badge variant='destructive' className='text-[10px]'>{unacknowledgedAlerts} nouvelles</Badge>}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {alerts.slice(0, 5).map(alert => (
                <DropdownMenuItem key={alert.id} className='flex flex-col items-start gap-1 p-3 cursor-pointer'>
                  <div className='flex items-center gap-2 w-full'>
                    <span className={`w-2 h-2 rounded-full shrink-0 ${
                      alert.severity === 'critique' ? 'bg-red-500' : alert.severity === 'haute' ? 'bg-orange-500' : alert.severity === 'moyenne' ? 'bg-yellow-500' : 'bg-blue-500'
                    }`} />
                    <span className={`text-sm font-medium flex-1 ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>{alert.title}</span>
                    {!alert.acknowledged && <span className='w-1.5 h-1.5 rounded-full bg-blue-500' />}
                  </div>
                  <p className={`text-xs pl-4 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{alert.message}</p>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* User menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={`flex items-center gap-2.5 pl-2 pr-3 py-1.5 rounded-lg transition-colors cursor-pointer ${isDark ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`}>
                <Avatar className='w-8 h-8'>
                  <AvatarFallback className={`${isDark ? 'bg-slate-600 text-slate-200' : 'bg-blue-100 text-blue-700'} text-xs font-semibold`}>
                    {boUser?.name?.split(' ').map(n => n[0]).join('').slice(0, 2) || 'BO'}
                  </AvatarFallback>
                </Avatar>
                <div className='hidden md:block text-left'>
                  <p className={`text-sm font-medium leading-tight ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>{boUser?.name || 'Admin'}</p>
                  <p className={`text-[11px] leading-tight ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{boUser?.email}</p>
                </div>
                <ChevronDown className={`w-4 h-4 hidden md:block ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end' className={`w-56 ${isDark ? 'bg-slate-800 border-slate-700' : ''}`}>
              <DropdownMenuLabel>
                <div className='flex flex-col'>
                  <span className={isDark ? 'text-white' : 'text-slate-900'}>{boUser?.name || 'Admin'}</span>
                  <span className={`text-xs font-normal ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>{boUser?.email}</span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate('bo-dashboard')} className='cursor-pointer'>
                <LayoutDashboard className={`w-4 h-4 mr-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`} />
                <span className={isDark ? 'text-slate-300' : 'text-slate-700'}>Tableau de bord</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className='text-red-600 focus:text-red-600 cursor-pointer'>
                <LogOut className='w-4 h-4 mr-2' />
                Se déconnecter
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className='flex flex-1 overflow-hidden'>
        {/* SIDEBAR */}
        <aside className={`shrink-0 flex flex-col border-r transition-all duration-200 z-10 ${sidebarCollapsed ? 'w-[68px]' : 'w-[260px]'} ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
          <div className='flex-1 overflow-y-auto overflow-x-hidden py-3 px-3'>
            <div className='space-y-0.5'>
              {itemsWithBadges.map(item => (
                <SidebarItem
                  key={item.id}
                  item={item}
                  collapsed={sidebarCollapsed}
                  isActive={boCurrentScreen === item.id}
                  hasAccess={hasModuleAccess(boUserRole, item.id.replace('bo-', '') as any)}
                  onClick={() => boNavigate(item.id)}
                  isDark={isDark}
                />
              ))}
            </div>
          </div>
          <div className={`p-3 border-t ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
            <button
              onClick={toggleSidebar}
              className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${isDark ? 'text-slate-500 hover:text-slate-300 hover:bg-slate-700' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
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
      <footer className={`h-7 flex items-center justify-between px-4 text-[11px] border-t shrink-0 transition-colors duration-200 ${isDark ? 'bg-slate-800 border-slate-700 text-slate-500' : 'bg-white border-slate-200 text-slate-400'}`}>
        <div className='flex items-center gap-4'>
          <span className='flex items-center gap-1.5'>
            <span className='w-1.5 h-1.5 rounded-full bg-emerald-500' />
            Système OK
          </span>
          <span>{ticker.activeUsers.toLocaleString()} actifs</span>
          <span>{ticker.transactionsPerMin} tr/min</span>
        </div>
        <div className='flex items-center gap-4'>
          {SYSTEM_SERVICES.map(svc => (
            <span key={svc.name} className='flex items-center gap-1'>
              <span className={`w-1.5 h-1.5 rounded-full ${svc.status === 'ok' ? 'bg-emerald-500' : svc.status === 'slow' ? 'bg-amber-500' : 'bg-red-500'}`} />
              <span className='hidden sm:inline'>{svc.name}</span>
              <span className={`hidden sm:inline ${svc.status === 'ok' ? 'text-emerald-500' : svc.status === 'slow' ? 'text-amber-500' : 'text-red-500'}`}>
                {svc.status === 'ok' ? 'OK' : svc.status === 'slow' ? 'Lent' : 'ERR'}
              </span>
            </span>
          ))}
          <span className='font-medium'>v5.0</span>
        </div>
      </footer>
    </div>
  )
}

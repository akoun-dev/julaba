'use client'

import {
  LayoutDashboard,
  Users,
  FileCheck,
  Map,
  MapPinned,
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
  Wheat,
  Smartphone,
  CloudOff,
  PiggyBank,
  Megaphone,
  GraduationCap,
  IdCard,
  ShoppingBag,
} from 'lucide-react'

/**
 * Rend une icône lucide à partir de son nom (stocké en string dans
 * SIDEBAR_GROUPS / SIDEBAR_ITEMS, sérialisable en localStorage).
 */
export const BO_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard, Users, FileCheck, Map, MapPinned, Target, Eye, UserCog, BarChart3,
  Shield, Building2, AlertTriangle, ArrowLeftRight, BookOpen, Bot, Radio,
  TrendingUp, CreditCard, Key, ShoppingCart, Truck, MessageSquare, Clock, Settings, Wallet, Wheat,
  Smartphone, CloudOff, PiggyBank, Megaphone, GraduationCap, IdCard, ShoppingBag,
}

export function IconProxy({ name, className }: { name: string; className?: string }) {
  const Icon = BO_ICON_MAP[name]
  if (!Icon) return null
  return <Icon className={className} />
}

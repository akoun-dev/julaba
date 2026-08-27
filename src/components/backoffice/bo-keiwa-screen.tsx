'use client'

import { useState, useMemo } from 'react'
import {
  Wallet,
  ArrowUpDown,
  ArrowUpCircle,
  ArrowDownCircle,
  ArrowLeftRight,
  Search,
  Users,
  TrendingUp,
  CircleDollarSign,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { BO_COLOR, BO_COLOR_BG } from '@/lib/stores/backoffice-store'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

// ============== TYPES ==============

type TxType = 'depot' | 'retrait' | 'transfert'
type TxStatus = 'termine' | 'en_cours' | 'echoue' | 'annule'

interface Transaction {
  id: string
  type: TxType
  montant: number
  expediteur: string
  destinataire: string
  date: string
  status: TxStatus
}

interface Account {
  holder: string
  solde: number
  lastTx: string
  type: 'marchand' | 'producteur' | 'cooperatif'
  zone: string
}

// ============== MOCK DATA ==============

const VOLUME_DATA = [
  { day: 'Lun 21', volume: 7200000 },
  { day: 'Mar 22', volume: 8500000 },
  { day: 'Mer 23', volume: 6100000 },
  { day: 'Jeu 24', volume: 9200000 },
  { day: 'Ven 25', volume: 10400000 },
  { day: 'Sam 26', volume: 7800000 },
  { day: 'Dim 27', volume: 8900000 },
]

const TRANSACTIONS: Transaction[] = [
  { id: 'TXN-20260827-001', type: 'depot', montant: 500000, expediteur: '—', destinataire: 'KOUASSI Awa', date: '2026-08-27T14:25:00Z', status: 'termine' },
  { id: 'TXN-20260827-002', type: 'transfert', montant: 150000, expediteur: 'DIABY Ibrahim', destinataire: 'TRAORÉ Moussa', date: '2026-08-27T14:20:00Z', status: 'termine' },
  { id: 'TXN-20260827-003', type: 'retrait', montant: 75000, expediteur: 'BAMBA Fatou', destinataire: '—', date: '2026-08-27T14:15:00Z', status: 'en_cours' },
  { id: 'TXN-20260827-004', type: 'depot', montant: 200000, expediteur: '—', destinataire: 'SORO Marie', date: '2026-08-27T14:10:00Z', status: 'termine' },
  { id: 'TXN-20260827-005', type: 'transfert', montant: 350000, expediteur: 'KONÉ Aminata', destinataire: 'OUATTARA Yao', date: '2026-08-27T13:55:00Z', status: 'termine' },
  { id: 'TXN-20260827-006', type: 'retrait', montant: 120000, expediteur: 'COULIBALY Affi', destinataire: '—', date: '2026-08-27T13:40:00Z', status: 'echoue' },
  { id: 'TXN-20260827-007', type: 'depot', montant: 1000000, expediteur: '—', destinataire: 'Coopérative Akwaba', date: '2026-08-27T13:30:00Z', status: 'termine' },
  { id: 'TXN-20260827-008', type: 'transfert', montant: 80000, expediteur: 'DIALLO Mariam', destinataire: 'CAMARA Moussa', date: '2026-08-27T13:15:00Z', status: 'annule' },
  { id: 'TXN-20260827-009', type: 'retrait', montant: 250000, expediteur: 'BAKAYOKO Awa', destinataire: '—', date: '2026-08-27T13:00:00Z', status: 'termine' },
  { id: 'TXN-20260827-010', type: 'depot', montant: 450000, expediteur: '—', destinataire: 'KONAN Yao', date: '2026-08-27T12:45:00Z', status: 'en_cours' },
  { id: 'TXN-20260827-011', type: 'transfert', montant: 180000, expediteur: 'TRAORÉ Fatoumata', destinataire: 'KOUADIO Paul', date: '2026-08-27T12:30:00Z', status: 'termine' },
  { id: 'TXN-20260827-012', type: 'depot', montant: 320000, expediteur: '—', destinataire: 'OUATTARA Aminata', date: '2026-08-27T12:15:00Z', status: 'termine' },
]

const ACCOUNTS: Account[] = [
  { holder: 'KOUASSI Awa', solde: 2450000, lastTx: '2026-08-27T14:25:00Z', type: 'marchand', zone: 'Adjamé' },
  { holder: 'DIABY Ibrahim', solde: 1870000, lastTx: '2026-08-27T14:20:00Z', type: 'producteur', zone: 'Bouaké' },
  { holder: 'BAMBA Fatou', solde: 980000, lastTx: '2026-08-27T14:15:00Z', type: 'marchand', zone: 'Cocody' },
  { holder: 'SORO Marie', solde: 3200000, lastTx: '2026-08-27T14:10:00Z', type: 'cooperatif', zone: 'Kong' },
  { holder: 'KONÉ Aminata', solde: 1560000, lastTx: '2026-08-27T13:55:00Z', type: 'marchand', zone: 'Yopougon' },
  { holder: 'COULIBALY Affi', solde: 420000, lastTx: '2026-08-27T13:40:00Z', type: 'producteur', zone: 'Daloa' },
  { holder: 'Coopérative Akwaba', solde: 8500000, lastTx: '2026-08-27T13:30:00Z', type: 'cooperatif', zone: 'Plateau' },
  { holder: 'OUATTARA Yao', solde: 710000, lastTx: '2026-08-27T13:15:00Z', type: 'marchand', zone: 'Abobo' },
  { holder: 'DIALLO Mariam', solde: 540000, lastTx: '2026-08-27T13:00:00Z', type: 'producteur', zone: 'Korhogo' },
  { holder: 'BAKAYOKO Awa', solde: 1200000, lastTx: '2026-08-27T12:45:00Z', type: 'marchand', zone: 'San-Pédro' },
]

const TX_TYPE_CONFIG: Record<TxType, { label: string; icon: React.ReactNode; color: string }> = {
  depot: { label: 'Dépôt', icon: <ArrowUpCircle className="h-3.5 w-3.5" />, color: 'bg-emerald-100 text-emerald-700' },
  retrait: { label: 'Retrait', icon: <ArrowDownCircle className="h-3.5 w-3.5" />, color: 'bg-red-100 text-red-700' },
  transfert: { label: 'Transfert', icon: <ArrowLeftRight className="h-3.5 w-3.5" />, color: 'bg-sky-100 text-sky-700' },
}

const TX_STATUS_CONFIG: Record<TxStatus, { label: string; color: string }> = {
  termine: { label: 'Terminé', color: 'bg-emerald-100 text-emerald-700' },
  en_cours: { label: 'En cours', color: 'bg-amber-100 text-amber-700' },
  echoue: { label: 'Échoué', color: 'bg-red-100 text-red-700' },
  annule: { label: 'Annulé', color: 'bg-gray-200 text-gray-600' },
}

const ACCOUNT_TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  marchand: { label: 'Marchand', color: 'bg-violet-100 text-violet-700' },
  producteur: { label: 'Producteur', color: 'bg-emerald-100 text-emerald-700' },
  cooperatif: { label: 'Coopérative', color: 'bg-amber-100 text-amber-700' },
}

const formatMoney = (n: number) => n.toLocaleString('fr-FR') + ' FCFA'
const formatTime = (d: string) => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

// ============== SUB COMPONENTS ==============

function KeiwaTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white rounded-lg shadow-lg border p-3 text-xs">
      <p className="font-medium" style={{ color: BO_COLOR }}>{label}</p>
      <p className="text-emerald-600 font-semibold mt-1">{formatMoney(payload[0].value)}</p>
    </div>
  )
}

// ============== MAIN COMPONENT ==============

export function BoKeiwaScreen() {
  const [searchQuery, setSearchQuery] = useState('')
  const [txTypeFilter, setTxTypeFilter] = useState<string>('tous')
  const [accountTypeFilter, setAccountTypeFilter] = useState<string>('tous')

  const filteredTransactions = useMemo(() => {
    return TRANSACTIONS.filter(t => {
      const matchSearch = !searchQuery ||
        t.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.expediteur.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.destinataire.toLowerCase().includes(searchQuery.toLowerCase())
      const matchType = txTypeFilter === 'tous' || t.type === txTypeFilter
      return matchSearch && matchType
    })
  }, [searchQuery, txTypeFilter])

  const filteredAccounts = useMemo(() => {
    return ACCOUNTS.filter(a => {
      const matchSearch = !searchQuery ||
        a.holder.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.zone.toLowerCase().includes(searchQuery.toLowerCase())
      const matchType = accountTypeFilter === 'tous' || a.type === accountTypeFilter
      return matchSearch && matchType
    })
  }, [searchQuery, accountTypeFilter])

  return (
    <div className="p-6 space-y-6" style={{ backgroundColor: BO_COLOR_BG, minHeight: '100vh' }}>
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: BO_COLOR }}>
          <span className="inline-flex items-center gap-2"><Wallet className="h-6 w-6" />KEIWA</span>
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Portefeuille de la plateforme et suivi des transactions
        </p>
      </div>

      <Separator />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center">
              <Wallet className="h-5 w-5 text-emerald-600" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Solde total</p>
              <p className="text-lg font-bold text-emerald-600 truncate">45 200 000 FCFA</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-sky-100 flex items-center justify-center">
              <ArrowUpDown className="h-5 w-5 text-sky-600" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Transactions aujourd&apos;hui</p>
              <p className="text-lg font-bold text-sky-600">1 245</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-amber-600" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Volume journalier</p>
              <p className="text-lg font-bold text-amber-700 truncate">8 900 000 FCFA</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-violet-100 flex items-center justify-center">
              <Users className="h-5 w-5 text-violet-600" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Comptes actifs</p>
              <p className="text-lg font-bold text-violet-600">3 450</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="apercu">
        <TabsList>
          <TabsTrigger value="apercu" className="gap-1.5"><TrendingUp className="h-3.5 w-3.5" /> Aperçu</TabsTrigger>
          <TabsTrigger value="transactions" className="gap-1.5"><ArrowUpDown className="h-3.5 w-3.5" /> Transactions</TabsTrigger>
          <TabsTrigger value="comptes" className="gap-1.5"><CircleDollarSign className="h-3.5 w-3.5" /> Comptes</TabsTrigger>
        </TabsList>

        {/* Aperçu Tab */}
        <TabsContent value="apercu">
          <Card className="border-0 shadow-sm mt-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold" style={{ color: BO_COLOR }}>
                Volume de transactions (7 derniers jours)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={VOLUME_DATA} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis
                      dataKey="day"
                      tick={{ fontSize: 12, fill: '#6B7280' }}
                      axisLine={{ stroke: '#E5E7EB' }}
                      tickLine={false}
                    />
                    <YAxis
                      tickFormatter={(v) => `${(v / 1000000).toFixed(1)}M`}
                      tick={{ fontSize: 12, fill: '#6B7280' }}
                      axisLine={{ stroke: '#E5E7EB' }}
                      tickLine={false}
                    />
                    <Tooltip content={<KeiwaTooltip />} />
                    <Line
                      type="monotone"
                      dataKey="volume"
                      stroke="#10B981"
                      strokeWidth={2.5}
                      dot={{ fill: '#10B981', r: 4, strokeWidth: 2, stroke: '#fff' }}
                      activeDot={{ r: 6, stroke: '#10B981', strokeWidth: 2, fill: '#fff' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Transactions Tab */}
        <TabsContent value="transactions">
          <Card className="border-0 shadow-sm mt-4">
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                <CardTitle className="text-sm font-semibold" style={{ color: BO_COLOR }}>
                  Liste des transactions
                </CardTitle>
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative sm:max-w-xs">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Rechercher..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Select value={txTypeFilter} onValueChange={setTxTypeFilter}>
                    <SelectTrigger className="w-full sm:w-40">
                      <SelectValue placeholder="Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tous">Tous types</SelectItem>
                      <SelectItem value="depot">Dépôt</SelectItem>
                      <SelectItem value="retrait">Retrait</SelectItem>
                      <SelectItem value="transfert">Transfert</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[480px] overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#D1D5DB transparent' }}>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">ID</TableHead>
                      <TableHead className="text-xs">Type</TableHead>
                      <TableHead className="text-xs text-right">Montant</TableHead>
                      <TableHead className="text-xs">Expéditeur</TableHead>
                      <TableHead className="text-xs">Destinataire</TableHead>
                      <TableHead className="text-xs">Date</TableHead>
                      <TableHead className="text-xs">Statut</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTransactions.map((tx) => {
                      const tc = TX_TYPE_CONFIG[tx.type]
                      const sc = TX_STATUS_CONFIG[tx.status]
                      return (
                        <TableRow key={tx.id}>
                          <TableCell className="text-xs py-2.5 font-mono text-gray-500 whitespace-nowrap">{tx.id}</TableCell>
                          <TableCell className="py-2.5">
                            <Badge variant="secondary" className={`text-[10px] px-2 py-0 ${tc.color}`}>
                              {tc.icon}<span className="ml-1">{tc.label}</span>
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs py-2.5 text-right font-semibold whitespace-nowrap" style={{ color: BO_COLOR }}>
                            {formatMoney(tx.montant)}
                          </TableCell>
                          <TableCell className="text-xs py-2.5 text-gray-600 max-w-[120px] truncate">{tx.expediteur}</TableCell>
                          <TableCell className="text-xs py-2.5 text-gray-600 max-w-[120px] truncate">{tx.destinataire}</TableCell>
                          <TableCell className="text-xs py-2.5 text-gray-500 whitespace-nowrap">{formatTime(tx.date)}</TableCell>
                          <TableCell className="py-2.5">
                            <Badge variant="secondary" className={`text-[10px] px-2 py-0 ${sc.color}`}>{sc.label}</Badge>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
                {filteredTransactions.length === 0 && (
                  <div className="text-center py-12 text-gray-400">
                    <Wallet className="h-10 w-10 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Aucune transaction trouvée</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Comptes Tab */}
        <TabsContent value="comptes">
          <Card className="border-0 shadow-sm mt-4">
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                <CardTitle className="text-sm font-semibold" style={{ color: BO_COLOR }}>
                  Liste des comptes
                </CardTitle>
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative sm:max-w-xs">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Rechercher..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Select value={accountTypeFilter} onValueChange={setAccountTypeFilter}>
                    <SelectTrigger className="w-full sm:w-40">
                      <SelectValue placeholder="Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tous">Tous types</SelectItem>
                      <SelectItem value="marchand">Marchand</SelectItem>
                      <SelectItem value="producteur">Producteur</SelectItem>
                      <SelectItem value="cooperatif">Coopérative</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[480px] overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#D1D5DB transparent' }}>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Titulaire</TableHead>
                      <TableHead className="text-xs">Type</TableHead>
                      <TableHead className="text-xs">Zone</TableHead>
                      <TableHead className="text-xs text-right">Solde</TableHead>
                      <TableHead className="text-xs">Dernière transaction</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAccounts.map((acc, i) => {
                      const atc = ACCOUNT_TYPE_CONFIG[acc.type]
                      return (
                        <TableRow key={i}>
                          <TableCell className="text-xs py-2.5">
                            <p className="font-semibold" style={{ color: BO_COLOR }}>{acc.holder}</p>
                          </TableCell>
                          <TableCell className="py-2.5">
                            <Badge variant="secondary" className={`text-[10px] px-2 py-0 ${atc.color}`}>{atc.label}</Badge>
                          </TableCell>
                          <TableCell className="text-xs py-2.5 text-gray-500">{acc.zone}</TableCell>
                          <TableCell className="text-xs py-2.5 text-right font-semibold text-emerald-600 whitespace-nowrap">
                            {formatMoney(acc.solde)}
                          </TableCell>
                          <TableCell className="text-xs py-2.5 text-gray-500 whitespace-nowrap">{formatTime(acc.lastTx)}</TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
                {filteredAccounts.length === 0 && (
                  <div className="text-center py-12 text-gray-400">
                    <Wallet className="h-10 w-10 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Aucun compte trouvé</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
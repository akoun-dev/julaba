'use client'

import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Package, RefreshCw, Check, X, Truck } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useAppStore } from '@/lib/stores/app-store'
import { formatFCFA } from '@/lib/utils'
import { tataSpeak, haptic, playBeep } from '@/lib/voice/tata-tts'
import { useNetworkStatus } from '@/lib/hooks/use-network-status'
import { AppError, AppEmpty } from '@/components/shared/app-states'

type SellerOrder = {
  id:string; order_number:string; total_cfa:number; status:string; payment_status:string
  delivery_status:string; buyerName:string; buyerPhone:string|null; buyer_note:string|null
  multiSeller:boolean; created_at:string; items:Array<{id:string;product_name:string;quantity:number;subtotal_cfa:number}>
}
const labels:Record<string,string>={pending:'En attente',confirmed:'Confirmée',preparing:'Préparation',ready:'Prête',shipped:'Expédiée',delivered:'Livrée',cancelled:'Annulée',rejected:'Refusée'}

export function ProdMarketplaceCommandesScreen(){
 const merchantId=useAppStore(s=>s.merchantId); const goBack=useAppStore(s=>s.goBack); const soleilMode=useAppStore(s=>s.soleilMode); const online=useNetworkStatus()
 const [orders,setOrders]=useState<SellerOrder[]>([]); const [loading,setLoading]=useState(true); const [error,setError]=useState<string|null>(null); const [busy,setBusy]=useState<string|null>(null)
 const load=useCallback(async()=>{if(!merchantId)return;setLoading(true);setError(null);try{const res=await fetch('/api/marketplace/seller-orders?merchantId='+encodeURIComponent(merchantId),{cache:'no-store'});const d=await res.json();if(!res.ok)throw new Error(d?.erreur||'Erreur');setOrders(d.orders||[])}catch(e){setError(e instanceof Error?e.message:'Impossible de charger les commandes')}finally{setLoading(false)}},[merchantId])
 useEffect(()=>{void load()},[load])
 const update=async(id:string,status:string)=>{if(!merchantId||busy)return;setBusy(id);try{const res=await fetch('/api/marketplace/seller-orders',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({merchantId,orderId:id,status})});const d=await res.json();if(!res.ok)throw new Error(d?.erreur||'Mise à jour impossible');playBeep('success');haptic('success');tataSpeak(status==='confirmed'?'Commande acceptée.':status==='preparing'?'Préparation de la commande.':status==='ready'?'Commande prête.':'Commande mise à jour.');await load()}catch(e){setError(e instanceof Error?e.message:'Mise à jour impossible')}finally{setBusy(null)}}
 const text=soleilMode?'text-black':''
 return <div className='screen-enter pb-[calc(6rem+env(safe-area-inset-bottom))]'>
  <header className='sticky top-0 z-40 bg-background border-b px-4 py-3 flex items-center gap-2'><Button variant='ghost' size='icon' className='h-11 w-11' onClick={goBack}><ArrowLeft className='w-5 h-5'/></Button><div className='flex-1'><h1 className={'font-bold text-lg '+text}>Ventes marketplace</h1><p className='text-xs text-muted-foreground'>Commandes reçues de vos acheteurs</p></div><Button variant='ghost' size='icon' onClick={()=>void load()}><RefreshCw className='w-4 h-4'/></Button></header>
  {!online&&<div className='mx-4 mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800'>Hors connexion : consultation disponible, actions désactivées.</div>}
  <div className='px-4 mt-4 space-y-3'>{loading&&[1,2,3].map(i=><Card key={i}><CardContent className='p-4'><div className='h-5 w-2/3 bg-muted animate-pulse rounded'/><div className='h-4 w-1/2 bg-muted animate-pulse rounded mt-2'/></CardContent></Card>)}{!loading&&error&&/* MODE-1008 : AppError (miroir BoErrorBanner), handler load inchangé. */<AppError message={error} onRetry={()=>void load()} soleilMode={soleilMode} />}{!loading&&!error&&!orders.length&&<Card className='border-dashed'><CardContent className='p-0'><AppEmpty icon={Package} title="Aucune commande marketplace reçue." soleilMode={soleilMode} className='p-10' /></CardContent></Card>}{orders.map(o=><Card key={o.id}><CardContent className='p-4'><div className='flex items-start gap-3'><div className='w-10 h-10 rounded-lg bg-[#FDF3ED] flex items-center justify-center'><Package className='w-5 h-5 text-[#C66A2C]'/></div><div className='flex-1 min-w-0'><p className='font-semibold text-sm'>{o.order_number}</p><p className='text-xs text-muted-foreground'>{o.buyerName} · {new Date(o.created_at).toLocaleDateString('fr-FR')}</p></div><Badge>{labels[o.status]||o.status}</Badge></div><div className='mt-3 space-y-1'>{o.items.map(i=><div key={i.id} className='flex justify-between text-sm'><span>{i.quantity} × {i.product_name}</span><span className='font-semibold'>{formatFCFA(Number(i.subtotal_cfa))}</span></div>)}</div>{o.buyer_note&&<p className='mt-3 text-xs rounded-lg bg-muted p-2'>Note acheteur : {o.buyer_note}</p>}{o.multiSeller&&<p className='mt-3 text-xs text-amber-700'>Commande multi-vendeurs : traitement séparé à venir.</p>}{!o.multiSeller&&online&&o.status==='pending'&&<div className='flex gap-2 mt-3'><Button className='flex-1 min-h-11 bg-[#2E8B57] text-white' disabled={busy===o.id} onClick={()=>void update(o.id,'confirmed')}><Check className='w-4 h-4 mr-1'/>Accepter</Button><Button variant='outline' className='flex-1 min-h-11 text-red-600' disabled={busy===o.id} onClick={()=>void update(o.id,'rejected')}><X className='w-4 h-4 mr-1'/>Refuser</Button></div>}{!o.multiSeller&&online&&o.status==='confirmed'&&<Button className='w-full min-h-11 mt-3' disabled={busy===o.id} onClick={()=>void update(o.id,'preparing')}>Préparer la commande</Button>}{!o.multiSeller&&online&&o.status==='preparing'&&<Button className='w-full min-h-11 mt-3' disabled={busy===o.id} onClick={()=>void update(o.id,'ready')}><Check className='w-4 h-4 mr-1'/>Marquer prête</Button>}{!o.multiSeller&&online&&o.status==='ready'&&<Button className='w-full min-h-11 mt-3' disabled={busy===o.id} onClick={()=>void update(o.id,'shipped')}><Truck className='w-4 h-4 mr-1'/>Remettre au transporteur</Button>}</CardContent></Card>)}</div>
 </div>
}

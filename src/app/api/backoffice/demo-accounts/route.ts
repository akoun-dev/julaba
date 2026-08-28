import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const accounts = await db.boUser.findMany({
      where: { isActive: true },
      select: { email: true, name: true, role: true, zone: true },
      orderBy: { role: 'asc' },
    })

    return NextResponse.json(accounts)
  } catch (error) {
    console.error('Erreur chargement comptes demo:', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement des comptes' }, { status: 500 })
  }
}
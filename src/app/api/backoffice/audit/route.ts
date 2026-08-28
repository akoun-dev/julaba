import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const page = Math.max(1, Number(searchParams.get('page')) || 1)
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit')) || 20))
    const module_ = searchParams.get('module')
    const action = searchParams.get('action')
    const user = searchParams.get('user')

    const where: Prisma.AuditLogWhereInput = {}
    if (module_) where.module = module_
    if (action) where.action = action
    if (user) {
      where.OR = [
        { userName: { contains: user } },
        { userEmail: { contains: user } },
      ]
    }

    const [logs, total] = await Promise.all([
      db.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.auditLog.count({ where }),
    ])

    return NextResponse.json({ logs, total, page, limit, totalPages: Math.ceil(total / limit) })
  } catch (error) {
    console.error('Erreur listage audit:', error)
    return NextResponse.json({ erreur: 'Erreur lors du chargement du journal d\'audit' }, { status: 500 })
  }
}

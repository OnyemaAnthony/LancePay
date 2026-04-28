import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { parseUtcDateRange } from '../../_lib/date-range'

export async function GET(request: NextRequest) {
  try {
    const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!authToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const claims = await verifyAuthToken(authToken)
    if (!claims) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { privyId: claims.userId },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const url = new URL(request.url)
    const parsedRange = parseUtcDateRange(url.searchParams)
    if (!parsedRange.ok) {
      return NextResponse.json(parsedRange.error, { status: 400 })
    }

    const { from, to, toExclusive, days } = parsedRange.value
    const where = {
      userId: user.id,
      type: 'payment',
      status: 'completed',
      createdAt: {
        gte: from,
        lt: toExclusive,
      },
    }

    const total = await prisma.transaction.aggregate({
      where,
      _sum: { amount: true },
    })

    return NextResponse.json({
      earnings: {
        totalEarned: Number(total._sum.amount ?? 0),
        currency: 'USDC',
        from: from.toISOString().slice(0, 10),
        to: to.toISOString().slice(0, 10),
        days,
      },
    })
  } catch (error) {
    logger.error({ err: error }, 'Routes B analytics earnings GET error')
    return NextResponse.json({ error: 'Failed to get earnings' }, { status: 500 })
  }
}

import { withRequestId } from '../_lib/with-request-id'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireScope, RoutesBForbiddenError } from '../_lib/authz'
import { registerRoute } from '../_lib/openapi'
import { getCacheValue, setCacheValue } from '../_lib/cache'
import { errorResponse } from '../_lib/errors'
import { z } from 'zod'
import { getUtcPeriodBoundaries, calculateDelta, PeriodType } from '../_lib/period'

const MetricDeltaSchema = z.object({
  current: z.number(),
  previous: z.number(),
  deltaPct: z.number(),
})

const InvoicesDeltaSchema = z.object({
  total: MetricDeltaSchema,
  pending: MetricDeltaSchema,
  paid: MetricDeltaSchema,
  cancelled: MetricDeltaSchema,
  overdue: MetricDeltaSchema,
})

// Register OpenAPI documentation
registerRoute({
  method: 'GET',
  path: '/stats',
  summary: 'Get user statistics',
  description:
    'Returns invoice statistics, total earnings, and pending withdrawals for the authenticated user.',
  responseSchema: z.union([
    z.object({
      invoices: z.object({
        total: z.number(),
        pending: z.number(),
        paid: z.number(),
        cancelled: z.number(),
        overdue: z.number(),
      }),
      totalEarned: z.number(),
      pendingWithdrawals: z.number(),
    }),
    z.object({
      period: z.enum(['day', 'week', 'month', 'year']),
      invoices: InvoicesDeltaSchema,
      totalEarned: MetricDeltaSchema,
      pendingWithdrawals: MetricDeltaSchema,
      _note: z.string().optional(),
    }),
  ]),
  tags: ['stats'],
})

async function GETHandler(request: NextRequest) {
  try {
    const auth = await requireScope(request, 'routes-b:read')
    const periodParam = request.nextUrl.searchParams.get('period')
    const usePeriod = periodParam !== null
    const period = (periodParam || 'month') as PeriodType
    
    const cacheKey = `routes-b:stats:${auth.userId}:${periodParam ?? 'all-time'}`
    const cached = getCacheValue<any>(cacheKey)
    if (cached) {
      return NextResponse.json(cached, { headers: { 'X-Cache': 'HIT' } })
    }

    const user = await prisma.user.findUnique({ where: { id: auth.userId } })
    if (!user) {
      return errorResponse(
        'NOT_FOUND',
        'User not found',
        undefined,
        404,
        request.headers.get('x-request-id'),
      )
    }

    let payload: any

    if (!usePeriod) {
      const [invoiceStats, totalEarned, pendingWithdrawals] = await Promise.all([
        prisma.invoice.groupBy({
          by: ['status'],
          where: { userId: user.id },
          _count: { id: true },
        }),
        prisma.transaction.aggregate({
          where: { userId: user.id, type: 'payment', status: 'completed' },
          _sum: { amount: true },
        }),
        prisma.transaction.count({
          where: { userId: user.id, type: 'withdrawal', status: 'pending' },
        }),
      ])

      const counts = Object.fromEntries(invoiceStats.map((s) => [s.status, s._count.id]))

      payload = {
        invoices: {
          total: invoiceStats.reduce((sum, s) => sum + s._count.id, 0),
          pending: counts.pending ?? 0,
          paid: counts.paid ?? 0,
          cancelled: counts.cancelled ?? 0,
          overdue: counts.overdue ?? 0,
        },
        totalEarned: Number(totalEarned._sum.amount ?? 0),
        pendingWithdrawals,
      }
    } else {
      const boundaries = getUtcPeriodBoundaries(period)

      const fetchStats = async (start: Date, end: Date) => {
        const where = { userId: user.id, createdAt: { gte: start, lt: end } }
        const [invoiceStats, totalEarned, pendingWithdrawals] = await Promise.all([
          prisma.invoice.groupBy({
            by: ['status'],
            where,
            _count: { id: true },
          }),
          prisma.transaction.aggregate({
            where: { ...where, type: 'payment', status: 'completed' },
            _sum: { amount: true },
          }),
          prisma.transaction.count({
            where: { ...where, type: 'withdrawal', status: 'pending' },
          }),
        ])

        const counts = Object.fromEntries(invoiceStats.map((s) => [s.status, s._count.id]))
        return {
          totalInvoices: invoiceStats.reduce((sum, s) => sum + s._count.id, 0),
          pendingInvoices: counts.pending ?? 0,
          paidInvoices: counts.paid ?? 0,
          cancelledInvoices: counts.cancelled ?? 0,
          overdueInvoices: counts.overdue ?? 0,
          totalEarned: Number(totalEarned._sum.amount ?? 0),
          pendingWithdrawals,
        }
      }

      const [current, previous] = await Promise.all([
        fetchStats(boundaries.current.start, boundaries.current.end),
        fetchStats(boundaries.previous.start, boundaries.previous.end),
      ])

      const buildMetric = (curr: number, prev: number) => ({
        current: curr,
        previous: prev,
        deltaPct: calculateDelta(curr, prev),
      })

      payload = {
        period,
        invoices: {
          total: buildMetric(current.totalInvoices, previous.totalInvoices),
          pending: buildMetric(current.pendingInvoices, previous.pendingInvoices),
          paid: buildMetric(current.paidInvoices, previous.paidInvoices),
          cancelled: buildMetric(current.cancelledInvoices, previous.cancelledInvoices),
          overdue: buildMetric(current.overdueInvoices, previous.overdueInvoices),
        },
        totalEarned: buildMetric(current.totalEarned, previous.totalEarned),
        pendingWithdrawals: buildMetric(current.pendingWithdrawals, previous.pendingWithdrawals),
      }
    }

    setCacheValue(cacheKey, payload, 60_000)
    return NextResponse.json(payload, { headers: { 'X-Cache': 'MISS' } })
  } catch (error) {
    if (error instanceof RoutesBForbiddenError) {
      return errorResponse(
        'FORBIDDEN',
        'Forbidden',
        { scope: error.code },
        403,
        request.headers.get('x-request-id'),
      )
    }
    return errorResponse(
      'UNAUTHORIZED',
      'Unauthorized',
      undefined,
      401,
      request.headers.get('x-request-id'),
    )
  }
}

export const GET = withRequestId(GETHandler)

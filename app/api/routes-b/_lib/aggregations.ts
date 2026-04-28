import { prisma } from '@/lib/db'

export const KNOWN_INVOICE_STATUSES = ['pending', 'paid', 'cancelled', 'overdue'] as const

export type InvoiceStatusSummary = {
  status: string
  count: number
  total: number
}

export async function getInvoiceStatusSummary(userId: string): Promise<InvoiceStatusSummary[]> {
  const grouped = await prisma.invoice.groupBy({
    by: ['status'],
    where: { userId },
    _count: { id: true },
    _sum: { amount: true },
  })

  const byStatus = new Map(
    grouped.map((row) => [row.status, { count: row._count.id, total: Number(row._sum.amount ?? 0) }]),
  )

  return KNOWN_INVOICE_STATUSES.map((status) => {
    const row = byStatus.get(status)
    return {
      status,
      count: row?.count ?? 0,
      total: row?.total ?? 0,
    }
  })
}

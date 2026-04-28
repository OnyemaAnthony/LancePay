const DEFAULT_RANGE_DAYS = 30
const MAX_RANGE_DAYS = 366
const DAY_IN_MS = 24 * 60 * 60 * 1000

export type ParsedDateRange =
  | {
      ok: true
      value: {
        from: Date
        to: Date
        toExclusive: Date
        days: number
      }
    }
  | {
      ok: false
      error: {
        error: string
        fields: Record<string, string>
      }
    }

function utcMidnight(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_IN_MS)
}

function parseDateParam(value: string, field: 'from' | 'to') {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return {
      ok: false as const,
      message: `${field} must use YYYY-MM-DD format`,
    }
  }

  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime())) {
    return {
      ok: false as const,
      message: `${field} must be a valid date`,
    }
  }

  return {
    ok: true as const,
    value: utcMidnight(parsed),
  }
}

export function parseUtcDateRange(searchParams: URLSearchParams, now = new Date()): ParsedDateRange {
  const rawFrom = searchParams.get('from')
  const rawTo = searchParams.get('to')
  const fields: Record<string, string> = {}

  let from = utcMidnight(now)
  let to = utcMidnight(now)

  if (rawFrom) {
    const parsedFrom = parseDateParam(rawFrom, 'from')
    if (!parsedFrom.ok) {
      fields.from = parsedFrom.message
    } else {
      from = parsedFrom.value
    }
  }

  if (rawTo) {
    const parsedTo = parseDateParam(rawTo, 'to')
    if (!parsedTo.ok) {
      fields.to = parsedTo.message
    } else {
      to = parsedTo.value
    }
  }

  if (Object.keys(fields).length > 0) {
    return {
      ok: false,
      error: {
        error: 'Invalid date range',
        fields,
      },
    }
  }

  if (!rawFrom && !rawTo) {
    to = utcMidnight(now)
    from = addDays(to, -(DEFAULT_RANGE_DAYS - 1))
  } else if (!rawFrom) {
    from = addDays(to, -(DEFAULT_RANGE_DAYS - 1))
  } else if (!rawTo) {
    to = addDays(from, DEFAULT_RANGE_DAYS - 1)
  }

  if (from.getTime() > to.getTime()) {
    return {
      ok: false,
      error: {
        error: 'Invalid date range',
        fields: {
          from: 'from must be on or before to',
          to: 'to must be on or after from',
        },
      },
    }
  }

  const days = Math.floor((to.getTime() - from.getTime()) / DAY_IN_MS) + 1
  if (days > MAX_RANGE_DAYS) {
    return {
      ok: false,
      error: {
        error: 'Invalid date range',
        fields: {
          from: `date range cannot exceed ${MAX_RANGE_DAYS} days`,
          to: `date range cannot exceed ${MAX_RANGE_DAYS} days`,
        },
      },
    }
  }

  return {
    ok: true,
    value: {
      from,
      to,
      toExclusive: addDays(to, 1),
      days,
    },
  }
}

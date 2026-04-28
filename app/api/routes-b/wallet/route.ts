import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { classifyWalletError } from '../_lib/wallet-errors'

async function fetchWalletBalance(address: string): Promise<number | null> {
  const statusUrl = process.env.CHAIN_RPC_WALLET_BALANCE_URL
  if (!statusUrl) {
    return null
  }

  const response = await fetch(statusUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ address }),
    cache: 'no-store',
  })

  if (!response.ok) {
    const error = new Error(`Upstream wallet balance failed with status ${response.status}`) as Error & { status?: number }
    error.status = response.status
    throw error
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new Error('Invalid response schema from wallet balance upstream')
  }

  const balance = (payload as { balance?: unknown }).balance
  if (balance === undefined || balance === null) {
    throw new Error('Schema mismatch: missing balance')
  }

  const parsed = Number(balance)
  if (!Number.isFinite(parsed)) {
    throw new Error('Schema mismatch: invalid balance format')
  }

  return parsed
}

export async function GET(request: NextRequest) {
  const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
  const claims = await verifyAuthToken(authToken || '')

  if (!claims) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({ where: { privyId: claims.userId } })
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } })
  if (!wallet) {
    return NextResponse.json({ wallet: null }, { status: 200 })
  }

  const startedAt = Date.now()
  const attempt = 1
  try {
    const balance = await fetchWalletBalance(wallet.address)
    return NextResponse.json({
      wallet: {
        id: wallet.id,
        stellarAddress: wallet.address,
        balance,
        createdAt: wallet.createdAt,
      },
    })
  } catch (error) {
    const failure = classifyWalletError(error)
    logger.error(
      {
        userId: user.id,
        attempt,
        durationMs: Date.now() - startedAt,
        errorClass: failure.errorClass,
      },
      'routes-b wallet GET upstream failure',
    )

    return NextResponse.json(
      {
        error: 'Wallet balance temporarily unavailable',
        code: failure.code,
      },
      { status: failure.status },
    )
  }
}

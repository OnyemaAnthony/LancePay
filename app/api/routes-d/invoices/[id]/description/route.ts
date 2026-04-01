import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // verify auth
    const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
    const claims = await verifyAuthToken(authToken || '')

    if (!claims) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { privyId: claims.userId }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // get request body
    const body = await request.json()
    const { description } = body

    // validation: description required
    if (!description || typeof description !== 'string' || description.trim() === '') {
      return NextResponse.json(
        { error: 'Description is required and must be a non-empty string' },
        { status: 400 }
      )
    }

    // validation: max length
    if (description.length > 500) {
      return NextResponse.json(
        { error: 'Description must not exceed 500 characters' },
        { status: 400 }
      )
    }

    // find invoice
    const invoice = await prisma.invoice.findUnique({
      where: { id: params.id }
    })

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    // ownership check
    if (invoice.userId !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // status check
    if (invoice.status !== 'pending') {
      return NextResponse.json(
        { error: 'Only pending invoices can be updated' },
        { status: 422 }
      )
    }

    const updatedInvoice = await prisma.invoice.update({
      where: { id: params.id },
      data: {
        description: description.trim()
      },
      select: {
        id: true,
        invoiceNumber: true,
        description: true,
        updatedAt: true
      }
    })

    return NextResponse.json(updatedInvoice, { status: 200 })

  } catch (error) {
    console.error('PATCH /invoices/[id]/description error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
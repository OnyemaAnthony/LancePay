import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  let contactId: string | undefined

  try {
    // check auth header
    const authToken = request.headers
      .get('authorization')
      ?.replace('Bearer ', '')

    if (!authToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    //  verify token
    const claims = await verifyAuthToken(authToken)
    if (!claims) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // get user
    const user = await prisma.user.findUnique({
      where: { privyId: claims.userId },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // get contact ID
    const { id } = params
    contactId = id

    // find contact
    const contact = await prisma.contact.findUnique({
      where: { id },
    })

    // not found - 404
    if (!contact) {
      return NextResponse.json(
        { error: 'Contact not found' },
        { status: 404 }
      )
    }

    // ownership check - 403
    if (contact.userId !== user.id) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      )
    }

    // return contact - 200
    return NextResponse.json(
      { contact },
      { status: 200 }
    )
  } catch (error) {
    logger.error(
      { err: error, contactId },
      'Routes B contact GET error'
    )

    return NextResponse.json(
      { error: 'Failed to fetch contact' },
      { status: 500 }
    )
  }
}
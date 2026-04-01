import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuth } from "@/lib/auth";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // verify authentication
    const user = await getAuth(req);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const invoiceId = params.id;

    // find invoice
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
    });

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    // authorization check
    if (invoice.userId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // fetch audit events
    const activity = await prisma.auditEvent.findMany({
      where: {
        resourceType: "invoice",
        resourceId: invoiceId,
      },
      orderBy: {
        createdAt: "asc",
      },
      select: {
        id: true,
        action: true,
        ipAddress: true,
        createdAt: true,
      },
    });

    // return response
    return NextResponse.json({ activity }, { status: 200 });

  } catch (error) {
    console.error("Error fetching invoice activity:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
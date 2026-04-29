import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyAuthToken } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { buildDashboardSummary } from "../_lib/aggregations";
import { errorResponse } from "../_lib/errors";

export async function GET(request: NextRequest) {
  const requestId = request.headers.get("x-request-id");
  const authToken = request.headers
    .get("authorization")
    ?.replace("Bearer ", "");
  const claims = await verifyAuthToken(authToken || "");
  if (!claims) {
    return errorResponse(
      "UNAUTHORIZED",
      "Unauthorized",
      undefined,
      401,
      requestId,
    );
  }

  const user = await prisma.user.findUnique({
    where: { privyId: claims.userId },
  });
  if (!user) {
    return errorResponse(
      "NOT_FOUND",
      "User not found",
      undefined,
      404,
      requestId,
    );
  }

  const { summary, queryCount } = await buildDashboardSummary(user.id);
  logger.info(
    { userId: user.id, queryCount },
    "routes-b dashboard query profile",
  );
  return NextResponse.json({ summary });
}

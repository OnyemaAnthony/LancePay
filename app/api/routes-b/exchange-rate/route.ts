import { NextResponse } from "next/server";

export async function GET() {
  try {
    // fetches USD → NGN rate (USDC ≈ USD)
    const res = await fetch("https://open.er-api.com/v6/latest/USD", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error("Failed to fetch exchange rate");
    }

    const data = await res.json();

    const usdToNgn = data?.rates?.NGN;

    if (typeof usdToNgn !== "number") {
      throw new Error("Invalid rate format");
    }

    return NextResponse.json(
      {
        rate: {
          from: "USDC",
          to: "NGN",
          value: usdToNgn,
          source: "open.er-api.com",
          fetchedAt: new Date().toISOString(),
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Exchange rate fetch error:", error);

    return NextResponse.json(
      {
        error: "Unable to fetch exchange rate. Please try again.",
      },
      { status: 503 }
    );
  }
}
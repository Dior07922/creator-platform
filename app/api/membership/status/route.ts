import { NextResponse } from "next/server";

import {
  getMembershipForUser,
} from "../../../../src/server/membership";

import {
  currentUserId,
} from "../../../../src/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const userId =
      await currentUserId();

    if (!userId) {
      return NextResponse.json(
        {
          active: false,
          plan: null,
          expiresAt: null,
          loggedIn: false,
        },
        {
          status: 401,
        }
      );
    }

    const membership =
      await getMembershipForUser(
        userId
      );

    return NextResponse.json({
      ...membership,
      loggedIn: true,
    });
  } catch (error) {
    console.error(
      "读取会员状态失败:",
      error
    );

    return NextResponse.json(
      {
        message:
          "暂时无法读取会员状态",
      },
      {
        status: 500,
      }
    );
  }
}
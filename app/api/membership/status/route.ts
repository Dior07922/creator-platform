import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  db,
  ensureAuthTables,
  SESSION_COOKIE,
  tokenHash,
} from "../../../../src/server/auth";

import {
  getMembershipForUser,
} from "../../../../src/server/membership";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function currentUserId() {
  await ensureAuthTables();

  const token =
    (await cookies()).get(
      SESSION_COOKIE
    )?.value;

  if (!token) {
    return null;
  }

  const sql = db();

  const rows = await sql`
    SELECT user_id AS "userId"
    FROM user_sessions
    WHERE
      token_hash = ${tokenHash(token)}
      AND revoked_at IS NULL
      AND expires_at > NOW()
    LIMIT 1
  `;

  if (!rows.length) {
    return null;
  }

  return String(
    rows[0].userId
  );
}

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
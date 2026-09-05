import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  db,
  ensureAuthTables,
  SESSION_COOKIE,
  tokenHash,
} from "../../../../src/server/auth";

import {
  createOrder,
  type StoredOrder,
} from "../../../../src/server/order-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MembershipPlan =
  | "monthly"
  | "yearly";

const MEMBERSHIP_PLANS = {
  monthly: {
    productId: 9001,
    product: "苒境月度会员",
    amount: "¥19.90",
  },

  yearly: {
    productId: 9002,
    product: "苒境年度会员",
    amount: "¥168.00",
  },
} satisfies Record<
  MembershipPlan,
  {
    productId: number;
    product: string;
    amount: string;
  }
>;

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
      token_hash =
        ${tokenHash(token)}
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

export async function POST(
  request: Request
) {
  try {
    const userId =
      await currentUserId();

    if (!userId) {
      return NextResponse.json(
        {
          message:
            "请先登录后再开通会员",
        },
        {
          status: 401,
        }
      );
    }

    const body =
      await request.json();

    const plan =
      String(
        body.plan ?? ""
      ) as MembershipPlan;

    if (
      plan !== "monthly" &&
      plan !== "yearly"
    ) {
      return NextResponse.json(
        {
          message:
            "会员方案无效",
        },
        {
          status: 400,
        }
      );
    }

    const planInfo =
      MEMBERSHIP_PLANS[plan];

    const now = new Date();

    const date =
      new Intl.DateTimeFormat(
        "en-CA",
        {
          timeZone:
            "Asia/Shanghai",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }
      )
        .format(now)
        .replace(/-/g, "");

    const suffix =
      randomUUID()
        .replace(/-/g, "")
        .slice(0, 8)
        .toUpperCase();

    const order: StoredOrder = {
      id:
        `VIP-${date}-${suffix}`,

      productId:
        planInfo.productId,

      product:
        planInfo.product,

      icon: "VIP",

      quantity: 1,

      amount:
        planInfo.amount,

      paymentMethod:
        "alipay",

      status:
        "Pending",

      createdAt:
        now.toISOString(),

      deliveryEmail: "",

      saveDeliveryEmail:
        false,

      emailDeliveryStatus:
        "NotConfigured",

      orderKind:
        "membership",

      userId,

      membershipPlan:
        plan,
    };

    const savedOrder =
      await createOrder(order);

    return NextResponse.json(
      {
        order: savedOrder,
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    console.error(
      "创建会员订单失败:",
      error
    );

    return NextResponse.json(
      {
        message:
          "会员订单创建失败",
      },
      {
        status: 500,
      }
    );
  }
}
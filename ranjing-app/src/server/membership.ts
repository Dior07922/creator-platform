import {
  db,
  ensureAuthTables,
} from "./auth";

import {
  findOrder,
} from "./order-store";

export async function ensureMembershipTables() {
  await ensureAuthTables();

  const sql = db();

  await sql`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS
    membership_plan TEXT
  `;

  await sql`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS
    membership_expires_at TIMESTAMPTZ
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS membership_grants (
      order_id TEXT PRIMARY KEY,
      user_id UUID NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

      plan TEXT NOT NULL,

      granted_at TIMESTAMPTZ
        NOT NULL
        DEFAULT NOW(),

      expires_at TIMESTAMPTZ
        NOT NULL
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS
    membership_grants_user_idx
    ON membership_grants(user_id)
  `;
}

export async function grantMembershipForPaidOrder(
  orderId: string
) {
  const order =
    await findOrder(orderId);

  if (!order) {
    return null;
  }

  if (order.status !== "Paid") {
    return null;
  }

  if (
    order.orderKind !==
    "membership"
  ) {
    return null;
  }

  if (!order.userId) {
    return null;
  }

  if (
    order.membershipPlan !==
      "monthly" &&
    order.membershipPlan !==
      "yearly"
  ) {
    return null;
  }

  await ensureMembershipTables();

  const sql = db();

  const rows = await sql`
    WITH membership_base AS (
      SELECT
        id,
        GREATEST(
          COALESCE(
            membership_expires_at,
            NOW()
          ),
          NOW()
        ) AS start_at
      FROM users
      WHERE id = ${order.userId}::uuid
    ),

    new_grant AS (
      INSERT INTO membership_grants (
        order_id,
        user_id,
        plan,
        granted_at,
        expires_at
      )

      SELECT
        ${order.id},
        id,
        ${order.membershipPlan},
        NOW(),

        CASE
          WHEN ${order.membershipPlan}
            = 'monthly'
          THEN
            start_at
            + INTERVAL '1 month'

          ELSE
            start_at
            + INTERVAL '1 year'
        END

      FROM membership_base

      ON CONFLICT (order_id)
      DO NOTHING

      RETURNING
        user_id,
        plan,
        expires_at
    )

    UPDATE users
    SET
      membership_plan =
        new_grant.plan,

      membership_expires_at =
        new_grant.expires_at,

      updated_at = NOW()

    FROM new_grant

    WHERE
      users.id =
        new_grant.user_id

    RETURNING
      users.membership_plan
        AS "plan",

      users.membership_expires_at
        AS "expiresAt"
  `;

  /*
   * rows 为空有两种正常情况：
   *
   * 1. 这个支付宝订单以前已经发过会员，
   *    防止 notify/status 重复加时长。
   *
   * 2. 用户不存在。
   */
  if (!rows.length) {
    return null;
  }

  return {
    plan:
      String(rows[0].plan),

    expiresAt:
      new Date(
        String(
          rows[0].expiresAt
        )
      ).toISOString(),
  };
}

export async function getMembershipForUser(
  userId: string
) {
  await ensureMembershipTables();

  const sql = db();

  const rows = await sql`
    SELECT
      membership_plan
        AS "plan",

      membership_expires_at
        AS "expiresAt"

    FROM users

    WHERE id =
      ${userId}::uuid

    LIMIT 1
  `;

  if (!rows.length) {
    return {
      active: false,
      plan: null,
      expiresAt: null,
    };
  }

  const expiresAt =
    rows[0].expiresAt
      ? new Date(
          String(
            rows[0].expiresAt
          )
        )
      : null;

  const active =
    Boolean(
      expiresAt &&
      expiresAt.getTime() >
        Date.now()
    );

  return {
    active,

    plan:
      active &&
      rows[0].plan
        ? String(
            rows[0].plan
          )
        : null,

    expiresAt:
      expiresAt
        ? expiresAt.toISOString()
        : null,
  };
}
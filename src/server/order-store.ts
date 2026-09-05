import {
  db,
  ensureAuthTables,
} from "./auth";

export type StoredOrder = {
  id: string;
  productId: number;
  product: string;
  icon: string;
  quantity: number;
  amount: string;
  paymentMethod: string;
  status:
    | "Pending"
    | "Paid"
    | "Closed";
  createdAt: string;

  deliveryEmail?: string;
  saveDeliveryEmail?: boolean;

  emailDeliveryStatus?:
    | "NotConfigured"
    | "Pending"
    | "Sent"
    | "Failed";

  deliveredCode?: string;
  paidAt?: string;
  alipayTradeNo?: string;

  orderKind?:
    | "product"
    | "membership";

  userId?: string;

  membershipPlan?:
    | "monthly"
    | "yearly";
};

async function ensureOrderTables() {
  await ensureAuthTables();

  const sql = db();

  await sql`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,

      product_id INTEGER NOT NULL,
      product TEXT NOT NULL,
      icon TEXT NOT NULL DEFAULT '',
      quantity INTEGER NOT NULL DEFAULT 1,

      amount TEXT NOT NULL,
      payment_method TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Pending',

      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      delivery_email TEXT NOT NULL DEFAULT '',
      save_delivery_email BOOLEAN NOT NULL DEFAULT FALSE,
      email_delivery_status TEXT NOT NULL DEFAULT 'NotConfigured',

      delivered_code TEXT,
      paid_at TIMESTAMPTZ,
      alipay_trade_no TEXT,

      order_kind TEXT NOT NULL DEFAULT 'product',
      user_id UUID,
      membership_plan TEXT
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS
    orders_user_id_idx
    ON orders(user_id)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS
    orders_status_idx
    ON orders(status)
  `;
}

function normalizeOrder(
  row: Record<string, unknown>
): StoredOrder {
  return {
    id: String(row.id),
    productId: Number(row.productId),
    product: String(row.product),
    icon: String(row.icon || ""),
    quantity: Number(row.quantity || 1),
    amount: String(row.amount),
    paymentMethod:
      String(row.paymentMethod),

    status:
      row.status === "Paid"
        ? "Paid"
        : row.status === "Closed"
          ? "Closed"
          : "Pending",

    createdAt:
      new Date(
        String(row.createdAt)
      ).toISOString(),

    deliveryEmail:
      String(
        row.deliveryEmail || ""
      ),

    saveDeliveryEmail:
      Boolean(
        row.saveDeliveryEmail
      ),

    emailDeliveryStatus:
      (
        row.emailDeliveryStatus ||
        "NotConfigured"
      ) as StoredOrder["emailDeliveryStatus"],

    deliveredCode:
      row.deliveredCode
        ? String(row.deliveredCode)
        : undefined,

    paidAt:
      row.paidAt
        ? new Date(
            String(row.paidAt)
          ).toISOString()
        : undefined,

    alipayTradeNo:
      row.alipayTradeNo
        ? String(row.alipayTradeNo)
        : undefined,

    orderKind:
      row.orderKind ===
      "membership"
        ? "membership"
        : "product",

    userId:
      row.userId
        ? String(row.userId)
        : undefined,

    membershipPlan:
      row.membershipPlan ===
      "monthly"
        ? "monthly"
        : row.membershipPlan ===
            "yearly"
          ? "yearly"
          : undefined,
  };
}

async function saveOrder(
  order: StoredOrder
) {
  await ensureOrderTables();

  const sql = db();

  await sql`
    INSERT INTO orders (
      id,
      product_id,
      product,
      icon,
      quantity,
      amount,
      payment_method,
      status,
      created_at,
      delivery_email,
      save_delivery_email,
      email_delivery_status,
      delivered_code,
      paid_at,
      alipay_trade_no,
      order_kind,
      user_id,
      membership_plan
    )
    VALUES (
      ${order.id},
      ${order.productId},
      ${order.product},
      ${order.icon},
      ${order.quantity},
      ${order.amount},
      ${order.paymentMethod},
      ${order.status},
      ${order.createdAt},
      ${order.deliveryEmail ?? ""},
      ${order.saveDeliveryEmail ?? false},
      ${order.emailDeliveryStatus ?? "NotConfigured"},
      ${order.deliveredCode ?? null},
      ${order.paidAt ?? null},
      ${order.alipayTradeNo ?? null},
      ${order.orderKind ?? "product"},
      ${order.userId ?? null},
      ${order.membershipPlan ?? null}
    )
    ON CONFLICT (id)
    DO UPDATE SET
      product_id = EXCLUDED.product_id,
      product = EXCLUDED.product,
      icon = EXCLUDED.icon,
      quantity = EXCLUDED.quantity,
      amount = EXCLUDED.amount,
      payment_method = EXCLUDED.payment_method,
      status = EXCLUDED.status,
      delivery_email = EXCLUDED.delivery_email,
      save_delivery_email = EXCLUDED.save_delivery_email,
      email_delivery_status = EXCLUDED.email_delivery_status,
      delivered_code = EXCLUDED.delivered_code,
      paid_at = EXCLUDED.paid_at,
      alipay_trade_no = EXCLUDED.alipay_trade_no,
      order_kind = EXCLUDED.order_kind,
      user_id = EXCLUDED.user_id,
      membership_plan = EXCLUDED.membership_plan
  `;

  return order;
}

export async function readOrders():
Promise<StoredOrder[]> {
  await ensureOrderTables();

  const sql = db();

  const rows = await sql`
    SELECT
      id,
      product_id AS "productId",
      product,
      icon,
      quantity,
      amount,
      payment_method AS "paymentMethod",
      status,
      created_at AS "createdAt",
      delivery_email AS "deliveryEmail",
      save_delivery_email AS "saveDeliveryEmail",
      email_delivery_status AS "emailDeliveryStatus",
      delivered_code AS "deliveredCode",
      paid_at AS "paidAt",
      alipay_trade_no AS "alipayTradeNo",
      order_kind AS "orderKind",
      user_id AS "userId",
      membership_plan AS "membershipPlan"
    FROM orders
    ORDER BY created_at DESC
  `;

  return rows.map((row) =>
    normalizeOrder(
      row as Record<
        string,
        unknown
      >
    )
  );
}

export async function writeOrders(
  orders: StoredOrder[]
) {
  for (const order of orders) {
    await saveOrder(order);
  }
}

export async function createOrder(
  order: StoredOrder
) {
  return saveOrder(order);
}

export async function findOrder(
  orderId: string
) {
  if (!orderId) return null;

  await ensureOrderTables();

  const sql = db();

  const rows = await sql`
    SELECT
      id,
      product_id AS "productId",
      product,
      icon,
      quantity,
      amount,
      payment_method AS "paymentMethod",
      status,
      created_at AS "createdAt",
      delivery_email AS "deliveryEmail",
      save_delivery_email AS "saveDeliveryEmail",
      email_delivery_status AS "emailDeliveryStatus",
      delivered_code AS "deliveredCode",
      paid_at AS "paidAt",
      alipay_trade_no AS "alipayTradeNo",
      order_kind AS "orderKind",
      user_id AS "userId",
      membership_plan AS "membershipPlan"
    FROM orders
    WHERE id = ${orderId}
    LIMIT 1
  `;

  if (!rows.length) {
    return null;
  }

  return normalizeOrder(
    rows[0] as Record<
      string,
      unknown
    >
  );
}

export async function updateOrder(
  orderId: string,
  update:
    (order: StoredOrder) => void
) {
  const order =
    await findOrder(orderId);

  if (!order) return null;

  update(order);

  await saveOrder(order);

  return order;
}

export function parseCnyAmount(
  value: string
) {
  const match =
    /(?:¥|￥)?(\d+(?:\.\d{1,2})?)/.exec(
      value.trim()
    );

  if (!match) return null;

  const amount =
    Number(match[1]);

  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    return null;
  }

  return amount.toFixed(2);
}
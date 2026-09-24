import { NextResponse } from "next/server";

import {
  AlipayConfigurationError,
  createAlipayPaymentUrl,
} from "../../../../../src/server/alipay";

import {
  findOrder,
  parseCnyAmount,
} from "../../../../../src/server/order-store";

import {
  currentUserId,
  orderBelongsTo,
} from "../../../../../src/server/session";

export const runtime = "nodejs";

function publicBaseUrl(request: Request) {
  return (
    process.env.APP_BASE_URL?.trim() ||
    new URL(request.url).origin
  ).replace(/\/$/, "");
}

function detectPaymentMode(
  request: Request
): "desktop" | "mobile" {
  const clientHint =
    request.headers.get(
      "sec-ch-ua-mobile"
    );

  if (clientHint === "?1") {
    return "mobile";
  }

  const userAgent =
    request.headers.get(
      "user-agent"
    ) || "";

  const isMobile =
    /Android|iPhone|iPad|iPod|Mobile|HarmonyOS/i.test(
      userAgent
    );

  return isMobile
    ? "mobile"
    : "desktop";
}

export async function POST(
  request: Request
) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { message: "请求格式不正确" },
      { status: 400 }
    );
  }

  const orderId = String(
    body?.orderId ?? ""
  ).trim();

  if (!orderId) {
    return NextResponse.json(
      {
        message: "缺少订单号",
      },
      {
        status: 400,
      }
    );
  }

  try {
    /* 只有订单归属人才能拉起收银台 */
    const userId = await currentUserId();

    if (!userId) {
      return NextResponse.json(
        { message: "请先登录" },
        { status: 401 }
      );
    }

    const order =
      await findOrder(orderId);

    if (!order) {
      return NextResponse.json(
        {
          message: "订单不存在",
        },
        {
          status: 404,
        }
      );
    }

    /* 不是自己的订单：一律按「不存在」返回 */
    if (!orderBelongsTo(order.userId, userId)) {
      return NextResponse.json(
        { message: "订单不存在" },
        { status: 404 }
      );
    }

    if (
      order.paymentMethod !==
      "alipay"
    ) {
    return NextResponse.json(
      {
        message:
          "该订单不是支付宝订单",
      },
      {
        status: 409,
      }
    );
  }

  if (order.status === "Paid") {
    return NextResponse.json({
      status: "Paid",
    });
  }

  const totalAmount =
    parseCnyAmount(order.amount);

  if (!totalAmount) {
    return NextResponse.json(
      {
        message:
          "该订单金额暂不支持在线支付",
      },
      {
        status: 409,
      }
    );
  }

  const baseUrl =
    publicBaseUrl(request);

  const returnUrl =
    `${baseUrl}/?payment=alipay` +
    `&orderId=${encodeURIComponent(
      order.id
    )}`;

  const notifyUrl =
    process.env
      .ALIPAY_NOTIFY_URL
      ?.trim() ||
    `${baseUrl}/api/payments/alipay/notify`;

  const mode =
    detectPaymentMode(request);

  try {
    const paymentUrl =
      createAlipayPaymentUrl({
        orderId: order.id,
        subject: order.product,
        totalAmount,
        returnUrl,
        notifyUrl,
        mode,
      });

    return NextResponse.json({
      paymentUrl,
      mode,
    });
  } catch (error) {
    if (
      error instanceof
      AlipayConfigurationError
    ) {
      return NextResponse.json(
        {
          message:
            "支付宝尚未完成商户配置",
          code:
            "ALIPAY_NOT_CONFIGURED",
        },
        {
          status: 503,
        }
      );
    }

    console.error(
      "支付宝收银台创建失败:",
      error
    );

    return NextResponse.json(
      {
        message:
          "支付宝收银台创建失败",
      },
      {
        status: 502,
      }
    );
    }
  } catch (error) {
    /* 会话查询 / 订单读取失败：不回显内部信息 */
    console.error(
      "支付宝收银台创建失败:",
      error instanceof Error ? error.message : error
    );

    return NextResponse.json(
      { message: "暂时无法发起支付，请稍后再试" },
      { status: 500 }
    );
  }
}
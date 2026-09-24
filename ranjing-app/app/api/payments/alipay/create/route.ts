import { NextResponse } from "next/server";

import {
  AlipayConfigurationError,
  createAlipayPaymentUrl,
} from "../../../../../src/server/alipay";

import {
  findOrder,
  parseCnyAmount,
} from "../../../../../src/server/order-store";

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
  const body =
    await request.json();

  const orderId = String(
    body.orderId ?? ""
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
}
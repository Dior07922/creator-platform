import {
  AlipayConfigurationError,
  getAlipayAppId,
  verifyAlipayNotification,
} from "../../../../../src/server/alipay";

import {
  findOrder,
  markOrderClosed,
  markOrderPaid,
  parseCnyAmount,
} from "../../../../../src/server/order-store";

import {
  grantMembershipForPaidOrder,
} from "../../../../../src/server/membership";

export const runtime = "nodejs";

function text(
  body: "success" | "failure",
  status = 200
) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type":
        "text/plain; charset=utf-8",
    },
  });
}

export async function POST(
  request: Request
) {
  try {
    const form =
      await request.formData();

    const data =
      Object.fromEntries(
        Array.from(
          form.entries()
        ).map(
          ([key, value]) => [
            key,
            String(value),
          ]
        )
      );

    if (
      !verifyAlipayNotification(
        data
      )
    ) {
      return text(
        "failure",
        400
      );
    }

    if (
      data.app_id !==
      getAlipayAppId()
    ) {
      return text(
        "failure",
        400
      );
    }

    const order =
      await findOrder(
        data.out_trade_no || ""
      );

    if (
      !order ||
      order.paymentMethod !==
        "alipay"
    ) {
      return text(
        "failure",
        404
      );
    }

    const expectedAmount =
      parseCnyAmount(
        order.amount
      );

    const notifiedNumber =
      Number(
        data.total_amount
      );

    if (
      !Number.isFinite(
        notifiedNumber
      )
    ) {
      return text(
        "failure",
        400
      );
    }

    const notifiedAmount =
      notifiedNumber.toFixed(2);

    if (
      !expectedAmount ||
      notifiedAmount !==
        expectedAmount
    ) {
      return text(
        "failure",
        400
      );
    }

    const expectedSellerId =
      process.env
        .ALIPAY_SELLER_ID
        ?.trim();

    if (
      expectedSellerId &&
      data.seller_id !==
        expectedSellerId
    ) {
      return text(
        "failure",
        400
      );
    }

    if (
      data.trade_status ===
        "TRADE_SUCCESS" ||
      data.trade_status ===
        "TRADE_FINISHED"
    ) {
      /* 原子置为 Paid（见 order-store 里的说明）：
         本路由与前端 status 轮询会并发，读-改-写会互相覆盖。 */
      const paidOrder =
        await markOrderPaid(
          order.id,
          {
            paidAt: data.gmt_payment,
            alipayTradeNo: data.trade_no,
          }
        );

      if (!paidOrder) {
        return text(
          "failure",
          500
        );
      }

      if (
        paidOrder.orderKind ===
        "membership"
      ) {
        if (
          !paidOrder.userId ||
          (
            paidOrder
              .membershipPlan !==
              "monthly" &&
            paidOrder
              .membershipPlan !==
              "yearly"
          )
        ) {
          return text(
            "failure",
            500
          );
        }

        await grantMembershipForPaidOrder(
          paidOrder.id
        );
      }
    } else if (
      data.trade_status ===
      "TRADE_CLOSED"
    ) {
      /* 已支付的单子不会被降级（SQL 里带了 status <> 'Paid' 条件） */
      await markOrderClosed(
        order.id
      );
    }

    return text("success");
  } catch (error) {
    console.error(
      "支付宝异步通知处理失败:",
      error
    );

    if (
      error instanceof
      AlipayConfigurationError
    ) {
      return text(
        "failure",
        503
      );
    }

    return text(
      "failure",
      500
    );
  }
}
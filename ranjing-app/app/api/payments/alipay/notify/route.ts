import {
  AlipayConfigurationError,
  getAlipayAppId,
  verifyAlipayNotification,
} from "../../../../../src/server/alipay";

import {
  findOrder,
  parseCnyAmount,
  updateOrder,
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
      const paidOrder =
        await updateOrder(
          order.id,
          (stored) => {
            stored.status =
              "Paid";

            stored.paidAt ||=
              data.gmt_payment ||
              new Date()
                .toISOString();

            stored.alipayTradeNo =
              data.trade_no;
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
      await updateOrder(
        order.id,
        (stored) => {
          if (
            stored.status !==
            "Paid"
          ) {
            stored.status =
              "Closed";
          }
        }
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
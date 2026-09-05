import { NextResponse } from "next/server";

import {
  AlipayConfigurationError,
  getAlipaySdk,
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
export const dynamic = "force-dynamic";

export async function GET(
  request: Request
) {
  const orderId =
    new URL(request.url)
      .searchParams
      .get("orderId")
      ?.trim() || "";

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

    /*
     * 已经 Paid 也再尝试一次会员发放。
     * grantMembershipForPaidOrder 本身防重复，
     * 所以不会重复增加会员时长。
     */
    if (
      order.status === "Paid"
    ) {
      if (
        order.orderKind ===
        "membership"
      ) {
        await grantMembershipForPaidOrder(
          order.id
        );
      }

      return NextResponse.json({
        status: "Paid",
        order,
      });
    }

    if (
      order.status === "Closed"
    ) {
      return NextResponse.json({
        status: "Closed",
        order,
      });
    }

    const result =
      await getAlipaySdk().exec(
        "alipay.trade.query",
        {
          bizContent: {
            outTradeNo:
              order.id,
          },
        }
      );

    if (
      result.code === "10000"
    ) {
      const expectedAmount =
        parseCnyAmount(
          order.amount
        );

      const actualNumber =
        Number(
          result.totalAmount
        );

      if (
        !Number.isFinite(
          actualNumber
        )
      ) {
        return NextResponse.json(
          {
            message:
              "支付宝返回金额无效",
          },
          {
            status: 409,
          }
        );
      }

      const actualAmount =
        actualNumber.toFixed(2);

      if (
        !expectedAmount ||
        actualAmount !==
          expectedAmount
      ) {
        return NextResponse.json(
          {
            message:
              "支付宝返回金额与订单不一致",
          },
          {
            status: 409,
          }
        );
      }

      if (
        result.tradeStatus ===
          "TRADE_SUCCESS" ||
        result.tradeStatus ===
          "TRADE_FINISHED"
      ) {
        const paidOrder =
          await updateOrder(
            order.id,
            (stored) => {
              stored.status =
                "Paid";

              stored.paidAt ||=
                result.sendPayDate ||
                new Date()
                  .toISOString();

              stored.alipayTradeNo =
                result.tradeNo;
            }
          );

        if (!paidOrder) {
          return NextResponse.json(
            {
              message:
                "订单状态更新失败",
            },
            {
              status: 500,
            }
          );
        }

        if (
          paidOrder.orderKind ===
          "membership"
        ) {
          await grantMembershipForPaidOrder(
            paidOrder.id
          );
        }

        return NextResponse.json({
          status: "Paid",
          order: paidOrder,
        });
      }

      if (
        result.tradeStatus ===
        "TRADE_CLOSED"
      ) {
        const closedOrder =
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

        return NextResponse.json({
          status: "Closed",
          order: closedOrder,
        });
      }
    }

    return NextResponse.json({
      status: "Pending",
      order,
    });
  } catch (error) {
    console.error(
      "支付宝订单状态查询失败:",
      error
    );

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

    return NextResponse.json(
      {
        message:
          "暂时无法查询支付宝订单",
      },
      {
        status: 502,
      }
    );
  }
}
import { NextResponse } from "next/server";

import {
  AlipayConfigurationError,
  getAlipaySdk,
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

import {
  currentUserId,
  orderBelongsTo,
} from "../../../../../src/server/session";

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
    /* 订单含买家邮箱、用户 id、支付宝流水号，必须校验归属 */
    const userId =
      await currentUserId();

    if (!userId) {
      return NextResponse.json(
        {
          message: "请先登录",
        },
        {
          status: 401,
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

    /* 不是自己的订单：一律按「不存在」返回，不泄露订单是否存在 */
    if (
      !orderBelongsTo(
        order.userId,
        userId
      )
    ) {
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
          await markOrderPaid(
            order.id,
            {
              paidAt:
                result.sendPayDate,
              alipayTradeNo:
                result.tradeNo,
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
          await markOrderClosed(
            order.id
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
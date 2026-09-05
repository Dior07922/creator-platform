import { AlipaySdk } from "alipay-sdk";

export class AlipayConfigurationError extends Error {}

function required(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new AlipayConfigurationError(
      `Missing ${name}`
    );
  }

  return value;
}

function formatKey(value: string) {
  return value.replace(/\\n/g, "\n");
}

export function getAlipayAppId() {
  return required("ALIPAY_APP_ID");
}

export function getAlipaySdk() {
  return new AlipaySdk({
    appId: getAlipayAppId(),

    privateKey: formatKey(
      required("ALIPAY_PRIVATE_KEY")
    ),

    alipayPublicKey: formatKey(
      required("ALIPAY_PUBLIC_KEY")
    ),

    keyType:
      process.env.ALIPAY_KEY_TYPE === "PKCS1"
        ? "PKCS1"
        : "PKCS8",

    signType: "RSA2",

    gateway:
      process.env.ALIPAY_GATEWAY?.trim() ||
      "https://openapi.alipay.com/gateway.do",
  });
}

type PaymentMode =
  | "desktop"
  | "mobile";

export function createAlipayPaymentUrl(input: {
  orderId: string;
  subject: string;
  totalAmount: string;
  returnUrl: string;
  notifyUrl: string;
  mode?: PaymentMode;
}) {
  const isMobile =
    input.mode === "mobile";

  const method = isMobile
    ? "alipay.trade.wap.pay"
    : "alipay.trade.page.pay";

  const productCode = isMobile
    ? "QUICK_WAP_WAY"
    : "FAST_INSTANT_TRADE_PAY";

  return getAlipaySdk().pageExecute(
    method,
    "GET",
    {
      returnUrl: input.returnUrl,
      notifyUrl: input.notifyUrl,

      bizContent: {
        outTradeNo: input.orderId,
        productCode,
        totalAmount:
          input.totalAmount,
        subject:
          input.subject.slice(0, 128),
        timeoutExpress: "30m",

        ...(isMobile
          ? {
              quitUrl:
                input.returnUrl,
            }
          : {}),
      },
    }
  );
}

export function verifyAlipayNotification(
  data: Record<string, string>
) {
  return getAlipaySdk().checkNotifySignV2(
    data
  );
}
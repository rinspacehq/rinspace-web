import { publicEnv } from "@/app/config/env";
import {
  authHeaders as sessionAuthHeaders,
  getAuthAccessToken,
} from "./phoneAuth";

const sponsorSupportersEndpoint = `${publicEnv.publicBasePath || ""}/api/sponsor/supporters`;
const sponsorOrdersEndpoint = `${publicEnv.publicBasePath || ""}/api/sponsor/orders`;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null;
}

function stringField(value: unknown) {
  return typeof value === "string" ? value : "";
}

async function sponsorAuthHeaders() {
  const accessToken = await getAuthAccessToken();
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...sessionAuthHeaders(accessToken),
  };
}

export type SponsorOrderStatus = "pending" | "paid";

export type SponsorOrder = {
  orderNo: string;
  uid: string;
  userHandle: string;
  nickname: string;
  avatarUrl: string;
  rank: number;
  message: string;
  status: SponsorOrderStatus | string;
  alipayTradeNo?: string;
  paidAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type SponsorSupporter = {
  orderNo: string;
  uid: string;
  userId: string;
  nickname: string;
  avatarUrl: string;
  rank: number;
  amountFen: number;
  amount: string;
  amountText: string;
  message: string;
  paidAt: string;
};

export type SponsorSupporterList = {
  items: SponsorSupporter[];
};

export type SponsorCreateOrderInput = {
  amountFen: number;
  message: string;
};

export type SponsorPagePayResult = {
  order: SponsorOrder;
  payHtml: string;
};

function parseSponsorOrder(value: unknown): SponsorOrder | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.orderNo !== "string" ||
    typeof value.uid !== "string" ||
    typeof value.userHandle !== "string" ||
    typeof value.nickname !== "string" ||
    typeof value.avatarUrl !== "string" ||
    typeof value.rank !== "number" ||
    typeof value.status !== "string"
  ) {
    return null;
  }
  return {
    orderNo: value.orderNo,
    uid: value.uid,
    userHandle: value.userHandle,
    nickname: value.nickname,
    avatarUrl: value.avatarUrl,
    rank: value.rank,
    message: stringField(value.message),
    status: value.status,
    alipayTradeNo: stringField(value.alipayTradeNo) || undefined,
    paidAt: stringField(value.paidAt) || undefined,
    createdAt: stringField(value.createdAt) || undefined,
    updatedAt: stringField(value.updatedAt) || undefined,
  };
}

function parseSponsorSupporter(value: unknown): SponsorSupporter | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.orderNo !== "string" ||
    typeof value.uid !== "string" ||
    typeof value.userId !== "string" ||
    typeof value.nickname !== "string" ||
    typeof value.avatarUrl !== "string" ||
    typeof value.rank !== "number" ||
    typeof value.paidAt !== "string"
  ) {
    return null;
  }
  const amountFen = typeof value.amountFen === "number" ? value.amountFen : 0;
  const amountText =
    stringField(value.amountText) ||
    stringField(value.amount) ||
    sponsorAmountLabelFromFen(amountFen);
  return {
    orderNo: value.orderNo,
    uid: value.uid,
    userId: value.userId,
    nickname: value.nickname,
    avatarUrl: value.avatarUrl,
    rank: value.rank,
    amountFen,
    amount: amountText,
    amountText,
    message: stringField(value.message),
    paidAt: value.paidAt,
  };
}

function sponsorAmountLabelFromFen(amountFen: number) {
  if (!Number.isFinite(amountFen) || amountFen <= 0) return "";
  const yuan = amountFen / 100;
  return Number.isInteger(yuan) ? `${yuan} 元` : `${yuan.toFixed(2)} 元`;
}

export async function loadSponsorSupporters(
  limit = 24,
): Promise<SponsorSupporterList> {
  const response = await fetch(
    `${sponsorSupportersEndpoint}?limit=${encodeURIComponent(String(limit))}`,
    {
      headers: { Accept: "application/json" },
    },
  );
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "赞助名单加载失败。";
    throw new Error(message);
  }
  if (!isRecord(payload) || !Array.isArray(payload.items)) {
    throw new Error("赞助名单返回格式异常。");
  }
  return {
    items: payload.items
      .map(parseSponsorSupporter)
      .filter(Boolean) as SponsorSupporter[],
  };
}

export async function loadSponsorSupporter(
  orderNo: string,
): Promise<SponsorSupporter> {
  const response = await fetch(
    `${sponsorSupportersEndpoint}/${encodeURIComponent(orderNo)}`,
    {
      headers: { Accept: "application/json" },
    },
  );
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "赞助记录加载失败。";
    throw new Error(message);
  }
  const supporter = parseSponsorSupporter(payload);
  if (!supporter) {
    throw new Error("赞助记录返回格式异常。");
  }
  return supporter;
}

export async function createSponsorOrder(
  input: SponsorCreateOrderInput,
): Promise<SponsorOrder> {
  const response = await fetch(sponsorOrdersEndpoint, {
    method: "POST",
    headers: await sponsorAuthHeaders(),
    body: JSON.stringify({
      amountFen: input.amountFen,
      message: input.message,
    }),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "赞助订单创建失败。";
    throw new Error(message);
  }
  const order = parseSponsorOrder(payload);
  if (!order) {
    throw new Error("赞助订单返回格式异常。");
  }
  return order;
}

export async function loadSponsorOrder(orderNo: string): Promise<SponsorOrder> {
  const response = await fetch(
    `${sponsorOrdersEndpoint}/${encodeURIComponent(orderNo)}`,
    {
      headers: await sponsorAuthHeaders(),
    },
  );
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "赞助订单加载失败。";
    throw new Error(message);
  }
  const order = parseSponsorOrder(payload);
  if (!order) {
    throw new Error("赞助订单返回格式异常。");
  }
  return order;
}

export async function createSponsorPagePay(
  orderNo: string,
): Promise<SponsorPagePayResult> {
  const response = await fetch(
    `${sponsorOrdersEndpoint}/${encodeURIComponent(orderNo)}/alipay/page-pay`,
    {
      method: "POST",
      headers: await sponsorAuthHeaders(),
    },
  );
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "支付宝支付链接生成失败。";
    throw new Error(message);
  }
  if (
    !isRecord(payload) ||
    !isRecord(payload.order) ||
    typeof payload.payHtml !== "string"
  ) {
    throw new Error("支付宝支付返回格式异常。");
  }
  const order = parseSponsorOrder(payload.order);
  if (!order) {
    throw new Error("支付宝支付返回格式异常。");
  }
  return {
    order,
    payHtml: payload.payHtml,
  };
}

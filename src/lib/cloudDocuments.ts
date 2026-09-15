// name=src/lib/cloudDocuments.ts

import type { DocModel } from "../types/document";

type CloudSaveResult = {
  ok: boolean;
  error?: string;
  cloudDocumentId?: string;
};

function getCloudErrorMessage(data: any, fallback: string) {
  if (data && typeof data.message === "string" && data.message.trim()) {
    return data.message.trim();
  }
  return fallback;
}

export async function cloudSaveDoc(
  doc: DocModel,
  activePageId?: string
): Promise<CloudSaveResult> {
  try {
    const activePage =
      doc.pages.find((page) => page.id === activePageId) || doc.pages[0];

    const isUpdate = Boolean(doc.cloudDocumentId);

    const payload = {
      ...(isUpdate ? { id: doc.cloudDocumentId } : {}),
      title: doc.title || "未命名文档",
      content: activePage?.content || "",
      state: {
        localDocumentId: doc.id,
        activePageId: activePage?.id || null,
        pages: doc.pages,
        links: doc.links,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      },
    };

    const res = await fetch("/api/cloud/documents", {
      method: isUpdate ? "PATCH" : "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      credentials: "include",
    });

    let data: any = null;

    try {
      data = await res.json();
    } catch {
      data = null;
    }

    if (res.status === 401) {
      return {
        ok: false,
        error: getCloudErrorMessage(data, "云端保存失败：请先登录"),
      };
    }

    if (!res.ok) {
      return {
        ok: false,
        error: getCloudErrorMessage(data, `云端保存失败（${res.status}）`),
      };
    }

    const cloudDocumentId =
      data?.document && typeof data.document.id === "string"
        ? data.document.id
        : doc.cloudDocumentId;

    if (!cloudDocumentId) {
      return {
        ok: false,
        error: "云端保存失败：服务器没有返回文档ID",
      };
    }

    return {
      ok: true,
      cloudDocumentId,
    };
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message
        ? `云端保存失败：${err.message}`
        : "云端保存失败：网络错误",
    };
  }
}
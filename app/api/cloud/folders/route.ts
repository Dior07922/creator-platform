import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  db,
  ensureAuthTables,
  SESSION_COOKIE,
  tokenHash,
} from "@/server/auth";

async function ensureCloudFolderTable() {
  await ensureAuthTables();

  const sql = db();

  await sql`
    CREATE TABLE IF NOT EXISTS cloud_folders (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      parent_id UUID REFERENCES cloud_folders(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS cloud_folders_user_parent_idx
    ON cloud_folders(user_id, parent_id)
  `;
}

async function getCurrentUserId() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;

  if (!token) {
    return null;
  }

  const sql = db();

  const rows = await sql`
    SELECT user_id
    FROM user_sessions
    WHERE token_hash = ${tokenHash(token)}
      AND revoked_at IS NULL
      AND expires_at > NOW()
    LIMIT 1
  `;

  return rows.length ? String(rows[0].user_id) : null;
}

// 获取文件夹
export async function GET(request: Request) {
  try {
    await ensureCloudFolderTable();

    const userId = await getCurrentUserId();

    if (!userId) {
      return NextResponse.json(
        { message: "请先登录" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const parentId = searchParams.get("parentId");

    const sql = db();

    const folders = parentId
      ? await sql`
          SELECT
            id,
            name,
            parent_id AS "parentId",
            created_at AS "createdAt",
            updated_at AS "updatedAt"
          FROM cloud_folders
          WHERE user_id = ${userId}
            AND parent_id = ${parentId}
            AND deleted_at IS NULL
          ORDER BY created_at DESC
        `
      : await sql`
          SELECT
            id,
            name,
            parent_id AS "parentId",
            created_at AS "createdAt",
            updated_at AS "updatedAt"
          FROM cloud_folders
          WHERE user_id = ${userId}
            AND parent_id IS NULL
            AND deleted_at IS NULL
          ORDER BY created_at DESC
        `;

    return NextResponse.json({
      folders,
    });
  } catch (error) {
    console.error("读取云端文件夹失败：", error);

    return NextResponse.json(
      { message: "云端文件夹读取失败" },
      { status: 500 }
    );
  }
}

// 新建文件夹
export async function POST(request: Request) {
  try {
    await ensureCloudFolderTable();

    const userId = await getCurrentUserId();

    if (!userId) {
      return NextResponse.json(
        { message: "请先登录" },
        { status: 401 }
      );
    }

    const body = await request.json();

    const name = String(body.name ?? "").trim();
    const parentId =
      typeof body.parentId === "string" && body.parentId
        ? body.parentId
        : null;

    if (!name) {
      return NextResponse.json(
        { message: "请输入文件夹名称" },
        { status: 400 }
      );
    }

    if (name.length > 50) {
      return NextResponse.json(
        { message: "文件夹名称不能超过50个字" },
        { status: 400 }
      );
    }

    const sql = db();

    const duplicates = parentId
      ? await sql`
          SELECT id
          FROM cloud_folders
          WHERE user_id = ${userId}
            AND parent_id = ${parentId}
            AND name = ${name}
            AND deleted_at IS NULL
          LIMIT 1
        `
      : await sql`
          SELECT id
          FROM cloud_folders
          WHERE user_id = ${userId}
            AND parent_id IS NULL
            AND name = ${name}
            AND deleted_at IS NULL
          LIMIT 1
        `;

    if (duplicates.length) {
      return NextResponse.json(
        { message: "已经有同名文件夹" },
        { status: 409 }
      );
    }

    const id = crypto.randomUUID();

    const rows = await sql`
      INSERT INTO cloud_folders (
        id,
        user_id,
        parent_id,
        name
      )
      VALUES (
        ${id},
        ${userId},
        ${parentId},
        ${name}
      )
      RETURNING
        id,
        name,
        parent_id AS "parentId",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
    `;

    return NextResponse.json(
      {
        folder: rows[0],
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("创建云端文件夹失败：", error);

    return NextResponse.json(
      { message: "创建文件夹失败" },
      { status: 500 }
    );
  }
}
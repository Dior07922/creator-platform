import { cookies } from "next/headers";

import { NextResponse } from "next/server";

import {

  db,

  ensureAuthTables,

  SESSION_COOKIE,

  tokenHash,

} from "@/server/auth";

export const dynamic = "force-dynamic";

/* =========================

   确保云端文档数据表存在

========================= */

async function ensureCloudDocumentTables() {

  await ensureAuthTables();

  const sql = db();

  // 保证文件夹表存在

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

  // 真正的云端文档表

  await sql`

    CREATE TABLE IF NOT EXISTS cloud_documents (

      id UUID PRIMARY KEY,

      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

      folder_id UUID REFERENCES cloud_folders(id) ON DELETE SET NULL,

      title TEXT NOT NULL DEFAULT '未命名文档',

      content TEXT NOT NULL DEFAULT '',

      editor_state JSONB NOT NULL DEFAULT '{}'::jsonb,

      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      deleted_at TIMESTAMPTZ

    )

  `;

  await sql`

    CREATE INDEX IF NOT EXISTS cloud_documents_user_folder_idx

    ON cloud_documents(user_id, folder_id)

  `;

  await sql`

    CREATE INDEX IF NOT EXISTS cloud_documents_user_updated_idx

    ON cloud_documents(user_id, updated_at DESC)

  `;

}

/* =========================

   获取当前登录用户

========================= */

async function getCurrentUserId() {

  const token =

    (await cookies()).get(SESSION_COOKIE)?.value;

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

  return rows.length

    ? String(rows[0].user_id)

    : null;

}

/* =========================

   验证文件夹是不是当前用户的

========================= */

async function verifyFolder(

  userId: string,

  folderId: string | null

) {

  if (!folderId) return true;

  const sql = db();

  const rows = await sql`

    SELECT id

    FROM cloud_folders

    WHERE id = ${folderId}

      AND user_id = ${userId}

      AND deleted_at IS NULL

    LIMIT 1

  `;

  return rows.length > 0;

}

/* =========================

   GET

   读取文档 / 文档列表

========================= */

export async function GET(request: Request) {

  try {

    await ensureCloudDocumentTables();

    const userId =

      await getCurrentUserId();

    if (!userId) {

      return NextResponse.json(

        { message: "请先登录" },

        { status: 401 }

      );

    }

    const { searchParams } =

      new URL(request.url);

    const id = searchParams.get("id");

    const folderId =

      searchParams.get("folderId");

    const sql = db();

    // 读取单个云端文档

    if (id) {

      const rows = await sql`

        SELECT

          id,

          folder_id AS "folderId",

          title,

          content,

          editor_state AS "state",

          created_at AS "createdAt",

          updated_at AS "updatedAt"

        FROM cloud_documents

        WHERE id = ${id}

          AND user_id = ${userId}

          AND deleted_at IS NULL

        LIMIT 1

      `;

      if (!rows.length) {

        return NextResponse.json(

          { message: "云端文档不存在" },

          { status: 404 }

        );

      }

      return NextResponse.json({

        document: rows[0],

      });

    }

    // 某文件夹下的文档

    const documents = folderId

      ? await sql`

          SELECT

            id,

            folder_id AS "folderId",

            title,

            content,

            editor_state AS "state",

            created_at AS "createdAt",

            updated_at AS "updatedAt"

          FROM cloud_documents

          WHERE user_id = ${userId}

            AND folder_id = ${folderId}

            AND deleted_at IS NULL

          ORDER BY updated_at DESC

        `

      : await sql`

          SELECT

            id,

            folder_id AS "folderId",

            title,

            content,

            editor_state AS "state",

            created_at AS "createdAt",

            updated_at AS "updatedAt"

          FROM cloud_documents

          WHERE user_id = ${userId}

            AND folder_id IS NULL

            AND deleted_at IS NULL

          ORDER BY updated_at DESC

        `;

    return NextResponse.json({

      documents,

    });

  } catch (error) {

    console.error(

      "读取云端文档失败：",

      error

    );

    return NextResponse.json(

      { message: "云端文档读取失败" },

      { status: 500 }

    );

  }

}

/* =========================

   POST

   新建真正的云端文档

========================= */

export async function POST(request: Request) {

  try {

    await ensureCloudDocumentTables();

    const userId =

      await getCurrentUserId();

    if (!userId) {

      return NextResponse.json(

        { message: "请先登录" },

        { status: 401 }

      );

    }

    const body = await request.json();

    const title =

      String(

        body.title || "未命名文档"

      ).trim() || "未命名文档";

    const content =

      typeof body.content === "string"

        ? body.content

        : "";

    const folderId =

      typeof body.folderId === "string" &&

      body.folderId

        ? body.folderId

        : null;

    const editorState =

      body.state &&

      typeof body.state === "object"

        ? body.state

        : {};

    if (title.length > 120) {

      return NextResponse.json(

        { message: "文档名称不能超过120个字" },

        { status: 400 }

      );

    }

    const folderAllowed =

      await verifyFolder(

        userId,

        folderId

      );

    if (!folderAllowed) {

      return NextResponse.json(

        { message: "云端文件夹不存在" },

        { status: 404 }

      );

    }

    const id = crypto.randomUUID();

    const stateJson =

      JSON.stringify(editorState);

    const sql = db();

    const rows = await sql`

      INSERT INTO cloud_documents (

        id,

        user_id,

        folder_id,

        title,

        content,

        editor_state

      )

      VALUES (

        ${id},

        ${userId},

        ${folderId},

        ${title},

        ${content},

        ${stateJson}::jsonb

      )

      RETURNING

        id,

        folder_id AS "folderId",

        title,

        content,

        editor_state AS "state",

        created_at AS "createdAt",

        updated_at AS "updatedAt"

    `;

    return NextResponse.json(

      {

        document: rows[0],

      },

      { status: 201 }

    );

  } catch (error) {

    console.error(

      "创建云端文档失败：",

      error

    );

    return NextResponse.json(

      { message: "云端文档创建失败" },

      { status: 500 }

    );

  }

}

/* =========================

   PATCH

   保存 / 更新云端文档

========================= */

export async function PATCH(

  request: Request

) {

  try {

    await ensureCloudDocumentTables();

    const userId =

      await getCurrentUserId();

    if (!userId) {

      return NextResponse.json(

        { message: "请先登录" },

        { status: 401 }

      );

    }

    const body = await request.json();

    const id =

      typeof body.id === "string"

        ? body.id

        : "";

    if (!id) {

      return NextResponse.json(

        { message: "缺少文档ID" },

        { status: 400 }

      );

    }

    const sql = db();

    // 必须先验证这个文档属于当前用户

    const existing = await sql`

      SELECT id

      FROM cloud_documents

      WHERE id = ${id}

        AND user_id = ${userId}

        AND deleted_at IS NULL

      LIMIT 1

    `;

    if (!existing.length) {

      return NextResponse.json(

        { message: "云端文档不存在" },

        { status: 404 }

      );

    }

    const hasTitle =

      Object.prototype.hasOwnProperty.call(

        body,

        "title"

      );

    const hasContent =

      Object.prototype.hasOwnProperty.call(

        body,

        "content"

      );

    const hasState =

      Object.prototype.hasOwnProperty.call(

        body,

        "state"

      );

    const hasFolderId =

      Object.prototype.hasOwnProperty.call(

        body,

        "folderId"

      );

    const title = hasTitle

      ? String(body.title || "")

          .trim() || "未命名文档"

      : "";

    const content = hasContent

      ? String(body.content ?? "")

      : "";

    const editorState =

      hasState &&

      body.state &&

      typeof body.state === "object"

        ? body.state

        : {};

    const folderId = hasFolderId

      ? typeof body.folderId === "string" &&

        body.folderId

        ? body.folderId

        : null

      : null;

    if (

      hasTitle &&

      title.length > 120

    ) {

      return NextResponse.json(

        { message: "文档名称不能超过120个字" },

        { status: 400 }

      );

    }

    if (hasFolderId) {

      const folderAllowed =

        await verifyFolder(

          userId,

          folderId

        );

      if (!folderAllowed) {

        return NextResponse.json(

          { message: "云端文件夹不存在" },

          { status: 404 }

        );

      }

    }

    const stateJson =

      JSON.stringify(editorState);

    const rows = await sql`

      UPDATE cloud_documents

      SET

        title =

          CASE

            WHEN ${hasTitle}

            THEN ${title}

            ELSE title

          END,

        content =

          CASE

            WHEN ${hasContent}

            THEN ${content}

            ELSE content

          END,

        editor_state =

          CASE

            WHEN ${hasState}

            THEN ${stateJson}::jsonb

            ELSE editor_state

          END,

        folder_id =

          CASE

            WHEN ${hasFolderId}

            THEN ${folderId}

            ELSE folder_id

          END,

        updated_at = NOW()

      WHERE id = ${id}

        AND user_id = ${userId}

        AND deleted_at IS NULL

      RETURNING

        id,

        folder_id AS "folderId",

        title,

        content,

        editor_state AS "state",

        created_at AS "createdAt",

        updated_at AS "updatedAt"

    `;

    return NextResponse.json({

      document: rows[0],

    });

  } catch (error) {

    console.error(

      "保存云端文档失败：",

      error

    );

    return NextResponse.json(

      { message: "云端文档保存失败" },

      { status: 500 }

    );

  }

}

/* =========================

   DELETE

   删除云端文档（软删除）

========================= */

export async function DELETE(

  request: Request

) {

  try {

    await ensureCloudDocumentTables();

    const userId =

      await getCurrentUserId();

    if (!userId) {

      return NextResponse.json(

        { message: "请先登录" },

        { status: 401 }

      );

    }

    const { searchParams } =

      new URL(request.url);

    const id =

      searchParams.get("id");

    if (!id) {

      return NextResponse.json(

        { message: "缺少文档ID" },

        { status: 400 }

      );

    }

    const sql = db();

    const rows = await sql`

      UPDATE cloud_documents

      SET

        deleted_at = NOW(),

        updated_at = NOW()

      WHERE id = ${id}

        AND user_id = ${userId}

        AND deleted_at IS NULL

      RETURNING id

    `;

    if (!rows.length) {

      return NextResponse.json(

        { message: "云端文档不存在" },

        { status: 404 }

      );

    }

    return NextResponse.json({

      success: true,

      id,

    });

  } catch (error) {

    console.error(

      "删除云端文档失败：",

      error

    );

    return NextResponse.json(

      { message: "删除云端文档失败" },

      { status: 500 }

    );

  }

}
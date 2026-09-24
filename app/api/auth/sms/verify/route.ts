import { NextResponse } from "next/server";
import { db, ensureAuthTables, hashValue, newToken, secureEqual, SESSION_COOKIE, SESSION_MAX_AGE, tokenHash, validPhone } from "@/server/auth";

export async function POST(request: Request) {
  try {
    const body = await request.json(); const phone=String(body.phone||"").trim(); const code=String(body.code||"").trim();
    if (!validPhone(phone) || !/^\d{6}$/.test(code)) return NextResponse.json({ message:"验证码不正确，请重新输入" },{status:400});
    await ensureAuthTables(); const sql=db();
    const rows=await sql`SELECT id,code_hash,expires_at,used_at,attempt_count FROM sms_verifications WHERE phone=${phone} AND send_status='sent' ORDER BY created_at DESC LIMIT 1`;
    if (!rows.length) return NextResponse.json({message:"请先获取验证码"},{status:400});
    const record=rows[0] as {id:string;code_hash:string;expires_at:string;used_at:string|null;attempt_count:number};
    if(record.used_at) return NextResponse.json({message:"验证码已使用，请重新获取"},{status:400});
    if(new Date(record.expires_at)<=new Date()) return NextResponse.json({message:"验证码已失效，请重新获取"},{status:400});
    if(record.attempt_count>=5) return NextResponse.json({message:"操作太频繁，请稍后再试"},{status:429});
    const correct=secureEqual(record.code_hash,hashValue(`${record.id}:${phone}:${code}`));
    if(!correct){await sql`UPDATE sms_verifications SET attempt_count=attempt_count+1 WHERE id=${record.id}`;return NextResponse.json({message:"验证码不正确，请重新输入"},{status:400});}
    const consumed=await sql`UPDATE sms_verifications SET used_at=NOW() WHERE id=${record.id} AND used_at IS NULL RETURNING id`;
    if(!consumed.length) return NextResponse.json({message:"验证码已使用，请重新获取"},{status:400});
    const existing=await sql`SELECT id,nickname,avatar FROM users WHERE phone=${phone} LIMIT 1`;
    const isNew=existing.length===0; const userId=isNew?crypto.randomUUID():String(existing[0].id);
    if(isNew) await sql`INSERT INTO users(id,phone) VALUES(${userId},${phone})`;
    const token=newToken(); await sql`INSERT INTO user_sessions(id,user_id,token_hash,expires_at) VALUES(${crypto.randomUUID()},${userId},${tokenHash(token)},NOW()+INTERVAL '30 days')`;
    const response=NextResponse.json({isNew,user:{id:userId,nickname:isNew?"":String(existing[0]?.nickname||""),avatar:isNew?"":String(existing[0]?.avatar||"")}});
    response.cookies.set(SESSION_COOKIE,token,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:SESSION_MAX_AGE});
    return response;
  } catch { return NextResponse.json({message:"登录服务暂时不可用，请稍后再试"},{status:503}); }
}

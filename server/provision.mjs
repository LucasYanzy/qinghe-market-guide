import { z } from "zod";
import { hashPassword } from "./db.mjs";

export function provisionSchoolAdmin(db, input) {
  const p = z.object({
    email: z.email().max(254).transform((s) => s.toLowerCase()),
    name: z.string().trim().min(1).max(80),
    password: z.string().min(12).max(128),
  }).strict().parse(input);
  db.exec("BEGIN IMMEDIATE");
  try {
    if (db.prepare("SELECT id FROM users WHERE email LIKE '%@qinghe.demo' LIMIT 1").get())
      throw new Error("此数据库含演示账号。请使用新的 DATABASE_PATH 初始化，不会删除现有数据。");
    if (db.prepare("SELECT id FROM users WHERE role='admin' LIMIT 1").get())
      throw new Error("学校管理员已存在，初始化不会覆盖账号或重置密码。");
    if (p.email.endsWith("@qinghe.demo") || p.email.endsWith("@local.invalid"))
      throw new Error("请使用实际管理员邮箱。");
    const id = Number(db.prepare("INSERT INTO users (email,name,password_hash,role) VALUES (?,?,?,'admin')")
      .run(p.email, p.name, hashPassword(p.password)).lastInsertRowid);
    db.prepare("INSERT INTO operation_events (actor_id,entity_type,entity_id,action) VALUES (?,'user',?,'admin_provisioned')").run(id, String(id));
    db.exec("COMMIT");
    return { id, name: p.name, email: p.email, role: "admin" };
  } catch (error) {
    if (db.isTransaction) db.exec("ROLLBACK");
    throw error;
  }
}

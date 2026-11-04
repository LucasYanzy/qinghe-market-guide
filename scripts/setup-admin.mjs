import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { resolve } from "node:path";
import { openDatabase } from "../server/db.mjs";
import { provisionSchoolAdmin } from "../server/provision.mjs";

if (!process.env.DATABASE_PATH || !process.stdin.isTTY || !process.stdout.isTTY) {
  console.error("请在交互式终端设置新的 DATABASE_PATH 后运行 npm run setup:admin。密码通过隐藏输入读取。");
  process.exitCode = 1;
} else {
  let hidden = false;
  const output = new Writable({ write(chunk, _encoding, callback) { if (!hidden) process.stdout.write(chunk); callback(); } });
  const rl = createInterface({ input: process.stdin, output, terminal: true });
  let db;
  try {
    const email = (await rl.question("管理员邮箱：")).trim();
    const name = (await rl.question("管理员姓名：")).trim();
    process.stdout.write("密码（12–128 字符，不显示）："); hidden = true;
    const password = await rl.question("");
    process.stdout.write("\n确认密码：");
    const confirmation = await rl.question("");
    hidden = false; process.stdout.write("\n");
    if (password !== confirmation) throw new Error("两次密码不一致，未创建管理员。");
    db = openDatabase(process.env.DATABASE_PATH, { demo: false });
    provisionSchoolAdmin(db, { email, name, password });
    console.log(`学校管理员已创建。数据库：${resolve(process.env.DATABASE_PATH)}`);
    console.log("启动时使用相同 DATABASE_PATH 和 DEMO_MODE=false；然后登录 /admin/operations 配置市场、商户与场次。");
  } catch (error) {
    console.error(error.name === "ZodError" ? "邮箱、姓名或密码格式无效，未创建管理员。" : error.message);
    process.exitCode = 1;
  } finally {
    hidden = false; rl.close(); output.end(); db?.close();
  }
}

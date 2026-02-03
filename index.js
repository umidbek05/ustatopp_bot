require("dotenv").config();
const { Telegraf, Markup } = require("telegraf");
const { Pool } = require("pg");
const express = require("express");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

// PostgreSQL ulanishi - SSL qo'shildi
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // Railway Postgres uchun bu shart!
  },
});

// Telegram Bot sozlamasi
const bot = new Telegraf(process.env.BOT_TOKEN);

// --- BOT MANTIQI ---
bot.start((ctx) => {
  ctx.reply(
    "Xush kelibsiz! Kerakli bo'limni tanlang:",
    Markup.keyboard([["🆕 Ro'yxatdan o'tish", "🔑 Parolni tiklash"]]).resize()
  );
});

bot.hears(["🆕 Ro'yxatdan o'tish", "🔑 Parolni tiklash"], async (ctx) => {
  const type = ctx.message.text.includes("Ro'yxatdan") ? "register" : "forget";
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const userId = ctx.from.id.toString();

  try {
    // Bazaga saqlash (Agar bor bo'lsa yangilash - UPSERT)
    await pool.query(
      `INSERT INTO otps (user_identifier, code, type, created_at) 
       VALUES ($1, $2, $3, NOW()) 
       ON CONFLICT (user_identifier) 
       DO UPDATE SET code = $2, type = $3, created_at = NOW()`,
      [userId, code, type]
    );

    ctx.reply(`Sizning kodingiz: ${code}\nUni saytga kiriting.`);
  } catch (err) {
    console.error(err);
    ctx.reply("Xatolik yuz berdi, qaytadan urinib ko'ring.");
  }
});

// --- API MANTIQI (React uchun) ---
// React-dan kelgan kodni tekshirish uchun API
app.post("/api/verify-otp", async (req, res) => {
  const { code, type } = req.body; // React-dan 'code' va 'type' (register yoki forget) keladi

  try {
    // Bazadan ushbu kod va turga mos qatorni qidiramiz
    const result = await pool.query(
      "SELECT * FROM otps WHERE code = $1 AND type = $2",
      [code, type]
    );

    if (result.rows.length > 0) {
      // Agar kod topilsa, uni bazadan o'chirib tashlaymiz (bir marta ishlatish uchun)
      await pool.query("DELETE FROM otps WHERE id = $1", [result.rows[0].id]);

      return res.status(200).json({
        success: true,
        message: "Kod muvaffaqiyatli tasdiqlandi!",
      });
    } else {
      // Agar kod topilmasa
      return res.status(400).json({
        success: false,
        message: "Kod noto'g'ri yoki muddati o'tgan!",
      });
    }
  } catch (err) {
    console.error("Xatolik:", err);
    res
      .status(500)
      .json({ success: false, message: "Serverda xatolik yuz berdi" });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server ${PORT}-portda ishladi`));
bot.launch();

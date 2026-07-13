// qrmenu-dashboard/backend/routes/auth.routes.js
import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { query } from "../config/db.js";
import { JWT_SECRET, JWT_EXPIRES_IN, requireAuth } from "../middleware/auth.js";

const router = express.Router();

router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ ok: false, error: "Username and password required" });
    }

    const rows = await query(
      `SELECT UserID, Username, PasswordHash, Role, ShopID, DisplayName, Status
       FROM dbo.DashboardUsers
       WHERE Username = @username`,
      { username: String(username).trim().toLowerCase() }
    );
    const user = rows?.[0];
    if (!user || user.Status !== "ACTIVE") {
      return res.status(401).json({ ok: false, error: "Invalid credentials" });
    }

    const match = await bcrypt.compare(String(password), user.PasswordHash);
    if (!match) {
      return res.status(401).json({ ok: false, error: "Invalid credentials" });
    }

    const payload = {
      userId: Number(user.UserID),
      username: user.Username,
      role: user.Role,
      shopId: user.ShopID != null ? Number(user.ShopID) : null,
      displayName: user.DisplayName || user.Username
    };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    return res.json({ ok: true, token, user: payload });
  } catch (err) {
    console.error("[DASH:AUTH] Login error:", err.message);
    return res.status(500).json({ ok: false, error: "Login failed" });
  }
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ ok: true, user: req.user });
});

export default router;

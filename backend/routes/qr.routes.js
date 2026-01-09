// backend/routes/qr.routes.js
import { Router } from "express";
import QRCode from "qrcode";
import { makeToken } from "../utils/qr.utils.js";
import "dotenv/config";

const router = Router();

// Get frontend URL from environment variable
const FRONT = process.env.FRONTEND_URL || process.env.VITE_FRONTEND_URL || "https://deynoqr.com";

// POST /api/qr/generate -> { tableId, area? } => { qrCode: base64, url, token }
router.post("/qr/generate", async (req, res) => {
  try {
    const { tableId, area = "DININ" } = req.body || {};

    if (!tableId) {
      return res.status(400).json({ 
        ok: false, 
        error: "tableId is required" 
      });
    }

    // Generate token and URL
    const token = makeToken(tableId, area);
    const url = `${FRONT}/r/${token}`;

    // Generate QR code as data URL (base64)
    const qrCodeDataUrl = await QRCode.toDataURL(url, { 
      width: 512, 
      margin: 1,
      color: {
        dark: "#000000",
        light: "#FFFFFF"
      }
    });

    res.json({
      ok: true,
      qrCode: qrCodeDataUrl,
      url,
      token,
      tableId: String(tableId),
      area: String(area)
    });
  } catch (error) {
    console.error("[/qr/generate]", error?.message || error);
    res.status(500).json({ 
      ok: false, 
      error: error?.message || "Failed to generate QR code" 
    });
  }
});

export default router;

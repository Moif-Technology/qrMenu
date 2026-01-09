// backend/routes/waitlist.routes.js
import { Router } from "express";
import {
  createWaitlistEntry,
  getWaitlistEntries,
  updateWaitlistStatus,
  deleteWaitlistEntry
} from "../services/waitlist.service.js";

const router = Router();

/**
 * POST /api/waitlist
 * Create a new waitlist entry
 */
router.post("/waitlist", async (req, res) => {
  try {
    // Transform frontend data to backend format
    const waitlistData = {
      guestName: req.body.guestName || req.body.name,
      phone: req.body.phone,
      email: req.body.email,
      partySize: req.body.partySize || req.body.guests,
      waitTimeMinutes: req.body.waitTimeMinutes || req.body.waitTime,
      tableIds: req.body.tableIds || (req.body.tableId ? [req.body.tableId] : []),
      areaId: req.body.areaId || req.body.areaID,
      notes: req.body.notes,
      specialRequests: req.body.specialRequests || req.body.requests,
      hostessId: req.body.hostessId || req.body.hostessID,
      hostessName: req.body.hostessName
    };

    const result = await createWaitlistEntry(waitlistData);
    
    res.json({
      ok: true,
      waitlistId: result.waitlistID,
      waitlistID: result.waitlistID,
      waitlistChildIDs: result.waitlistChildIDs,
      message: result.message || "Waitlist entry created successfully"
    });
  } catch (e) {
    console.error("[/waitlist] POST ERROR", e?.message || e);
    const statusCode = e?.message?.includes("Missing required") ? 400 : 500;
    res.status(statusCode).json({
      ok: false,
      error: e?.message || "Failed to create waitlist entry"
    });
  }
});

/**
 * GET /api/waitlist
 * Get all waitlist entries with optional filters
 * Query params: status (optional)
 */
router.get("/waitlist", async (req, res) => {
  try {
    const filters = {};
    if (req.query.status) {
      filters.status = req.query.status;
    }

    const entries = await getWaitlistEntries(filters);
    
    res.json({
      ok: true,
      waitlist: entries,
      count: entries.length
    });
  } catch (e) {
    console.error("[/waitlist] GET ERROR", e?.message || e);
    res.status(500).json({
      ok: false,
      error: e?.message || "Failed to fetch waitlist entries"
    });
  }
});

/**
 * PUT /api/waitlist/:waitlistId/status
 * Update waitlist entry status
 */
router.put("/waitlist/:waitlistId/status", async (req, res) => {
  try {
    const { waitlistId } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        ok: false,
        error: "Status is required"
      });
    }

    const result = await updateWaitlistStatus(parseInt(waitlistId), status);
    
    res.json({
      ok: true,
      ...result
    });
  } catch (e) {
    console.error("[/waitlist/:waitlistId/status] ERROR", e?.message || e);
    res.status(500).json({
      ok: false,
      error: e?.message || "Failed to update waitlist status"
    });
  }
});

/**
 * DELETE /api/waitlist/:waitlistId
 * Delete a waitlist entry
 */
router.delete("/waitlist/:waitlistId", async (req, res) => {
  try {
    const { waitlistId } = req.params;
    const result = await deleteWaitlistEntry(parseInt(waitlistId));
    
    res.json({
      ok: true,
      ...result
    });
  } catch (e) {
    console.error("[/waitlist/:waitlistId] DELETE ERROR", e?.message || e);
    res.status(500).json({
      ok: false,
      error: e?.message || "Failed to delete waitlist entry"
    });
  }
});

export default router;


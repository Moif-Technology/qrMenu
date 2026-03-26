/**
 * Shared in-memory store for Telr payment session metadata.
 *
 * Using a singleton module ensures both telr.routes.js and payment.service.js
 * read/write the SAME Map instance.  Two-hour TTL keeps memory bounded.
 */

const TTL_MS = 1000 * 60 * 120; // 2 hours

const byOrderRef = new Map();
const bySessionKey = new Map();

function prune() {
  const cutoff = Date.now() - TTL_MS;
  for (const [k, v] of byOrderRef.entries())  { if ((v?.createdAt ?? 0) < cutoff) byOrderRef.delete(k);  }
  for (const [k, v] of bySessionKey.entries()) { if ((v?.createdAt ?? 0) < cutoff) bySessionKey.delete(k); }
}

export function storeSession(orderRef, payload) {
  if (!orderRef && !payload?.sessionKey) return;
  const entry = { ...payload, createdAt: Date.now(), processed: false, orderRef };
  if (orderRef)            byOrderRef.set(orderRef, entry);
  if (payload?.sessionKey) bySessionKey.set(payload.sessionKey, entry);
  prune();
}

export function getSessionByOrderRef(orderRef)  { return orderRef    ? (byOrderRef.get(orderRef)     ?? null) : null; }
export function getSessionByKey(sessionKey)      { return sessionKey  ? (bySessionKey.get(sessionKey)  ?? null) : null; }

export function updateSession(orderRef, sessionKey, patch) {
  if (orderRef)    { const s = byOrderRef.get(orderRef);    if (s) Object.assign(s, patch); }
  if (sessionKey)  { const s = bySessionKey.get(sessionKey); if (s) Object.assign(s, patch); }
}

export function deleteSession(orderRef, sessionKey) {
  if (orderRef)   byOrderRef.delete(orderRef);
  if (sessionKey) bySessionKey.delete(sessionKey);
}

/**
 * Returns the Telr-verified payment amount stored after the AUTH callback,
 * or null if no verified session exists for the given sessionKey.
 *
 * Used by split payment endpoints to validate that the paidAmount the frontend
 * claims matches what Telr actually charged.
 */
export function getVerifiedAmount(sessionKey) {
  const session = getSessionByKey(sessionKey);
  if (!session || session.verifiedAmount === undefined) return null;
  return session.verifiedAmount;
}

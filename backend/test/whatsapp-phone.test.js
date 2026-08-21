// backend/test/whatsapp-phone.test.js
//
// The POS stores mobile numbers in whatever shape the till operator typed, so
// toWhatsAppId() is the one piece of logic between "messy CustomerMaster row"
// and "message delivered to the wrong person / not at all". Worth a check.

import assert from "node:assert/strict";
import test from "node:test";
import { renderTemplate, toWhatsAppId, validateImage } from "../services/whatsapp.service.js";

test("every UAE mobile shape in CustomerMaster maps to one chat id", () => {
  const expected = "971501234567@c.us";
  for (const input of [
    "+971501234567",
    "00971501234567",
    "971501234567",
    "0501234567",
    "501234567",
    "+971 50 123 4567",
    "050-123-4567",
  ]) {
    assert.equal(toWhatsAppId(input), expected, `failed on ${input}`);
  }
});

test("unusable numbers are rejected rather than guessed at", () => {
  for (const junk of ["", null, undefined, "n/a", "0", "abc", "12"]) {
    assert.equal(toWhatsAppId(junk), null, `should reject ${JSON.stringify(junk)}`);
  }
});

test("template placeholders are filled, and a missing name does not print undefined", () => {
  assert.equal(renderTemplate("Hi {{name}}!", { name: "Sabeeh" }), "Hi Sabeeh!");
  assert.equal(renderTemplate("Hi {{ NAME }}!", { name: "Sabeeh" }), "Hi Sabeeh!");
  assert.equal(renderTemplate("Hi {{name}}!", {}), "Hi !");
  assert.equal(renderTemplate("No placeholders", { name: "x" }), "No placeholders");
});

// ---- offer poster validation ----
// This runs on whatever the browser posted, so the caps are a trust boundary,
// not a convenience check.

const tinyPng =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

test("a data: URL from FileReader is accepted and its prefix stripped", () => {
  const out = validateImage({ data: `data:image/png;base64,${tinyPng}`, filename: "offer.png" });
  assert.equal(out.mimetype, "image/png");
  assert.equal(out.base64, tinyPng);
  assert.equal(out.filename, "offer.png");
});

test("bare base64 with a declared mimetype is accepted too", () => {
  const out = validateImage({ data: tinyPng, mimetype: "image/jpeg", filename: "x.jpg" });
  assert.equal(out.mimetype, "image/jpeg");
  assert.equal(out.base64, tinyPng);
});

test("no image attached is not an error", () => {
  assert.equal(validateImage(null), null);
  assert.equal(validateImage(undefined), null);
  assert.equal(validateImage({}), null);
});

test("non-image and unsupported types are rejected", () => {
  for (const mime of ["application/pdf", "image/gif", "text/html", "", "video/mp4"]) {
    assert.throws(
      () => validateImage({ data: tinyPng, mimetype: mime }),
      /JPEG, PNG or WebP/,
      `should reject ${mime}`
    );
  }
});

test("a payload that is not base64 is rejected rather than handed to WhatsApp", () => {
  assert.throws(
    () => validateImage({ data: "<script>alert(1)</script>", mimetype: "image/png" }),
    /valid base64/
  );
});

test("oversized posters are rejected before they reach WhatsApp", () => {
  // 6MB of payload: over the 5MB cap.
  const huge = "A".repeat(Math.ceil((6 * 1024 * 1024 * 4) / 3));
  assert.throws(() => validateImage({ data: huge, mimetype: "image/png" }), /too large/);
});

test("a poster just under the cap is allowed through", () => {
  const ok = "A".repeat(Math.floor((4 * 1024 * 1024 * 4) / 3));
  assert.equal(validateImage({ data: ok, mimetype: "image/webp" }).mimetype, "image/webp");
});

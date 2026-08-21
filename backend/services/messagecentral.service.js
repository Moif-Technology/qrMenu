// backend/services/messagecentral.service.js
import axios from "axios";

const BASE_URL = "https://cpaas.messagecentral.com";

const CUSTOMER_ID = process.env.MC_CUSTOMER_ID;
const AUTH_TOKEN = process.env.MC_AUTH_TOKEN;
const COUNTRY_CODE = process.env.MC_COUNTRY_CODE || "971";
const SENDER_ID = (process.env.MC_SENDER_ID || "").trim();

export function normalizeMobileForUae(phone) {
  let p = String(phone || "").trim();
  p = p.replace(/[^\d+]/g, ""); // keep digits and +

  if (p.startsWith("+")) p = p.slice(1);           // +971.... -> 971....
  if (p.startsWith("00971")) p = "971" + p.slice(5);
  if (p.startsWith("0")) p = "971" + p.slice(1);   // 055.. -> 97155..
  if (/^5\d{8}$/.test(p)) p = "971" + p;           // 5xxxxxxx -> 9715xxxxxxx

  // API uses countryCode separately, so pass only local part
  if (p.startsWith(COUNTRY_CODE)) return p.slice(COUNTRY_CODE.length); // 97155.. -> 55..
  return p;
}

function maskToken(t) {
  if (!t) return "";
  const s = String(t);
  return s.length <= 10 ? "***" : `${s.slice(0, 6)}...${s.slice(-4)}`;
}

export async function sendReservationSms({ phone, message }) {
  if (!CUSTOMER_ID) throw new Error("MC_CUSTOMER_ID missing in .env");
  if (!AUTH_TOKEN) throw new Error("MC_AUTH_TOKEN missing in .env");
  if (!phone) throw new Error("phone is required");
  if (!message) throw new Error("message is required");

  const mobileNumber = normalizeMobileForUae(phone);

  let url =
    `${BASE_URL}/verification/v3/send` +
    `?countryCode=${encodeURIComponent(COUNTRY_CODE)}` +
    `&customerId=${encodeURIComponent(CUSTOMER_ID)}` +
    `&flowType=SMS` +
    `&type=SMS` +
    `&mobileNumber=${encodeURIComponent(mobileNumber)}` +
    `&message=${encodeURIComponent(message)}`;

  if (SENDER_ID) url += `&senderId=${encodeURIComponent(SENDER_ID)}`;

  try {
    const res = await axios.post(url, null, {
      headers: {
        authToken: AUTH_TOKEN,
        accept: "*/*",
      },
      timeout: 15000,
    });

    console.log("[MC] SMS sent OK:", {
      customerId: CUSTOMER_ID,
      countryCode: COUNTRY_CODE,
      mobileNumber,
      senderId: SENDER_ID || "(default)",
      response: res.data,
    });

    return res.data;
  } catch (err) {
    // ✅ This will show the REAL reason for 400
    console.log("[MC] SMS FAILED");
    console.log("[MC] customerId:", CUSTOMER_ID);
    console.log("[MC] countryCode:", COUNTRY_CODE);
    console.log("[MC] mobileNumber:", mobileNumber);
    console.log("[MC] senderId:", SENDER_ID || "(not set)");
    console.log("[MC] authToken:", maskToken(AUTH_TOKEN));
    console.log("[MC] status:", err?.response?.status);
    console.log("[MC] data:", err?.response?.data);
    console.log("[MC] message:", err?.message);

    throw err;
  }
}

export function buildGuestReservationMessage({
  name,
  confirmationCode,
  date,
  time,
  guests,
}) {
  return (
    `Hi ${name || "Guest"}, your reservation request is received ✅\n` +
    `Ref: ${confirmationCode}\n` +
    `Date/Time: ${date} ${time}\n` +
    `Guests: ${guests}\n` +
    `We will confirm your table soon.`
  );
}

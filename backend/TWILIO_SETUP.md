# 📱 Twilio SMS Setup Guide - Paid Account

## ✅ You're Using Paid Twilio - Perfect!

Since you upgraded your account with $20, you now have:
- ✅ **No "FREE SMS DEMO" text**
- ✅ **Works in UAE**
- ✅ **Send to ANY number**
- ✅ **Custom messages**
- ✅ **Reliable delivery**

---

## 🔑 **Get Your Twilio Credentials**

### **Step 1: Go to Twilio Console**

👉 https://console.twilio.com/

### **Step 2: Copy Account SID**

On the dashboard, you'll see:

**Account Info** section

```
Account SID: ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
AC487b531ebb0fc2078e849d722b771e14
```

📝 **Copy this!**

### **Step 3: Copy Auth Token**

Just below Account SID:

```
Auth Token: ********************************
f6f09db0d4403db20f667201f4514844
```

Click **"Show"** to reveal it, then copy.

📝 **Copy this!**

### **Step 4: Get Your Phone Number**

Click **"Phone Numbers"** in left menu

Or go to: https://console.twilio.com/us1/develop/phone-numbers/manage/incoming

You'll see your Twilio phone number like:

```
+1 234 567 8900
+1 315 904 9351
```

📝 **Copy this!**

---

## 🔧 **Configure Your Application**

### **Update `.env` File:**

Open: `backend/.env`

Add these lines:

```env
# Message Provider
MESSAGE_PROVIDER=sms

# Twilio Configuration
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+12345678900
```

**Replace with your actual credentials!**

### **Save the file** (Ctrl+S)

---

## 🚀 **Restart Backend**

Stop your backend (Ctrl+C in terminal) and restart:

```bash
cd backend
npm run dev
```

---

## ✅ **Test It!**

### **Step 1: Open Guest Reservation Page**

```
http://localhost:5173/mt/opaiareservation
```

### **Step 2: Create Test Reservation**

Fill in the form:
- **Name:** Your name
- **Phone:** Your UAE number (+971501234567)
- **Email:** Your email
- **Date:** Tomorrow
- **Time:** 7:00 PM
- **Guests:** 4
- **Area:** Any
- **Occasion:** Birthday

Click **"Confirm Reservation"**

### **Step 3: Check Your Phone!**

You should receive an SMS like:

```
OPAIA Restaurant & Lounge - Reservation Confirmed

Date: January 8, 2026
Time: 7:00 PM
Guests: 4
Code: OPA000123

Thank you, [Your Name]!
```

🎉 **SUCCESS!**

---

## 💰 **Costs**

| Usage | Cost |
|-------|------|
| Per SMS (UAE) | ~$0.035 |
| 100 SMS | ~$3.50 |
| 500 SMS | ~$17.50 |
| 1000 SMS | ~$35 |

**Your $20 credit = ~570 SMS messages**

---

## 📊 **Check Your Balance**

### **Twilio Console:**

👉 https://console.twilio.com/us1/billing/manage-billing/billing-overview

You'll see:
- Current balance
- Messages sent
- Cost per message

---

## 🆘 **Troubleshooting**

### **SMS Not Received?**

**Check:**
1. ✅ `.env` file has correct credentials
2. ✅ Phone number format: `+971501234567`
3. ✅ Backend restarted after `.env` changes
4. ✅ Account is upgraded (not trial)
5. ✅ You have credit balance

### **Check Backend Logs:**

Look for:
```
[SMS] Twilio configured: { hasAccountSid: true, hasAuthToken: true, hasPhoneNumber: true }
[SMS] Sending SMS: { provider: 'twilio', to: '+971501234567' }
[SMS] Twilio response: { sid: 'SM...', status: 'queued' }
```

### **Error: "Twilio credentials not configured"**

- Check `.env` file
- Make sure no extra spaces
- Restart backend

### **Error: "Account not active" or "Trial"**

- Make sure you upgraded account
- Add payment method
- Add credit ($20 minimum)

---

## ✅ **Configuration Checklist**

- [ ] Account upgraded with $20
- [ ] Account SID copied
- [ ] Auth Token copied
- [ ] Phone Number copied
- [ ] `.env` file updated
- [ ] Backend restarted
- [ ] Test reservation created
- [ ] SMS received! 🎉

---

## 📱 **Phone Number Formats**

The system automatically handles UAE numbers:

| You Enter | System Converts To |
|-----------|-------------------|
| `0501234567` | `+971501234567` |
| `971501234567` | `+971501234567` |
| `+971501234567` | `+971501234567` |
| `501234567` | `+971501234567` |

All formats work! ✅

---

## 🎉 **You're All Set!**

**Every reservation now sends SMS automatically!**

Your customers will receive:
- ✅ Instant confirmation
- ✅ Reservation details
- ✅ Confirmation code
- ✅ Professional message

**No more manual follow-ups!** 🚀

---

## 💡 **Tips**

### **Monitor Your Usage:**

Check Twilio console regularly to see:
- Messages sent
- Balance remaining
- When to add more credit

### **Auto-Recharge (Optional):**

Set up auto-recharge in Twilio:
- Go to Billing settings
- Set threshold (e.g., $5)
- Auto-add credit when low

### **Add More Credit:**

When balance is low:
- Go to Twilio Console → Billing
- Click "Add Funds"
- Choose amount
- Confirm

---

## 📊 **Cost Estimates**

| Monthly Reservations | Monthly Cost |
|---------------------|--------------|
| 50 | $1.75 |
| 100 | $3.50 |
| 200 | $7.00 |
| 500 | $17.50 |
| 1000 | $35.00 |

**Reasonable cost for professional service!**

---

## ✅ **Success!**

You now have:
- ✅ Automated SMS confirmations
- ✅ Reliable delivery in UAE
- ✅ Professional communication
- ✅ Working immediately!

**Welcome to automated restaurant reservations!** 🍽️✨


require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// ============================================
// CONFIGURATION – All secrets from Render Env
// ============================================
const API_KEY = process.env.PAYNECTA_API_KEY;
const USER_EMAIL = process.env.PAYNECTA_USER_EMAIL;
const BASE_URL = process.env.PAYNECTA_BASE_URL || 'https://paynecta.co.ke/api/v1';
const STK_URL = process.env.PAYNECTA_STK_URL || `${BASE_URL}/payments/stkpush`; // <-- change if different
const PAYMENT_CODE = process.env.PAYNECTA_PAYMENT_CODE || 'YOUR_PAYMENT_CODE';   // <-- get from dashboard
const CALLBACK_URL = process.env.PAYNECTA_CALLBACK_URL || 'https://stk-push-9ks1.onrender.com/api/webhook';
const FIXED_AMOUNT = 50; // forced 50 KSh

// Headers for all Paynecta requests
const getHeaders = () => ({
    'X-API-Key': API_KEY,
    'X-User-Email': USER_EMAIL,
    'Content-Type': 'application/json',
});

// ============================================
// HELPER: Send real STK Push to ONE phone
// ============================================
const sendStkPush = async (phone, studentName = 'Student', transactionRef = null) => {
    // Clean phone number (remove 0 or +254)
    let cleanPhone = phone.replace(/\s/g, '');
    if (cleanPhone.startsWith('0')) cleanPhone = '254' + cleanPhone.slice(1);
    if (cleanPhone.startsWith('+')) cleanPhone = cleanPhone.slice(1);

    // Generate a unique transaction reference if not provided
    const txnRef = transactionRef || `REG-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

    // ============================================================
    //  THE REAL PAYLOAD – Edit these keys to match your docs
    //  Common keys used by Kenyan APIs:
    //    phone_number, amount, payment_code, transaction_reference
    // ============================================================
    const payload = {
        phone_number: cleanPhone,          // try changing to 'msisdn' or 'customer_phone' if needed
        amount: FIXED_AMOUNT,
        payment_code: PAYMENT_CODE,        // your Paynecta payment link code
        transaction_reference: txnRef,
        callback_url: CALLBACK_URL,        // where Paynecta sends payment confirmation
        // Some APIs also require 'account' or 'description' – add if needed.
    };

    try {
        console.log(`📤 Sending STK Push to ${cleanPhone} for ${studentName} (${FIXED_AMOUNT} KSh)`);
        const response = await axios.post(STK_URL, payload, {
            headers: getHeaders(),
            timeout: 30000, // 30 seconds for M-Pesa
        });

        console.log(`✅ STK sent to ${cleanPhone}`, response.data);
        return {
            success: true,
            data: response.data,
            transaction_ref: txnRef,
        };
    } catch (error) {
        console.error(`❌ STK failed for ${cleanPhone}:`, error.response?.data || error.message);
        return {
            success: false,
            error: error.response?.data || error.message,
            transaction_ref: txnRef,
        };
    }
};

// ============================================
// ENDPOINT 1: Single STK Push
// ============================================
app.post('/api/stk-push', async (req, res) => {
    const { phone, name } = req.body;
    if (!phone) {
        return res.status(400).json({ success: false, message: 'Phone number is required.' });
    }
    const result = await sendStkPush(phone, name || 'Student');
    res.json(result);
});

// ============================================
// ENDPOINT 2: BULK STK Push (Bulk Registration)
// ============================================
app.post('/api/stk-push/bulk', async (req, res) => {
    const { students } = req.body;

    if (!students || !Array.isArray(students) || students.length === 0) {
        return res.status(400).json({
            success: false,
            message: 'Provide a "students" array with at least one student.',
        });
    }

    if (students.length > 50) {
        return res.status(400).json({
            success: false,
            message: 'Maximum 50 students per bulk request to avoid M-Pesa rate limits.',
        });
    }

    const results = [];
    for (const [index, student] of students.entries()) {
        if (index > 0) await new Promise(resolve => setTimeout(resolve, 1500)); // 1.5s delay

        const ref = `BULK-${Date.now()}-${String(index + 1).padStart(3, '0')}`;
        const result = await sendStkPush(student.phone, student.name || `Student ${index + 1}`, ref);
        results.push({
            student: student.name || `Student ${index + 1}`,
            phone: student.phone,
            status: result.success ? 'PENDING' : 'FAILED',
            transaction_ref: result.transaction_ref,
            error: result.error || null,
        });
    }

    res.json({
        success: true,
        message: `Bulk STK Push processed for ${students.length} student(s).`,
        results: results,
    });
});

// ============================================
// ENDPOINT 3: Verify Auth (Test your credentials)
// ============================================
app.get('/api/verify', async (req, res) => {
    try {
        const response = await axios.get(`${BASE_URL}/auth/verify`, {
            headers: getHeaders(),
        });
        res.json({
            success: true,
            message: '✅ Paynecta Auth Successful!',
            data: response.data.data,
        });
    } catch (error) {
        res.status(401).json({
            success: false,
            message: '❌ Auth Failed. Check API Key / Email.',
            error: error.response?.data || error.message,
        });
    }
});

// ============================================
// ENDPOINT 4: Webhook (Paynecta calls this on payment confirmation)
// ============================================
app.post('/api/webhook', (req, res) => {
    console.log('🔔 Webhook received:', req.body);
    // TODO: Update your database – mark student as PAID using transaction_reference.
    res.status(200).send('Webhook received');
});

// Health check
app.get('/health', (req, res) => res.status(200).send('OK'));

// Start server
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));

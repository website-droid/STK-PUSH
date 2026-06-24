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
// CONFIGURATION (Pulls from Render Environment)
// ============================================
const API_KEY = process.env.PAYNECTA_API_KEY;
const USER_EMAIL = process.env.PAYNECTA_USER_EMAIL;
const BASE_URL = process.env.PAYNECTA_BASE_URL || 'https://paynecta.co.ke/api/v1';
const FIXED_AMOUNT = 50; // FORCED 50 KSH

// Headers for ALL Paynecta requests
const getHeaders = () => ({
    'X-API-Key': API_KEY,
    'X-User-Email': USER_EMAIL,
    'Content-Type': 'application/json',
});

// ============================================
// HELPER: Send STK Push to ONE phone
// ============================================
const sendStkPush = async (phone, studentName = 'Student', transactionRef = null) => {
    // Clean phone number (remove 0 or +254)
    let cleanPhone = phone.replace(/\s/g, '');
    if (cleanPhone.startsWith('0')) cleanPhone = '254' + cleanPhone.slice(1);
    if (cleanPhone.startsWith('+')) cleanPhone = cleanPhone.slice(1);

    // ============================================================
    // !!! ACTION REQUIRED - CHANGE THIS PART !!!
    // ============================================================
    // 1. Find the STK Push URL in your Paynecta docs (e.g., /payments/stkpush)
    // 2. Find your "Payment Code" in your Paynecta Dashboard.
    // 3. Replace the placeholder URL and keys below.
    // ============================================================

    // --- SIMULATION MODE (REMOVE THIS BLOCK ONCE YOU HAVE THE DOCS) ---
    console.log(`[SIMULATION] Sending 50 KSh STK to ${cleanPhone} for ${studentName}`);
    return {
        success: true,
        message: 'Simulated: Replace with actual Paynecta call',
        transaction_ref: transactionRef || 'SIM-TXN-123',
        phone: cleanPhone,
    };
    // --- END SIMULATION ---

    /* ===========================================================
       UNCOMMENT THIS BLOCK AND EDIT IT WHEN YOU HAVE THE DOCS:
    const STK_URL = `${BASE_URL}/payments/stkpush`; // <-- EDIT THIS URL
    const PAYMENT_CODE = 'YOUR_PAYMENT_CODE_HERE'; // <-- GET FROM DASHBOARD

    const payload = {
        // EDIT THESE KEYS TO MATCH YOUR PAYNECTA DOCS:
        phone_number: cleanPhone,   // or 'msisdn' or 'customer_phone'
        amount: FIXED_AMOUNT,
        payment_code: PAYMENT_CODE,
        transaction_reference: transactionRef || `REG-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        // callback_url: 'https://your-render-url.onrender.com/api/webhook' // <-- ADD THIS
    };

    try {
        const response = await axios.post(STK_URL, payload, {
            headers: getHeaders(),
            timeout: 30000,
        });
        return {
            success: true,
            data: response.data,
            transaction_ref: payload.transaction_reference,
        };
    } catch (error) {
        console.error(`STK failed for ${cleanPhone}:`, error.response?.data || error.message);
        return {
            success: false,
            error: error.response?.data || error.message,
        };
    }
    =========================================================== */
};

// ============================================
// ENDPOINT 1: Single STK Push (Forced 50 KSh)
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
// ENDPOINT 2: BULK STK Push (For Bulk Registration)
// ============================================
app.post('/api/stk-push/bulk', async (req, res) => {
    const { students } = req.body;

    if (!students || !Array.isArray(students) || students.length === 0) {
        return res.status(400).json({
            success: false,
            message: 'Please provide a "students" array with at least one student.',
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
        // 1.5 second delay between pushes to avoid M-Pesa throttling
        if (index > 0) await new Promise(resolve => setTimeout(resolve, 1500));

        const ref = `BULK-${Date.now()}-${String(index + 1).padStart(3, '0')}`;
        const result = await sendStkPush(student.phone, student.name || `Student ${index + 1}`, ref);
        results.push({
            student: student.name || `Student ${index + 1}`,
            phone: student.phone,
            status: result.success ? 'PENDING' : 'FAILED',
            transaction_ref: result.transaction_ref || null,
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
            message: '✅ Paynecta Auth Successful! Backend is live.',
            data: response.data.data,
        });
    } catch (error) {
        res.status(401).json({
            success: false,
            message: '❌ Auth Failed. Check Render Env Vars.',
            error: error.response?.data || error.message,
        });
    }
});

// ============================================
// ENDPOINT 4: Webhook (Paynecta calls this when payment is confirmed)
// ============================================
app.post('/api/webhook', (req, res) => {
    console.log('🔔 Payment Webhook Received:', req.body);
    // TODO: Update your database (mark student as PAID) using transaction_reference.
    res.status(200).send('Webhook received');
});

// Health Check (for Render)
app.get('/health', (req, res) => res.status(200).send('OK'));

// Start Server
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));

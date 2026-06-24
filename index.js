require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Config
const API_KEY = process.env.PAYNECTA_API_KEY;
const USER_EMAIL = process.env.PAYNECTA_USER_EMAIL;
const BASE_URL = process.env.PAYNECTA_BASE_URL;
const FIXED_AMOUNT = 50; // FORCED 50 KSH

const getHeaders = () => ({
    'X-API-Key': API_KEY,
    'X-User-Email': USER_EMAIL,
    'Content-Type': 'application/json',
});

// ============================================
// Helper: Send STK Push to ONE phone
// ============================================
const sendStkPush = async (phone, studentName = 'Student', transactionRef = null) => {
    // Clean phone number (remove leading 0 or +254)
    let cleanPhone = phone.replace(/\s/g, '');
    if (cleanPhone.startsWith('0')) cleanPhone = '254' + cleanPhone.slice(1);
    if (cleanPhone.startsWith('+')) cleanPhone = cleanPhone.slice(1);

    // ================================================================
    // !!! YOU MUST REPLACE THIS URL AND PAYLOAD KEYS !!!
    // ================================================================
    // Based on typical Paynecta/M-Pesa APIs, the request might look like:
    /*
    const STK_URL = `${BASE_URL}/payments/stkpush`; // <-- CHANGE THIS
    const payload = {
        phone_number: cleanPhone,    // <-- CHANGE KEY if needed (e.g., 'msisdn')
        amount: FIXED_AMOUNT,         // Hardcoded 50
        payment_code: 'YOUR_PAYMENT_CODE', // <-- GET FROM PAYNECTA DASHBOARD
        transaction_reference: transactionRef || `REG-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        // callback_url: 'https://your-render-url.onrender.com/api/webhook' // <-- ADD THIS
    };
    */
    // ================================================================

    // ---- TEMPORARY RETURN TO SIMULATE (REMOVE ONCE YOU GIVE ME DOCS) ----
    console.log(`[SIMULATION] Sending 50 KSh STK to ${cleanPhone} for ${studentName}`);
    return {
        success: true,
        message: 'Simulated: STK Push sent (replace with actual Paynecta call)',
        transaction_ref: transactionRef || 'SIM-TXN-123',
        phone: cleanPhone,
    };
    // ---- END SIMULATION ----

    /* UNCOMMENT THIS BLOCK WHEN YOU HAVE THE DOCS:
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
    */
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
// ENDPOINT 2: BULK STK Push (Multiple Students)
// ============================================
app.post('/api/stk-push/bulk', async (req, res) => {
    const { students } = req.body; // expects [{phone: '0712345678', name: 'John Doe'}, ...]

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
    let delay = 0;

    for (const [index, student] of students.entries()) {
        // Add 1.5 second delay between pushes to avoid M-Pesa throttling
        if (index > 0) {
            await new Promise(resolve => setTimeout(resolve, 1500));
        }

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
        message: `Bulk STK Push processed for ${students.length} student(s). Check individual statuses.`,
        results: results,
    });
});

// ============================================
// ENDPOINT 3: Verify Auth (Test)
// ============================================
app.get('/api/verify', async (req, res) => {
    try {
        const response = await axios.get(`${BASE_URL}/auth/verify`, {
            headers: getHeaders(),
        });
        res.json({
            success: true,
            message: '✅ Paynecta Auth Successful! Your backend is live.',
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
// ENDPOINT 4: Webhook (For Payment Confirmation)
// ============================================
app.post('/api/webhook', (req, res) => {
    // Paynecta will POST here when payment is confirmed/cancelled.
    console.log('🔔 Webhook Received:', req.body);
    // TODO: Update your database (mark student as PAID) using transaction_reference.
    res.status(200).send('Webhook received');
});

// Health Check
app.get('/health', (req, res) => res.status(200).send('OK'));

app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));

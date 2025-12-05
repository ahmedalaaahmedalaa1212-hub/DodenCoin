const express = require('express');
const axios = require('axios');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// --- إعدادات FaucetPay ---
const FAUCETPAY_API_KEY = "ضع_مفتاح_API_الخاص_بك_هنا"; // خذه من FaucetPay Dashboard -> API
const CURRENCY = "USDT"; // العملة

// نقطة استلام طلب السحب
app.post('/withdraw', async (req, res) => {
    const { user_id, address, amount } = req.body;

    console.log(`طلب سحب جديد من: ${user_id} للمحفظة: ${address} المبلغ: ${amount}`);

    // معادلة تحويل النقاط إلى ساتوشي (مثال: كل 1 نقطة = 1000 ساتوشي)
    // يجب عليك حساب هذا بدقة حتى لا تخسر أموالك
    const amountInSatoshi = amount * 1000; 

    try {
        // الاتصال بـ FaucetPay
        const response = await axios.post('https://faucetpay.io/api/v1/send', null, {
            params: {
                api_key: FAUCETPAY_API_KEY,
                amount: amountInSatoshi,
                to: address,
                currency: CURRENCY,
                referral: 'false'
            }
        });

        const data = response.data;

        if (data.status === 200) {
            // نجح الدفع
            res.json({ success: true, message: "تم التحويل", txid: data.payout_id });
        } else {
            // رفض FaucetPay (رصيد غير كاف أو عنوان خطأ)
            res.json({ success: false, message: data.message });
        }

    } catch (error) {
        console.error(error);
        res.json({ success: false, message: "خطأ في الخادم الداخلي" });
    }
});

// تشغيل الخادم
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

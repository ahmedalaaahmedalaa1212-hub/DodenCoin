// --- server.js ---
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const app = express();

app.use(cors());
app.use(express.json());

// ==========================================
// ⚙️ منطقة الإعدادات (عدل الأرقام هنا) ⚙️
// ==========================================
const CONFIG = {
    miningRate: 0.0000012,    // سرعة التعدين: كم عملة Don في الثانية
    miningDuration: 3 * 3600, // مدة التعدين بالثواني (3 ساعات × 3600)
    exchangeRate: 0.01,       // سعر الصرف: 1 Don يساوي كم USDT؟
    minWithdraw: 1.0,         // الحد الأدنى للسحب (USDT)
    referralBonus: 0.10,      // نسبة مكافأة الإحالة (10%)
    faucetPayAPI: "YOUR_API_KEY_HERE", // ضع مفتاح FaucetPay هنا
    currency: "USDT"          // عملة السحب
};

// ==========================================
// 💾 قاعدة البيانات (ملف بسيط JSON)
// ==========================================
const DB_FILE = 'database.json';

// تحميل البيانات عند التشغيل
let users = {};
if (fs.existsSync(DB_FILE)) {
    users = JSON.parse(fs.readFileSync(DB_FILE));
}

// دالة لحفظ البيانات
function saveDB() {
    fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2));
}

// دالة لجلب أو إنشاء مستخدم
function getUser(id) {
    if (!users[id]) {
        users[id] = {
            balance_don: 0,      // رصيد عملة Don
            balance_usdt: 0,     // رصيد USDT
            mining_start: null,  // وقت بدء التعدين
            referrer: null       // من قام بدعوته
        };
        saveDB();
    }
    return users[id];
}

// ------------------------------------------
// 1️⃣ نقطة البيانات (جلب رصيد المستخدم وحالة التعدين)
// ------------------------------------------
app.get('/user/:id', (req, res) => {
    const user = getUser(req.params.id);
    
    // حساب التعدين الحالي (للعرض فقط)
    let pending = 0;
    let isActive = false;
    let remainingTime = 0;

    if (user.mining_start) {
        const now = Date.now();
        const elapsedSeconds = (now - user.mining_start) / 1000;

        if (elapsedSeconds < CONFIG.miningDuration) {
            // التعدين لا يزال يعمل
            pending = elapsedSeconds * CONFIG.miningRate;
            isActive = true;
            remainingTime = CONFIG.miningDuration - elapsedSeconds;
        } else {
            // التعدين انتهى (يجب المطالبة)
            pending = CONFIG.miningDuration * CONFIG.miningRate;
            isActive = false; // انتهى الوقت
            remainingTime = 0;
        }
    }

    res.json({
        balance_don: user.balance_don,
        balance_usdt: user.balance_usdt,
        pending_don: pending,
        is_mining: isActive,
        remaining_seconds: remainingTime,
        config: CONFIG // إرسال الإعدادات للواجهة
    });
});

// ------------------------------------------
// 2️⃣ بدء التعدين
// ------------------------------------------
app.post('/start-mining', (req, res) => {
    const { id } = req.body;
    const user = getUser(id);

    // التأكد أنه لا يعدن حالياً
    if (user.mining_start) {
        const now = Date.now();
        const elapsed = (now - user.mining_start) / 1000;
        if (elapsed < CONFIG.miningDuration) {
            return res.json({ success: false, message: "التعدين يعمل بالفعل!" });
        }
    }

    // إذا كان هناك جلسة سابقة انتهت، يجب المطالبة أولاً (Claim)
    // للتبسيط، سنقوم بالمطالبة التلقائية وبدء جديد
    if (user.mining_start) {
        const profit = CONFIG.miningDuration * CONFIG.miningRate;
        user.balance_don += profit;
    }

    user.mining_start = Date.now(); // تسجيل الوقت الحالي
    saveDB();
    res.json({ success: true, message: "تم بدء التعدين بنجاح ⛏️" });
});

// ------------------------------------------
// 3️⃣ المطالبة (Claim) عند انتهاء الوقت
// ------------------------------------------
app.post('/claim', (req, res) => {
    const { id } = req.body;
    const user = getUser(id);

    if (!user.mining_start) return res.json({ success: false });

    const now = Date.now();
    const elapsed = (now - user.mining_start) / 1000;

    if (elapsed >= CONFIG.miningDuration) {
        const profit = CONFIG.miningDuration * CONFIG.miningRate;
        user.balance_don += profit;
        user.mining_start = null; // تصفير المؤقت
        saveDB();
        res.json({ success: true, balance: user.balance_don });
    } else {
        res.json({ success: false, message: "لم ينته الوقت بعد!" });
    }
});

// ------------------------------------------
// 4️⃣ تحويل العملة (Exchange)
// ------------------------------------------
app.post('/exchange', (req, res) => {
    const { id } = req.body;
    const user = getUser(id);

    if (user.balance_don <= 0) return res.json({ success: false, message: "رصيدك صفر!" });

    const usdtAmount = user.balance_don * CONFIG.exchangeRate;
    user.balance_usdt += usdtAmount;
    user.balance_don = 0; // تصفير الـ Don
    saveDB();

    res.json({ success: true, message: `تم تحويل العملات إلى ${usdtAmount.toFixed(6)} USDT` });
});

// ------------------------------------------
// 5️⃣ السحب (Withdraw) + نظام الإحالة
// ------------------------------------------
app.post('/withdraw', async (req, res) => {
    const { id, address } = req.body;
    const user = getUser(id);

    if (user.balance_usdt < CONFIG.minWithdraw) {
        return res.json({ success: false, message: `الحد الأدنى للسحب هو ${CONFIG.minWithdraw} USDT` });
    }

    // خصم الرصيد أولاً (لتجنب تكرار السحب)
    const amountToWithdraw = user.balance_usdt;
    user.balance_usdt = 0;
    saveDB();

    try {
        // إرسال مكافأة الإحالة (إذا وجد)
        if (user.referrer && users[user.referrer]) {
            const bonus = amountToWithdraw * CONFIG.referralBonus;
            users[user.referrer].balance_usdt += bonus; // إضافة البونص للمحفظة USDT مباشرة
            console.log(`تم إضافة بونص ${bonus} للمستخدم ${user.referrer}`);
        }

        // الاتصال بـ FaucetPay
        const response = await axios.post('https://faucetpay.io/api/v1/send', null, {
            params: {
                api_key: CONFIG.faucetPayAPI,
                amount: amountToWithdraw * 100000000, // تحويل لساتوشي إذا لزم (تأكد من وثائق العملة)
                to: address,
                currency: CONFIG.currency,
                referral: 'false'
            }
        });

        if (response.data.status === 200) {
            saveDB(); // حفظ نهائي
            res.json({ success: true, message: "تم السحب بنجاح!" });
        } else {
            // فشل السحب، إعادة الرصيد
            user.balance_usdt = amountToWithdraw;
            saveDB();
            res.json({ success: false, message: response.data.message });
        }

    } catch (error) {
        user.balance_usdt = amountToWithdraw; // استرجاع الرصيد في حالة الخطأ
        saveDB();
        res.json({ success: false, message: "خطأ في الاتصال بـ FaucetPay" });
    }
});

// تسجيل الإحالة (عند دخول البوت لأول مرة)
app.post('/set-referrer', (req, res) => {
    const { id, ref_id } = req.body;
    const user = getUser(id);
    // إذا لم يكن لديه أب روحي، وكان الرمز صالحاً وليس نفسه
    if (!user.referrer && ref_id && ref_id != id && users[ref_id]) {
        user.referrer = ref_id;
        saveDB();
    }
    res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});


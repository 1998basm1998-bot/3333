import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, query, where, enableIndexedDbPersistence, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";
import { firebaseConfig, hashPass } from './config.js';

// تهيئة التطبيق مع دعم الأوفلاين
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// تفعيل العمل بدون انترنت (Offline Persistence)
enableIndexedDbPersistence(db).catch((err) => {
    console.log("Offline mode error:", err.code);
});

// متغيرات عامة
let currentCustomer = null;
let currentTransType = '';
let allCustomers = [];

// === دوال GSAP للأنميشن ===
function initAnimations() {
    gsap.utils.toArray('.gsap-btn').forEach(btn => {
        btn.addEventListener('mouseenter', () => gsap.to(btn, { scale: 1.05, duration: 0.2, ease: "power1.out" }));
        btn.addEventListener('mouseleave', () => gsap.to(btn, { scale: 1, duration: 0.2 }));
        btn.addEventListener('click', () => {
            gsap.to(btn, { rotationY: 360, duration: 0.6, ease: "back.out(1.7)" });
        });
    });

    gsap.utils.toArray('.gsap-input').forEach(input => {
        input.addEventListener('focus', () => gsap.to(input, { scale: 1.02, borderColor: "#27ae60", duration: 0.3 }));
        input.addEventListener('blur', () => gsap.to(input, { scale: 1, borderColor: "rgba(0,0,0,0.1)", duration: 0.3 }));
    });
}

// === إدارة الدخول ===
window.checkAdminLogin = function() {
    const passInput = document.getElementById('adminPassInput').value;
    const storeInput = document.getElementById('storeNameInput').value;
    const storedPass = localStorage.getItem('admin_pass');
    
    if(storeInput) localStorage.setItem('store_name', storeInput);

    let isValid = false;
    // أول مرة 1234
    if (!storedPass) {
        if (passInput === '1234') {
            localStorage.setItem('admin_pass', hashPass('1234'));
            isValid = true;
        } else {
            document.getElementById('loginMsg').innerText = "كلمة المرور الافتراضية: 1234";
        }
    } else {
        if (hashPass(passInput) === storedPass) isValid = true;
        else document.getElementById('loginMsg').innerText = "خطأ في كلمة المرور";
    }

    if (isValid) {
        unlockApp();
    }
}

function unlockApp() {
    gsap.to("#lock-screen", { y: "-100%", duration: 1, ease: "power2.inOut" });
    document.getElementById('app').classList.remove('hidden');
    const storeName = localStorage.getItem('store_name');
    if(storeName) document.getElementById('headerStoreName').innerText = storeName;
    
    loadDashboard();
    loadSettings(); // تحميل رقم الواتساب من الفايربيس
    initAnimations();
}

// === البيانات والمنطق ===
async function loadDashboard() {
    try {
        const custSnapshot = await getDocs(collection(db, "customers"));
        allCustomers = custSnapshot.docs.map(doc => ({ firebaseId: doc.id, ...doc.data() }));
        
        const transSnapshot = await getDocs(collection(db, "transactions"));
        const transactions = transSnapshot.docs.map(doc => ({ firebaseId: doc.id, ...doc.data() }));

        let totalDebt = 0;
        const now = new Date();
        const overdueList = [];

        allCustomers.forEach(c => {
            c.balance = 0;
            const myTrans = transactions.filter(t => t.customerId === c.id);
            
            // حساب الرصيد
            myTrans.forEach(t => {
                if (t.type === 'debt' || t.type === 'sale') c.balance += parseFloat(t.amount);
                if (t.type === 'payment') c.balance -= parseFloat(t.amount);
            });
            
            // منطق التنبيه (Overdue Logic)
            if(myTrans.length > 0 && c.balance > 0) {
                myTrans.sort((a,b) => new Date(b.date) - new Date(a.date)); // الأحدث أولاً
                c.lastDate = myTrans[0].date; // تاريخ آخر حركة
                
                // نحسب تاريخ أول دين لم يسدد بالكامل (للتبسيط سنعتمد على تاريخ آخر حركة + أيام السماح)
                const lastTransDate = new Date(c.lastDate);
                const diffTime = Math.abs(now - lastTransDate);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
                
                const reminderDays = parseInt(c.reminderDays || 30); // الافتراضي 30 يوم
                
                if (diffDays >= reminderDays) {
                    c.isOverdue = true;
                    overdueList.push(c);
                } else {
                    c.isOverdue = false;
                }
            } else {
                c.isOverdue = false;
            }
        });

        totalDebt = allCustomers.reduce((sum, c) => sum + c.balance, 0);

        document.getElementById('totalDebt').innerText = formatCurrency(totalDebt, 'IQD');
        document.getElementById('customerCount').innerText = allCustomers.length;
        renderCustomersList(allCustomers);
        renderNotifications(overdueList);

    } catch (error) {
        console.error("Error:", error);
    }
}

function renderNotifications(list) {
    const container = document.getElementById('alertsList');
    const badge = document.getElementById('badge-alert');
    
    container.innerHTML = '';
    
    if(list.length > 0) {
        badge.classList.remove('hidden');
        badge.innerText = list.length;
        
        list.forEach(c => {
            const div = document.createElement('div');
            div.className = 'card glass';
            div.style.borderRight = '5px solid orange';
            div.innerHTML = `
                <div class="flex flex-between">
                    <strong>⚠️ ${c.name}</strong>
                    <span>${formatCurrency(c.balance, c.currency)}</span>
                </div>
                <small>تجاوز فترة السماح (${c.reminderDays || 30} يوم)</small><br>
                <button class="btn btn-sm btn-primary mt-2" onclick="openCustomer('${c.id}')">مراجعة</button>
            `;
            container.appendChild(div);
        });
    } else {
        badge.classList.add('hidden');
        container.innerHTML = '<p class="text-center">لا توجد تنبيهات مستحقة ✅</p>';
    }
}

// إضافة زبون
window.addCustomer = async function() {
    const name = document.getElementById('newCustName').value;
    const phone = document.getElementById('newCustPhone').value;
    const currency = document.getElementById('newCustCurrency').value;
    const reminderDays = document.getElementById('newCustReminder').value;
    const pass = document.getElementById('newCustPass').value;
    
    if(!name) return alert('الاسم مطلوب');

    const id = Date.now().toString(); // ID للربط

    const customer = {
        id: id,
        name,
        phone,
        currency,
        reminderDays: reminderDays || 30, // حفظ أيام التنبيه
        passHash: pass ? hashPass(pass) : null,
        created: new Date().toISOString()
    };

    try {
        await addDoc(collection(db, "customers"), customer);
        window.closeModal('modal-add-customer');
        loadDashboard();
    } catch (e) {
        alert("خطأ: " + e.message);
    }
}

// === فتح الزبون والعمليات ===
window.openCustomer = async function(id) {
    // (نفس الكود السابق مع تحديث بسيط لجلب العمليات)
    // نستخدم المتغير allCustomers المحمل مسبقاً للسرعة
    const customer = allCustomers.find(c => c.id == id);
    if (!customer) return;
    
    currentCustomer = customer;
    
    // جلب العمليات
    const q = query(collection(db, "transactions"), where("customerId", "==", id));
    const snap = await getDocs(q);
    const trans = snap.docs.map(d => ({firebaseId: d.id, ...d.data()}));
    
    trans.sort((a,b) => new Date(b.date) - new Date(a.date));

    document.getElementById('view-customer').classList.remove('hidden');
    gsap.from("#view-customer .container", { scale: 0.8, opacity: 0, duration: 0.4 });

    document.getElementById('custName').innerText = customer.name;
    document.getElementById('custBalance').innerText = formatCurrency(customer.balance, customer.currency);
    
    // رابط الزبون
    const url = `${window.location.origin}${window.location.pathname.replace('index.html', '')}customer.html?id=${id}`;
    document.getElementById('custLink').value = url;

    renderTransactions(trans, customer.currency);
}

// ... دوال الحفظ والحذف (مشابهة للسابق لكن تأكد من استخدام currentCustomer.id) ...
window.saveTransaction = async function() {
    const amount = parseFloat(document.getElementById('transAmount').value);
    const note = document.getElementById('transNote').value;
    const item = document.getElementById('transItem').value;
    const date = document.getElementById('transDate').value || new Date().toISOString().split('T')[0];
    
    if(!amount) return alert('المبلغ مطلوب');

    const trans = {
        customerId: currentCustomer.id,
        type: currentTransType,
        amount,
        note,
        item,
        date,
        timestamp: new Date().toISOString()
    };

    await addDoc(collection(db, "transactions"), trans);
    closeModal('modal-transaction');
    openCustomer(currentCustomer.id); // تحديث
    loadDashboard(); // تحديث الخلفية
}

// === إعدادات المتجر (الواتساب المركزي) ===
window.saveStoreSettings = async function() {
    const wa = document.getElementById('storeWhatsapp').value;
    if(!wa) return;
    try {
        // نخزنها في مستند ثابت ID = info
        await setDoc(doc(db, "settings", "info"), { whatsapp: wa }, { merge: true });
        alert("تم حفظ رقم الواتساب المالي بنجاح");
    } catch(e) {
        alert("خطأ في الحفظ");
    }
}

async function loadSettings() {
    const docSnap = await getDoc(doc(db, "settings", "info"));
    if (docSnap.exists()) {
        document.getElementById('storeWhatsapp').value = docSnap.data().whatsapp || '';
    }
}

// === تغيير كلمة المرور الحقيقي ===
window.changeAdminPassReal = function() {
    const old = document.getElementById('oldPass').value;
    const newP = document.getElementById('newPass').value;
    const confP = document.getElementById('confirmPass').value;
    const currentStored = localStorage.getItem('admin_pass');

    if(hashPass(old) !== currentStored) return alert("كلمة المرور الحالية خطأ");
    if(newP !== confP) return alert("كلمة المرور الجديدة غير متطابقة");
    if(newP.length < 4) return alert("كلمة المرور ضعيفة");

    localStorage.setItem('admin_pass', hashPass(newP));
    alert("تم التغيير بنجاح. سيتم تسجيل الخروج.");
    location.reload();
}

// Helpers
window.formatCurrency = (n, c) => c === 'USD' ? `$${Number(n).toLocaleString()}` : `${Number(n).toLocaleString()} د.ع`;
window.showModal = (id) => {
    document.getElementById(id).classList.remove('hidden');
    gsap.from("#" + id + " .modal-content", { y: -50, opacity: 0, duration: 0.3 });
};
window.closeModal = (id) => document.getElementById(id).classList.add('hidden');
window.logout = () => location.reload();
window.switchTab = (id, btn) => {
    document.querySelectorAll('.tab-content').forEach(d => d.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    gsap.from("#" + id, { x: 20, opacity: 0, duration: 0.3 });
}
// Render Transactions Function (يجب إضافتها هنا)
function renderTransactions(transactions, currency) {
    const list = document.getElementById('transactionsList');
    list.innerHTML = '';
    transactions.forEach(t => {
        const div = document.createElement('div');
        div.className = 'trans-item flex flex-between';
        let colorClass = (t.type === 'payment') ? 'trans-pay' : 'trans-debt';
        let typeName = t.type === 'debt' ? 'دين' : (t.type === 'payment' ? 'تسديد' : 'فاتورة');
        div.innerHTML = `
            <div><strong class="${colorClass}">${typeName}</strong> <small>${t.item || ''}</small><br><small>${t.date}</small></div>
            <strong class="${colorClass}">${window.formatCurrency(t.amount, currency)}</strong>
        `;
        list.appendChild(div);
    });
}

// مراقبة حالة الانترنت
window.addEventListener('online', () => document.getElementById('onlineStatus').innerText = "متصل 🟢");
window.addEventListener('offline', () => document.getElementById('onlineStatus').innerText = "غير متصل (يعمل محلياً) 🔴");

// بدء التشغيل
if(localStorage.getItem('admin_pass')) { /* Already Locked */ }

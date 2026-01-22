import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, query, where, enableIndexedDbPersistence, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { firebaseConfig, hashPass } from './config.js';

// تهيئة التطبيق
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// محاولة تفعيل الأوفلاين (بدون إيقاف التطبيق إذا فشل)
try {
    enableIndexedDbPersistence(db).catch((err) => {
        console.log("Offline mode disabled:", err.code);
    });
} catch (e) { console.log("Persistence error"); }

let currentCustomer = null;
let currentTransType = '';
let allCustomers = [];

// === دوال GSAP ===
function initAnimations() {
    if(typeof gsap !== 'undefined') {
        gsap.utils.toArray('.gsap-btn').forEach(btn => {
            btn.addEventListener('mouseenter', () => gsap.to(btn, { scale: 1.05, duration: 0.2 }));
            btn.addEventListener('mouseleave', () => gsap.to(btn, { scale: 1, duration: 0.2 }));
        });
    }
}

// === تسجيل الدخول ===
window.checkAdminLogin = function() {
    const passInput = document.getElementById('adminPassInput').value;
    const storeInput = document.getElementById('storeNameInput').value;
    const storedPass = localStorage.getItem('admin_pass');
    
    if(storeInput) localStorage.setItem('store_name', storeInput);

    if (!storedPass) {
        if (passInput === '1234') {
            localStorage.setItem('admin_pass', hashPass('1234'));
            unlockApp();
        } else {
            alert("كلمة المرور الافتراضية لأول مرة هي: 1234");
        }
    } else {
        if (hashPass(passInput) === storedPass) unlockApp();
        else alert("كلمة المرور خاطئة");
    }
}

function unlockApp() {
    document.getElementById('lock-screen').style.display = 'none';
    document.getElementById('app').classList.remove('hidden');
    const storeName = localStorage.getItem('store_name');
    if(storeName) document.getElementById('headerStoreName').innerText = storeName;
    loadDashboard();
    initAnimations();
}

// === الدالة الرئيسية (تم تحسينها لكشف الأخطاء) ===
async function loadDashboard() {
    try {
        // جلب الزبائن
        const custSnapshot = await getDocs(collection(db, "customers"));
        allCustomers = custSnapshot.docs.map(doc => ({ firebaseId: doc.id, ...doc.data() }));
        
        // جلب العمليات
        const transSnapshot = await getDocs(collection(db, "transactions"));
        const transactions = transSnapshot.docs.map(doc => ({ firebaseId: doc.id, ...doc.data() }));

        let totalDebt = 0;
        const now = new Date();
        const overdueList = [];

        allCustomers.forEach(c => {
            c.balance = 0;
            const myTrans = transactions.filter(t => t.customerId === c.id);
            
            myTrans.forEach(t => {
                const amt = parseFloat(t.amount) || 0;
                if (t.type === 'debt' || t.type === 'sale') c.balance += amt;
                if (t.type === 'payment') c.balance -= amt;
            });
            
            // حساب التنبيهات
            if(myTrans.length > 0 && c.balance > 0) {
                myTrans.sort((a,b) => new Date(b.date) - new Date(a.date));
                c.lastDate = myTrans[0].date;
                
                const lastTransDate = new Date(c.lastDate);
                // التحقق من صحة التاريخ
                if(!isNaN(lastTransDate)) {
                    const diffTime = Math.abs(now - lastTransDate);
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
                    const reminderDays = parseInt(c.reminderDays || 30);
                    
                    if (diffDays >= reminderDays) {
                        c.isOverdue = true;
                        overdueList.push(c);
                    } else {
                        c.isOverdue = false;
                    }
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
        console.error(error);
        alert("حدث خطأ أثناء تحميل البيانات:\n" + error.message);
        document.getElementById('customersList').innerHTML = `<p style="color:red">حدث خطأ: ${error.message}</p>`;
    }
}

function renderCustomersList(customers) {
    const list = document.getElementById('customersList');
    list.innerHTML = '';
    
    if(customers.length === 0) {
        list.innerHTML = '<p style="text-align:center">لا يوجد زبائن حالياً</p>';
        return;
    }

    customers.forEach(c => {
        const div = document.createElement('div');
        div.className = 'card glass flex flex-between';
        div.style.cursor = 'pointer';
        div.onclick = () => openCustomer(c.id);
        
        // أيقونة التنبيه
        let alertIcon = c.isOverdue ? '⚠️' : '';
        let balanceColor = c.balance > 0 ? 'var(--danger)' : 'var(--accent)';

        div.innerHTML = `
            <div>
                <strong>${c.name} ${alertIcon}</strong><br>
                <small>${c.phone || ''}</small>
            </div>
            <div style="text-align:left">
                <span style="font-weight:bold; color:${balanceColor}">${formatCurrency(c.balance, c.currency)}</span><br>
                <small style="font-size:0.7em; color:#666">${c.lastDate || 'جديد'}</small>
            </div>
        `;
        list.appendChild(div);
    });
}

function renderNotifications(list) {
    const container = document.getElementById('alertsList');
    const badge = document.getElementById('badge-alert');
    if(!container || !badge) return;

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
                <small>تجاوز ${c.reminderDays || 30} يوم</small><br>
                <button class="btn btn-sm btn-primary mt-2" onclick="openCustomer('${c.id}')">مراجعة</button>
            `;
            container.appendChild(div);
        });
    } else {
        badge.classList.add('hidden');
        container.innerHTML = '<p class="text-center">لا توجد تنبيهات ✅</p>';
    }
}

// === إضافة زبون ===
window.addCustomer = async function() {
    const name = document.getElementById('newCustName').value;
    const phone = document.getElementById('newCustPhone').value;
    const currency = document.getElementById('newCustCurrency').value;
    const reminderDays = document.getElementById('newCustReminder').value;
    
    if(!name) return alert('الاسم مطلوب');

    const id = Date.now().toString(); 

    try {
        await addDoc(collection(db, "customers"), {
            id, name, phone, currency, 
            reminderDays: reminderDays || 30,
            created: new Date().toISOString()
        });
        window.closeModal('modal-add-customer');
        loadDashboard();
    } catch (e) { alert("خطأ: " + e.message); }
}

// === فتح زبون ===
window.openCustomer = async function(id) {
    const customer = allCustomers.find(c => c.id == id);
    if (!customer) return;
    currentCustomer = customer;
    
    // جلب حركات الزبون فقط
    const q = query(collection(db, "transactions"), where("customerId", "==", id));
    const snap = await getDocs(q);
    const trans = snap.docs.map(d => ({firebaseId: d.id, ...d.data()}));
    trans.sort((a,b) => new Date(b.date) - new Date(a.date));

    document.getElementById('view-customer').classList.remove('hidden');
    document.getElementById('custName').innerText = customer.name;
    document.getElementById('custBalance').innerText = formatCurrency(customer.balance, customer.currency);
    
    const url = `${window.location.origin}${window.location.pathname.replace('index.html', '')}customer.html?id=${id}`;
    document.getElementById('custLink').value = url;

    renderTransactions(trans, customer.currency);
}

// === العمليات المساعدة ===
window.formatCurrency = function(n, c) {
    const num = parseFloat(n) || 0;
    return c === 'USD' ? `$${num.toLocaleString()}` : `${num.toLocaleString()} د.ع`;
}

window.showModal = (id) => document.getElementById(id).classList.remove('hidden');
window.closeModal = (id) => document.getElementById(id).classList.add('hidden');
window.goHome = () => { document.getElementById('view-customer').classList.add('hidden'); loadDashboard(); };
window.switchTab = (id, btn) => {
    document.querySelectorAll('.tab-content').forEach(d => d.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}

window.copyLink = function() {
    const copyText = document.getElementById("custLink");
    copyText.select();
    document.execCommand("copy");
    alert("تم نسخ الرابط");
}

window.openTransModal = function(type) {
    currentTransType = type;
    document.getElementById('transTitle').innerText = type === 'debt' ? 'إضافة دين' : (type === 'payment' ? 'تسديد' : 'بيع');
    document.getElementById('transDate').valueAsDate = new Date();
    document.getElementById('transAmount').value = '';
    window.showModal('modal-transaction');
}

window.saveTransaction = async function() {
    const amount = parseFloat(document.getElementById('transAmount').value);
    const note = document.getElementById('transNote').value;
    const item = document.getElementById('transItem').value;
    const date = document.getElementById('transDate').value;

    if(!amount) return alert("أدخل المبلغ");

    await addDoc(collection(db, "transactions"), {
        customerId: currentCustomer.id,
        type: currentTransType,
        amount, note, item, date,
        timestamp: new Date().toISOString()
    });
    
    closeModal('modal-transaction');
    openCustomer(currentCustomer.id); 
    loadDashboard();
}

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

// تشغيل عند البدء
if(localStorage.getItem('admin_pass')) {
    // Already set up
}

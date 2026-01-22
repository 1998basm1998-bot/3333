import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { getFirestore, collection, getDocs, query, where, getDoc, doc } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";
import { firebaseConfig, hashPass } from './config.js';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// استخراج ID من الرابط
const urlParams = new URLSearchParams(window.location.search);
const custId = urlParams.get('id');

// التحقق من الدخول المحفوظ
window.onload = async () => {
    if(localStorage.getItem(`cust_login_${custId}`)) {
        verifyCustomer(true);
    }
    
    // جلب رقم الواتساب من الإعدادات العامة
    try {
        const settingsSnap = await getDoc(doc(db, "settings", "info"));
        if(settingsSnap.exists() && settingsSnap.data().whatsapp) {
            const wa = settingsSnap.data().whatsapp;
            document.getElementById('financeWaLink').href = `https://wa.me/${wa}`;
        } else {
            document.getElementById('financeWaLink').style.display = 'none';
        }
    } catch(e) { console.log("No settings"); }
    
    // أنميشن بسيط
    gsap.from(".gsap-target", {y: 20, opacity: 0, stagger: 0.1});
};

window.verifyCustomer = async function(isAuto = false) {
    const passInput = document.getElementById('custPassInput').value;
    const msg = document.getElementById('msg');
    
    msg.innerText = "جاري التحقق...";
    
    try {
        const q = query(collection(db, "customers"), where("id", "==", custId));
        const snapshot = await getDocs(q);
        
        if (snapshot.empty) return msg.innerText = "رابط غير صالح";
        
        const data = snapshot.docs[0].data();
        
        // التحقق من الباسورد (إذا كان موجوداً)
        if (!isAuto && data.passHash && hashPass(passInput) !== data.passHash) {
            return msg.innerText = "كلمة المرور خطأ";
        }

        // حفظ الدخول للمستقبل
        localStorage.setItem(`cust_login_${custId}`, 'true');

        // عرض البيانات
        document.getElementById('cust-login').classList.add('hidden');
        document.getElementById('cust-view').classList.remove('hidden');
        gsap.from("#cust-view", { opacity: 0, scale: 0.9 });

        document.getElementById('cName').innerText = data.name;

        // جلب العمليات والحساب
        const transQ = query(collection(db, "transactions"), where("customerId", "==", custId));
        const transSnap = await getDocs(transQ);
        const trans = transSnap.docs.map(d => d.data());
        
        let balance = 0;
        trans.forEach(t => {
            if (t.type === 'debt' || t.type === 'sale') balance += parseFloat(t.amount);
            else balance -= parseFloat(t.amount);
        });

        document.getElementById('cBalance').innerText = balance.toLocaleString() + ' ' + (data.currency || 'IQD');
        
        // التحقق من التنبيهات
        const lastDate = trans.length > 0 ? trans.sort((a,b)=> new Date(b.date)-new Date(a.date))[0].date : null;
        if(lastDate && balance > 0) {
            const diff = Math.ceil(Math.abs(new Date() - new Date(lastDate)) / (1000 * 60 * 60 * 24));
            if(diff > (data.reminderDays || 30)) {
                document.getElementById('paymentAlert').classList.remove('hidden');
                gsap.from("#paymentAlert", { x: -20, duration: 0.5, ease: "elastic" });
            }
        }

        // عرض القائمة
        const list = document.getElementById('cTransList');
        trans.sort((a,b) => new Date(b.date) - new Date(a.date));
        trans.forEach(t => {
            const div = document.createElement('div');
            div.className = 'trans-item flex flex-between';
            div.style.borderBottom = '1px solid #eee';
            let color = t.type === 'payment' ? 'green' : 'red';
            let typeName = t.type === 'debt' ? 'دين' : (t.type === 'payment' ? 'تسديد' : 'فاتورة');
            
            div.innerHTML = `
                <div><strong>${typeName}</strong> <small>${t.item || ''}</small><br><small style="color:#888">${t.date}</small></div>
                <strong style="color:${color}">${t.amount.toLocaleString()}</strong>
            `;
            list.appendChild(div);
        });

    } catch (e) {
        msg.innerText = "خطأ في الاتصال";
    }
}

// إعدادات Firebase (معرّف عام بطبيعته — الحماية الفعلية في قواعد الأمان firestore.rules)
export const firebaseConfig = {
  apiKey: 'AIzaSyBHCDd-0hm1jZsOg5_yG03_PWgGfyB0VxQ',
  authDomain: 'eha-minya-doctors-pms.firebaseapp.com',
  projectId: 'eha-minya-doctors-pms',
  storageBucket: 'eha-minya-doctors-pms.firebasestorage.app',
  messagingSenderId: '904776635573',
  appId: '1:904776635573:web:cff4ed7f25d19583f8dafc',
};

// وضع التجربة (بيانات وهمية في المتصفح) لو الرابط فيه ?demo
export const DEMO = new URLSearchParams(location.search).has('demo');

// الدومين الوهمي اللي بيتحول له الرقم القومي علشان تسجيل الدخول
export const LOGIN_DOMAIN = 'pms.eha-minya.app';

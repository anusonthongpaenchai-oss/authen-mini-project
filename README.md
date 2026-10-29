# Authentication & Role-Based Access Mini Project

โปรเจกต์เริ่มต้นสำหรับพัฒนาระบบ Authentication และ Role-Based Access ด้วย Angular, Express/TypeScript และ SQLite

## เริ่มใช้งาน

```bash
cd backend
npm install
npm run db:init
npm run dev
```

เปิดอีก terminal:

```bash
cd frontend
npm install
ng serve
```

เปิด `http://localhost:4200/health-check` เพื่อตรวจ Backend และ SQLite ผ่าน `http://localhost:3000/api/health` ฐานข้อมูลอยู่ใน `backend/src/db/auth.sqlite` และถูก ignore จาก Git

ใช้ `npm run build` ในแต่ละโฟลเดอร์เพื่อตรวจ build และ `npm test -- --watch=false` ใน `frontend` เพื่อรันทดสอบ Angular

## โครงสร้าง

Backend แบ่ง `db`, `routes`, `controllers`, `services`, `models` และ `middlewares` ตามหน้าที่ Frontend จัดหน้าไว้ใน `pages` และเตรียม `core/auth` สำหรับระบบยืนยันตัวตนที่จะพัฒนาต่อ

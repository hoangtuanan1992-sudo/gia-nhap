# Deploy len cPanel voi MySQL

## 1. Tao MySQL tren cPanel

Vao cPanel -> MySQL Database Wizard:

- Tao database, vi du: `ai_product_sheet`
- Tao user, vi du: `ai_product_user`
- Gan user vao database voi quyen `All Privileges`

cPanel thuong tu them prefix, vi du:

- `hoangan_ai_product_sheet`
- `hoangan_ai_product_user`

## 2. Tao Node.js App

Vao cPanel -> Setup Node.js App:

- Node version: 20 hoac 22
- Application mode: Production
- Application root: thu muc clone project
- Startup file: `server/index.js`

## 3. Them Environment Variables

Trong Node.js App, them:

```env
NODE_ENV=production
DB_HOST=localhost
DB_PORT=3306
DB_NAME=ten_database_day_du
DB_USER=ten_user_day_du
DB_PASSWORD=mat_khau_mysql
DEFAULT_ADMIN_PASSWORD=mat_khau_admin_manh
```

## 4. Chay lenh trong Terminal cPanel

Vao dung thu muc project roi chay:

```bash
npm install
npm run build
npm run db:migrate
npm start
```

Neu dung giao dien Node.js App cua cPanel, sau khi chay 3 lenh dau thi bam `Restart App`.

## 5. Dang nhap lan dau

- Username: `admin`
- Password: gia tri cua `DEFAULT_ADMIN_PASSWORD`

Neu khong dat `DEFAULT_ADMIN_PASSWORD`, mat khau mac dinh la `admin123`.

## Ghi chu

- Khi co `DB_HOST`, `DB_NAME`, `DB_USER`, app se dung MySQL.
- Khi khong co cac bien DB, app van chay local bang file JSON trong `server/data`.
- Shop moi tao se co du lieu rieng va trong: API, Sheets, nha cung cap, gia bien, san pham.

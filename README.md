# AI Product Sheet

Trang web gồm khung chat AI, khu cài đặt prompt và bảng sản phẩm có thể ghi vào Google Sheets.

## Chạy thử

```bash
npm install
npm run dev
```

Mở `http://127.0.0.1:5173`.

Nếu chưa điền khóa API, app vẫn chạy bằng bảng cục bộ tại `server/data/products.json`.

## Cấu hình OpenAI

Bạn có thể mở trang `Cài đặt` trong giao diện để nhập OpenAI API key, quét danh sách model và chọn model đang dùng. Cấu hình nhập trong giao diện chỉ được giữ trong server local đang chạy.

Hoặc tạo file `.env` từ `.env.example`, sau đó điền:

```bash
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4.1-mini
```

Backend dùng OpenAI Responses API với structured output để luôn trả về các cột:

- Mã sản phẩm
- Tên sản phẩm
- Giá nhập
- Giá bán
- Link web
- Nhà cung cấp
- Kho NCC
- Ghi chú

App cũng hiểu dữ liệu bảng giá nhà cung cấp dạng copy từ Excel: tiêu đề nhóm bắt đầu bằng `✅`, dòng phân cách `***`, cột giá dạng `4,250`, ghi chú như `quà` hoặc `XK -100K`, và tồn kho như `Có 1c`.

## Cấu hình Google Sheets

1. Tạo Google Sheet và tab tên `Products`.
2. Tạo service account trong Google Cloud.
3. Share Google Sheet cho email service account với quyền Editor.
4. Điền `.env`:

```bash
GOOGLE_SHEET_ID=your_sheet_id
GOOGLE_SHEET_TAB=Products
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-service-account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

Bạn cũng có thể dùng file JSON service account:

```bash
GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\service-account.json
```

Sau khi đổi `.env`, dừng server và chạy lại `npm run dev`.

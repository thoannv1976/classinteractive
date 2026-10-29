# Kết quả kiểm thử – đối chiếu tiêu chí nghiệm thu

Môi trường: Firebase Emulator Suite (Auth + Firestore), Node.js 22, Chromium (Playwright).
Chạy lại toàn bộ: `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:emulator && pnpm test:e2e`.

| # | Kịch bản (mục 56) | Kiểm thử tự động | Kết quả |
|---|---|---|---|
| 1 | Admin/GV import danh sách, SV dùng mã có sẵn tự đặt mật khẩu | `api.int.test.ts` "Test 1/2/3", E2E "Test 1–4" | Đạt |
| 2 | Đăng nhập chỉ bằng mã SV + mật khẩu | `api.int.test.ts`, E2E | Đạt |
| 3 | Không tạo được tài khoản thứ hai cho cùng mã SV | `api.int.test.ts`, E2E | Đạt |
| 4 | SV chỉ thấy lớp được gán, không vào được lớp khác | `api.int.test.ts` "Test 4", `firestore.rules.test.ts`, E2E | Đạt |
| 5 | GV mở buổi, SV vào và hỏi; GV thấy ngay không cần tải lại | `api.int.test.ts` "Test 5", E2E "Test 5–6" (listener realtime) | Đạt |
| 6 | Hỏi – SV khác trả lời – GV duyệt; lưu đúng người, lớp, buổi, chủ đề | `api.int.test.ts` "Test 6", E2E | Đạt |
| 7 | Đếm đúng, không cộng trùng khi gửi lại | `api.int.test.ts` "Test 7" (cùng `clientRequestId`), E2E | Đạt |
| 8 | GV nhấn AI trả lời; ghi lịch sử, nguồn, token | `api.int.test.ts` "Test 8" (AI mô phỏng), E2E | Đạt* |
| 9 | Tổng hợp câu hỏi/trả lời theo chủ đề, xem nguồn, chỉnh nhóm | `api.int.test.ts` (analytics/topics), giao diện Chủ đề + Đổi chủ đề | Đạt |
| 10 | GV tải Excel thống kê | `api.int.test.ts` "Test 10" (XLSX hợp lệ, CSV, SV bị từ chối) | Đạt |
| 11 | Khóa SV: không đăng nhập mới, phiên cũ bị chặn | `api.int.test.ts` "Test 11", E2E "Test 11–12" | Đạt |
| 12 | SV không sửa số liệu, không đọc dữ liệu GV, không gọi API quản trị | `api.int.test.ts` "Test 12", `firestore.rules.test.ts` | Đạt |
| 13 | Quy trình chính chạy trên điện thoại/tablet/laptop | E2E dự án `mobile` (Pixel 7) + `desktop`; kiểm tra không tràn ngang | Đạt |
| 14 | Một nhà cung cấp AI lỗi, lớp học vẫn chạy, báo lỗi phù hợp | `api.int.test.ts` "Test 14" | Đạt |
| 15 | Số liệu khớp tính toán độc lập theo công thức | `api.int.test.ts` "Test 15", `permissions.test.ts` | Đạt |

\* Với AI thật: cần API key trong Secret Manager. Đường gọi Claude/OpenAI/Gemini đã được typecheck với SDK chính thức nhưng chưa gọi thử bằng key thật trong môi trường phát triển (không có key). Sau khi thêm key, thử tại một câu hỏi bất kỳ: **⋯ → AI đề xuất trả lời**.

## Số lượng

| Bộ test | Số test | Kết quả |
|---|---|---|
| Unit – `packages/shared` | 10 | Đạt |
| Unit – `apps/api` (đọc file danh sách CSV/XLSX) | 4 | Đạt |
| Unit – `apps/web` | 3 | Đạt |
| Integration – API trên Emulator | 22 | Đạt |
| Security Rules | 8 | Đạt |
| E2E Playwright (desktop + mobile) | 8 | Đạt |

## Chưa kiểm thử

- Tải 100–500 người dùng đồng thời (mục 50): cần môi trường staging trên GCP. Thiết kế đã giới hạn listener, dùng bộ đếm tổng hợp và giới hạn tần suất theo người dùng (không theo IP, vì cả lớp thường chung một IP).
- Triển khai thật trên GCP: thực hiện bằng `infrastructure/deploy.sh` trong Cloud Shell (môi trường phát triển không có quyền vào project).

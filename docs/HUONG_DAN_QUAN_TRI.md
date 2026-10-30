# Hướng dẫn quản trị ClassInteract AI

Tài liệu dành cho quản trị viên (**Quản trị**) và quản trị viên cấp cao (**Quản trị cấp cao**). Cài đặt, triển khai và cấu hình hạ tầng xem [DEPLOYMENT.md](./DEPLOYMENT.md); chi tiết API xem [API.md](./API.md).

Menu quản trị: **Quản trị** (tổng quan), **Người dùng**, **Lớp & học phần**, **Cấu hình AI**, **Nhật ký**, kèm các mục của giảng viên (**Tổng quan**, **Lớp giảng dạy**).

## 1. Khởi tạo quản trị viên cấp cao đầu tiên

Tài khoản **superadmin** đầu tiên không tạo được từ giao diện. Nó được tạo **một lần** bởi script triển khai thông qua endpoint `POST /api/v1/setup/bootstrap`, bảo vệ bằng biến môi trường `SETUP_TOKEN` (header `x-setup-token`). Sau khi đã có superadmin, endpoint này trả lỗi `ALREADY_INITIALIZED`. Các bước cụ thể: xem [DEPLOYMENT.md](./DEPLOYMENT.md).

Khuyến nghị: sau khi khởi tạo, xóa hoặc đổi `SETUP_TOKEN` và đăng nhập đổi mật khẩu superadmin.

## 2. Vai trò

| Vai trò | Nhãn | Đăng nhập bằng | Quyền chính |
|---|---|---|---|
| `student` | Sinh viên | Mã sinh viên | Tham gia lớp được phân công; có thể là **Trợ giảng** trong một lớp cụ thể |
| `lecturer` | Giảng viên | Email | Tạo học phần/lớp, quản lý lớp mình phụ trách, đặt lại mật khẩu SV của lớp mình |
| `admin` | Quản trị | Email | Mọi quyền giảng viên trên **mọi lớp**; quản lý tài khoản, phân công giảng viên, cấu hình AI, xem nhật ký |
| `superadmin` | Quản trị cấp cao | Email | Như admin, thêm: cấp/thu hồi vai trò **admin/superadmin**, quản lý tài khoản superadmin khác |

Quy tắc:
- **Chỉ superadmin** được tạo tài khoản admin hoặc đổi người khác thành admin/superadmin. Admin chỉ gán vai trò sinh viên/giảng viên và không đổi được vai trò của admin khác.
- Admin chỉ khóa, mở khóa, sửa hoặc đặt lại mật khẩu tài khoản **sinh viên và giảng viên**. Tài khoản admin/superadmin chỉ superadmin quản lý được.
- Không chuyển được giữa tài khoản sinh viên ↔ tài khoản cán bộ (đăng nhập khác nhau). Cần tài khoản cán bộ thì tạo mới bằng email.
- Không ai tự khóa hoặc tự đổi vai trò của chính mình.
- Vai trò **Trợ giảng** không phải vai trò hệ thống; giảng viên cấp trong từng lớp (tab **Sinh viên**).

## 3. Tài khoản người dùng

### 3.1 Tạo tài khoản giảng viên / quản trị
Sinh viên **tự đăng ký** bằng mã sinh viên có trong danh sách lớp; không cần tạo tài khoản cho sinh viên.

1. **Người dùng** → **Tạo tài khoản cán bộ** (hoặc **Thao tác nhanh** → *Tạo tài khoản giảng viên*).
2. Nhập **Họ tên**, **Email đăng nhập**, **Vai trò** (*Giảng viên*; *Quản trị* chỉ hiện với superadmin), **Mật khẩu tạm** (≥ 6 ký tự, có nút **Tạo ngẫu nhiên**).
3. **Tạo tài khoản**, rồi gửi email + mật khẩu tạm cho người dùng qua kênh an toàn. Lần đăng nhập đầu, người dùng bắt buộc đổi mật khẩu (bảng hiện nhãn **MK tạm** cho đến khi đổi).

Email phải chưa được dùng (lỗi “Email đã được sử dụng”).

### 3.2 Tìm kiếm
Ô tìm kiếm nhận **mã SV, họ tên (không cần dấu) hoặc email** – tìm theo phần đầu chuỗi, nhấn Enter. Lọc **Mọi vai trò / Mọi trạng thái**. Bấm tên để xem chi tiết: vai trò, trạng thái, thời điểm tạo, **Đăng nhập gần nhất**, **Lớp phụ trách**, **Lớp tham gia**.

### 3.3 Khóa / mở khóa tài khoản
**⋯** → **Khóa tài khoản** → xác nhận.

- Có hiệu lực **ngay lập tức**: tài khoản Firebase bị vô hiệu hóa, mọi phiên đăng nhập bị thu hồi, ứng dụng đang mở của người đó tự đăng xuất, mọi yêu cầu API sau đó bị từ chối (`ACCOUNT_DISABLED`).
- Dữ liệu học tập vẫn được giữ.
- **Mở khóa** để cho phép đăng nhập lại.

### 3.4 Đặt lại mật khẩu
**⋯** → **Đặt lại mật khẩu** → xác nhận. Hệ thống tạo **mật khẩu tạm 8 ký tự**, chỉ hiển thị một lần (bấm **Đã ghi lại** sau khi lưu). Đồng thời: gỡ khóa đăng nhập do nhập sai, đăng xuất mọi phiên, buộc đổi mật khẩu ở lần đăng nhập tiếp theo.

Giảng viên cũng tự đặt lại được mật khẩu cho sinh viên lớp mình. Hệ thống không có chức năng “quên mật khẩu” qua email.

### 3.5 Đổi vai trò
**⋯** → **Đổi vai trò** (chỉ với tài khoản cán bộ, theo quy tắc mục 2). Người được đổi vai trò bị đăng xuất để nhận quyền mới.

## 4. Học phần, lớp và phân công giảng viên

Trang **Lớp & học phần**:

1. **Thêm học phần**: **Mã học phần** (duy nhất, tự viết hoa), **Tên học phần**, **Mô tả**.
2. **Tạo lớp**: chọn học phần, nhập mã lớp, học kỳ, năm học, lịch học và **Giảng viên phụ trách**. Có thể để *Chưa phân công*.
3. **Phân công** ở từng lớp: chọn một hoặc nhiều giảng viên/quản trị (tối đa 10, ít nhất 1) → **Lưu**. Giảng viên mới được phân công thấy lớp ngay trong **Lớp giảng dạy**.

Lớp hiện chữ đỏ **Chưa phân công** nếu chưa có giảng viên. Quản trị viên vào được mọi lớp qua **Lớp giảng dạy** (*Tất cả lớp học phần*) với đầy đủ quyền giảng viên, gồm nhập danh sách và đổi trạng thái lớp (*Đang hoạt động / Đã khóa / Lưu trữ*). Hướng dẫn thao tác trong lớp: xem [HUONG_DAN_GIANG_VIEN.md](./HUONG_DAN_GIANG_VIEN.md).

## 5. Cấu hình AI

Trang **Cấu hình AI**. Ứng dụng chỉ gọi AI từ backend; trình duyệt không bao giờ nhận API key.

### 5.1 Chung

| Trường | Ý nghĩa | Mặc định |
|---|---|---|
| **Bật AI trên toàn hệ thống** | Tắt để dừng mọi lời gọi AI; các chức năng lớp học vẫn hoạt động | Bật |
| **Nhà cung cấp mặc định** | Anthropic Claude / OpenAI / Google Gemini | Anthropic Claude |
| **Thứ tự dự phòng khi lỗi** | Thử lần lượt nếu nhà cung cấp trước lỗi | Claude → OpenAI → Gemini |
| **Giới hạn token đầu ra** | 100–8000 | 2000 |
| **Thời gian chờ (ms)** | 5000–120000 cho mỗi lần gọi | 45000 |
| **Hạn mức chi phí/tháng (USD)** | Đạt hạn mức: AI tạm dừng tới tháng sau (`AI_BUDGET_EXCEEDED`) | 50 |

Thứ tự chọn nhà cung cấp cho một yêu cầu: nhà cung cấp giảng viên chọn → nhà cung cấp của lớp → mặc định hệ thống → thứ tự dự phòng. Chỉ nhà cung cấp đang **Sử dụng** và **Đã có API key** được thử.

### 5.2 Nhà cung cấp và mô hình
Mỗi nhà cung cấp có:
- Công tắc **Sử dụng**.
- **Model ID** – đổi mô hình tại đây, **không cần sửa mã nguồn hay triển khai lại** (ví dụ khi nhà cung cấp ra mô hình mới hoặc ngừng mô hình cũ).
- **USD / 1M token vào**, **USD / 1M token ra** – đơn giá dùng để **ước tính** chi phí và áp hạn mức tháng. Hãy cập nhật theo bảng giá hiện hành; số liệu này không phải hóa đơn thực.

Bấm **Lưu cấu hình** để áp dụng ngay.

### 5.3 API key
Chỉ **Quản trị cấp cao** nhập được API key, ngay trên trang **Cấu hình AI**: dán key vào ô **API key** của từng nhà cung cấp → **Lưu key** → **Kiểm tra kết nối**. Trình duyệt không bao giờ nhận lại key (chỉ hiện 4 ký tự cuối). Key được lưu thành phiên bản mới trong **Google Cloud Secret Manager** và có hiệu lực sau khoảng 1 phút, không cần triển khai lại:

| Nhà cung cấp | Secret |
|---|---|
| Anthropic Claude | `anthropic-api-key` |
| OpenAI | `openai-api-key` |
| Google Gemini | `gemini-api-key` |

Giao diện hiện **Đã có API key** hoặc **Chưa có API key**. Cảnh báo “Đang chạy chế độ AI mô phỏng (AI_FAKE_PROVIDER=1)” nghĩa là AI đang trả lời giả lập, chỉ dùng để kiểm thử.

### 5.4 Lịch sử sử dụng AI
Cuối trang **Cấu hình AI**: tổng lượt và chi phí ước tính theo tháng (12 tháng gần nhất) và 50 lượt gọi gần nhất (**Thời gian, Nhà cung cấp, Mô hình, Trạng thái** `completed/failed/pending`, **Duyệt** `draft/published/rejected/auto_published`, **Token** vào/ra, **Chi phí**). Rê chuột lên trạng thái `failed` để xem lỗi. Trang **Quản trị** hiện **Lượt AI tháng này** và **Chi phí AI ước tính**.

Hạn mức theo lớp (**Lượt AI/ngày của lớp**, **Lượt AI/ngày mỗi SV**) do giảng viên đặt trong Cài đặt lớp.

## 6. Nhật ký thao tác

Trang **Nhật ký** liệt kê **Thời gian, Người thực hiện, Thao tác, Đối tượng, Chi tiết, IP**; lọc theo loại thao tác; phân trang **Trang trước / Trang sau**. Nhật ký không bao giờ chứa mật khẩu hay secret.

| Nhóm | Thao tác được ghi |
|---|---|
| Tài khoản & bảo mật | Khởi tạo hệ thống, đăng ký SV, khóa tạm do đăng nhập sai 5 lần, đổi mật khẩu, tạo tài khoản, sửa hồ sơ, khóa/mở khóa, đổi vai trò, đặt lại mật khẩu |
| Học phần & lớp | Tạo/sửa học phần, tạo/sửa lớp (gồm cài đặt và phân công), nhập danh sách, thêm/xóa/chuyển SV, bỏ mã khỏi danh sách, đổi vai trò trong lớp (TA), duyệt/từ chối yêu cầu vào lớp, **xuất dữ liệu** |
| Buổi học | Tạo, sửa, xóa, bắt đầu, tạm dừng, kết thúc, lưu trữ, đổi mã tham gia |
| Nội dung | Kiểm duyệt bài (ẩn/hiện, ghim, xác nhận, đổi trạng thái, đổi chủ đề), **xem danh tính bài ẩn danh**, tạo hoạt động |
| AI | Gọi AI, công bố/bỏ bản nháp AI, sửa cấu hình AI |

## 7. Bảo vệ dữ liệu và quyền riêng tư

- **AI không nhận dữ liệu định danh**: chỉ gửi tên học phần, thông tin buổi học, chủ đề, nội dung câu hỏi và câu trả lời đã được giảng viên xác nhận; **không gửi tên, mã sinh viên hay email**. Nội dung người dùng được bọc thành dữ liệu để chống chèn lệnh (prompt injection).
- **Ẩn danh**: bài ẩn danh lưu `Ẩn danh` trên bảng tin; danh tính thật lưu ở bản ghi riêng mà ứng dụng phía người dùng không đọc được. Giảng viên/trợ giảng chỉ xem được danh tính khi lớp bật “Giảng viên được xem danh tính bài ẩn danh” **và** bài được gửi trong lúc chính sách đó đang bật; **mỗi lần xem được ghi nhật ký**. Bài ẩn danh vẫn tính vào số liệu tham gia của tác giả.
- **Quyền đọc dữ liệu**: sinh viên chỉ đọc lớp mình tham gia, bài đang hiển thị và số liệu của chính mình; quy tắc Firestore từ chối mặc định và mọi thao tác ghi đi qua API có kiểm tra quyền.
- **Mật khẩu** băm bằng Argon2id; đăng nhập sai 5 lần khóa 5 phút; log hệ thống không ghi body yêu cầu hay header xác thực.
- **Xuất dữ liệu** chứa thông tin cá nhân; mọi lần xuất đều ghi nhật ký. Nhắc giảng viên tuân thủ quy định bảo vệ dữ liệu của trường.
- Số liệu tham gia là tham khảo, không tự động thành điểm.

## 8. Sao lưu dữ liệu

Toàn bộ dữ liệu nằm trong Cloud Firestore. Khuyến nghị bật cả hai cơ chế:

**1. Point-in-time recovery (PITR)** – khôi phục về thời điểm bất kỳ trong 7 ngày gần nhất:
```bash
gcloud firestore databases update --database='(default)' --enable-pitr --project=PROJECT_ID
```

**2. Xuất định kỳ ra Cloud Storage** (lưu dài hạn, ví dụ hằng tuần và cuối học kỳ):
```bash
# Bucket nên cùng vùng với Firestore, bật versioning/retention
gcloud firestore export gs://BUCKET/firestore/$(date +%Y-%m-%d) --project=PROJECT_ID

# Khôi phục (ghi đè các tài liệu cùng ID) – chỉ làm khi đã kiểm tra kỹ
gcloud firestore import gs://BUCKET/firestore/2026-01-15 --project=PROJECT_ID
```
Có thể lên lịch lệnh export bằng Cloud Scheduler hoặc lịch sao lưu Firestore (`gcloud firestore backups schedules create`). Kiểm tra khôi phục thử trên một project thử nghiệm ít nhất mỗi học kỳ.

Tài khoản đăng nhập Firebase Auth không nằm trong bản export Firestore; mật khẩu (băm) và thông tin đăng nhập do ứng dụng lưu trong Firestore nên được khôi phục cùng.

## 9. Xử lý sự cố

| Triệu chứng | Nguyên nhân / cách xử lý |
|---|---|
| Sinh viên không đăng ký được (“Mã sinh viên chưa có trong danh sách lớp”) | Mã chưa được nhập vào lớp nào. Giảng viên nhập danh sách; số mã chưa đăng ký hiện ở thẻ **Sinh viên** (Quản trị) |
| Sinh viên báo mã đã được đăng ký nhưng không phải họ | Kiểm tra người dùng theo mã SV, khóa tài khoản nghi vấn, đặt lại mật khẩu và giao cho đúng sinh viên |
| “Bạn đã nhập sai nhiều lần…” | Chờ 5 phút, hoặc **Đặt lại mật khẩu** (gỡ khóa ngay) |
| Người dùng bị đăng xuất liên tục | Tài khoản bị khóa, vừa đổi vai trò hoặc đặt lại mật khẩu. Kiểm tra **Nhật ký** |
| Giảng viên không thấy lớp | Kiểm tra **Phân công** ở **Lớp & học phần** |
| “Chưa cấu hình nhà cung cấp AI nào (thiếu API key)” | Nhập API key ở **Cấu hình AI** (quản trị cấp cao), hoặc bật **Sử dụng** cho nhà cung cấp đã có key |
| “Dịch vụ AI tạm thời không khả dụng” | Xem lỗi trong **Lịch sử sử dụng AI**: Model ID sai/ngừng hỗ trợ, key hết hạn, hết hạn mức của nhà cung cấp hoặc quá thời gian chờ. Sửa Model ID hoặc đổi nhà cung cấp mặc định |
| “Đã đạt hạn mức chi phí AI của tháng” | Tăng **Hạn mức chi phí/tháng** nếu được phép, hoặc chờ sang tháng |
| “Bạn thao tác quá nhanh…” hàng loạt | Giới hạn tần suất (600 yêu cầu/phút mỗi người, 300/phút mỗi IP cho đăng nhập). Nếu cả lớp bị lỗi đăng nhập cùng lúc qua một IP, thử lại sau một phút |
| Lỗi khi lấy danh sách/thống kê sau khi triển khai mới | Kiểm tra đã triển khai `firebase/firestore.indexes.json` và chỉ mục đã xây xong (xem [DEPLOYMENT.md](./DEPLOYMENT.md)) |

## Phase 2 – Cấu hình AI nâng cao

### Nhập API key trên giao diện (quản trị cấp cao)
**Quản trị → Cấu hình AI** → trong từng nhà cung cấp, dán key vào ô **API key** → **Lưu key**. Key được lưu thành phiên bản mới trong Google Cloud Secret Manager (`anthropic-api-key`, `openai-api-key`, `gemini-api-key`), có hiệu lực trong khoảng 1 phút, không bao giờ hiển thị lại (chỉ 4 ký tự cuối). **Kiểm tra kết nối** gọi thử mô hình đã cấu hình. Chỉ tài khoản **Quản trị cấp cao** nhập/xóa được key.

### Mô hình theo tác vụ
Card **Mô hình theo tác vụ**: chọn nhà cung cấp/mô hình riêng cho trả lời câu hỏi, phân loại chủ đề, gom nhóm, tóm tắt buổi học, gợi ý giảng dạy, tổng hợp hoạt động. Ví dụ dùng mô hình rẻ cho phân loại, mô hình mạnh cho tóm tắt. Để trống = dùng mặc định.

### Embedding (gom nhóm theo ngữ nghĩa)
Gom nhóm câu hỏi và gợi ý câu hỏi trùng dùng embedding của **OpenAI** (`text-embedding-3-small`) hoặc **Gemini** (`gemini-embedding-001`). Claude không có API embedding – nếu chỉ có key Claude, hệ thống vẫn gom nhóm bằng mô hình ngôn ngữ (chậm và tốn hơn). Ngưỡng tương đồng mặc định 0.6 (OpenAI) / 0.8 (Gemini): tăng nếu nhóm gộp quá nhiều câu khác ý, giảm nếu bỏ sót câu cùng ý.

### Tác vụ chạy nền
Các tác vụ AI dài chạy qua hàng đợi **Cloud Tasks** `classinteract-ai` (script triển khai tự tạo). Nếu tác vụ báo lỗi, xem log: `gcloud run services logs read classinteract-api --region asia-southeast1`.

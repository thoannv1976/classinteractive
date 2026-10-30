# Hướng dẫn sử dụng ClassInteract AI – Giảng viên

Tài liệu hướng dẫn giảng viên (và trợ giảng) tổ chức lớp, điều hành buổi học, kiểm duyệt hỏi đáp, dùng AI hỗ trợ và đọc số liệu tham gia.

## 1. Lần đăng nhập đầu tiên

1. Quản trị viên tạo tài khoản và gửi cho bạn **email đăng nhập** và **mật khẩu tạm**.
2. Mở trang đăng nhập, nhập email vào ô **Mã sinh viên hoặc email**, nhập mật khẩu tạm → **Đăng nhập**.
3. Màn hình **Đặt mật khẩu mới** xuất hiện: nhập mật khẩu tạm làm *Mật khẩu hiện tại*, đặt mật khẩu mới (≥ 6 ký tự) → **Đổi mật khẩu**.

Menu của giảng viên: **Tổng quan** (lớp phụ trách, buổi đang diễn ra, câu hỏi chưa giải đáp, yêu cầu vào lớp), **Lớp giảng dạy**, **Thông báo**, **Hồ sơ**.

## 2. Tạo học phần và lớp học phần

1. **Lớp giảng dạy** → **Tạo lớp** (hoặc **Tạo lớp đầu tiên**).
2. **Học phần**: chọn học phần có sẵn hoặc **+ Thêm học phần mới** (nhập **Mã học phần**, **Tên học phần**).
3. Nhập **Mã lớp học phần** (VD `DGB301.01`), **Tên lớp** (không bắt buộc), **Học kỳ**, **Năm học**, **Lịch học**.
4. Bấm **Tạo lớp**. Bạn tự động là giảng viên phụ trách; hệ thống chuyển tới trang **Sinh viên** để nhập danh sách.

> Mã lớp học phần không được trùng trong cùng học kỳ. Phân công thêm giảng viên do quản trị viên thực hiện.

Trang lớp có các tab: **Tổng quan**, **Buổi học**, **Câu hỏi chờ xử lý**, **Sinh viên**, **Mức độ tham gia**, **Chủ đề**, **Báo cáo**, **Cài đặt** (chỉ giảng viên phụ trách/quản trị).

## 3. Nhập danh sách sinh viên

Sinh viên **chỉ đăng ký được** khi mã sinh viên có trong danh sách lớp. Sinh viên đã có tài khoản được thêm vào lớp ngay.

1. Tab **Sinh viên** → **Nhập danh sách**.
2. Chọn một trong hai cách:
   - **Từ file Excel/CSV**: **Chọn file .xlsx hoặc .csv** (tối đa 2 MB, đọc trang tính đầu tiên).
   - **Dán danh sách**: mỗi dòng `Mã SV, Họ tên, Email` (phân cách bằng dấu phẩy, chấm phẩy hoặc Tab; email không bắt buộc) → **Xem trước**.
3. Kiểm tra bảng **Xem trước** (ô thiếu dữ liệu hiện chữ đỏ “thiếu”) → **Nhập N sinh viên** (tối đa 1000 dòng/lần).
4. Đọc **Kết quả nhập**: số mã hợp lệ, số SV đã có tài khoản được thêm vào lớp, số SV chưa đăng ký, các dòng bị bỏ qua (kèm số dòng và lý do).

**Tên cột được nhận diện** (không phân biệt hoa thường, có dấu hay không; dòng tiêu đề nằm trong 15 dòng đầu):

| Dữ liệu | Tên cột chấp nhận |
|---|---|
| Mã sinh viên *(bắt buộc)* | `Mã SV`, `MaSV`, `MSSV`, `Mã sinh viên`, `Mã số sinh viên`, `Mã học viên`, `Student ID`, `StudentID`, `ID` |
| Họ tên *(bắt buộc)* | `Họ tên`, `Họ và tên`, `HoTen`, `Họ và tên sinh viên`, `Tên sinh viên`, `Full name`, `FullName`, `Name` |
| …hoặc tách hai cột | `Họ` / `Họ đệm` / `Họ và tên đệm` / `Last name` **+** `Tên` / `First name` |
| Email *(không bắt buộc)* | `Email`, `E-mail`, `Mail`, `Thư điện tử` |

Mã SV gồm chữ, số, dấu chấm, gạch (3–32 ký tự), được lưu dạng chữ hoa. CSV nên lưu dạng UTF-8.

**Danh sách “Chưa đăng ký tài khoản”** (cuối tab Sinh viên): các mã đã nhập nhưng sinh viên chưa tự đăng ký. Nhắc sinh viên vào trang **Đăng ký** và nhập mã. Bấm **Bỏ khỏi danh sách** nếu nhập nhầm.

## 4. Quản lý sinh viên trong lớp

Trong bảng **Sinh viên trong lớp**, bấm **⋯** ở từng dòng:

| Thao tác | Tác dụng |
|---|---|
| **Cấp quyền trợ giảng** / **Bỏ quyền trợ giảng** | Trợ giảng (TA) được kiểm duyệt bài, trả lời chính thức, tạo/điều khiển hoạt động, dùng AI, xem thống kê và xuất báo cáo; **không** bắt đầu/kết thúc buổi, không sửa cài đặt, không quản lý danh sách |
| **Đặt lại mật khẩu** | Tạo mật khẩu tạm (chỉ hiển thị một lần – đưa trực tiếp cho SV). SV phải đổi mật khẩu khi đăng nhập lại; các phiên đang mở bị đăng xuất |
| **Chuyển sang lớp khác** | Chuyển SV sang một lớp khác **do bạn phụ trách** |
| **Xóa khỏi lớp** | SV không còn truy cập lớp; dữ liệu tương tác đã có vẫn được giữ |

Trợ giảng là sinh viên: họ vào lớp như sinh viên, khi mở một buổi học sẽ được chuyển sang trang điều hành buổi học.

**Yêu cầu tham gia lớp:** sinh viên chưa có trong danh sách có thể xin vào lớp bằng mã lớp hoặc mã tham gia buổi học. Yêu cầu hiện ở đầu tab **Sinh viên** (và số lượng ở **Tổng quan**) → **Duyệt** hoặc **Từ chối**. Sinh viên được thông báo khi được duyệt.

## 5. Buổi học

### 5.1 Tạo buổi học

1. Tab **Buổi học** → **Tạo buổi học**.
2. Nhập **Buổi số**, **Tên buổi học**, **Ngày**, **Bắt đầu**, **Kết thúc**, **Nội dung chính**.
3. **Chủ đề kiến thức**: nhập từng chủ đề rồi Enter/**Thêm** (tối đa 30). Sinh viên gắn chủ đề khi đặt câu hỏi; dữ liệu này dùng cho trang **Chủ đề**.
4. **Lưu**. Có thể **Sửa thông tin** hoặc **Xóa** (chỉ buổi chưa bắt đầu) trong menu **⋯**.

### 5.2 Bắt đầu và điều hành

Mở buổi (bấm tên buổi hoặc **Mở trang điều hành**), rồi:

| Nút | Tác dụng |
|---|---|
| **Bắt đầu buổi học** | Trạng thái *Đang diễn ra*; tạo **mã tham gia** 6 ký tự + **QR** (hiệu lực 12 giờ); thông báo cho sinh viên của lớp |
| **Đổi mã** | Cấp mã mới, mã cũ hết hiệu lực ngay (dùng khi mã bị chia sẻ ra ngoài) |
| **Tạm dừng** / **Tiếp tục** | Tạm dừng: SV vẫn xem và vào buổi được nhưng không gửi bài, phản hồi hay nộp hoạt động |
| **Kết thúc** | Đóng mọi hoạt động đang mở; dữ liệu giữ nguyên. Chọn **Cho phép trả lời bổ sung sau khi kết thúc**: Không / 1 giờ / 1 ngày / 3 ngày / 7 ngày – trong thời hạn này SV vẫn trả lời, bình luận được (không đăng câu hỏi mới) |
| **Mở lại** | Mở lại buổi đã kết thúc |
| **Lưu trữ** (tab Buổi học) | Ẩn buổi đã kết thúc khỏi sinh viên |

Trang điều hành có 3 tab: **Bảng tin**, **Hoạt động**, **Người tham gia** (danh sách SV đã vào buổi, thời điểm vào, số câu hỏi/trả lời/bình luận/phản hồi nhanh/hoạt động). Khung bên phải hiện số liệu trực tiếp và **Mức độ hiểu bài (phản hồi nhanh)**: số lượt ✅ Đã hiểu, ❓ Cần giải thích và các nội dung nhiều SV cần giải thích thêm.

Lớp đang **Đã khóa** hoặc **Lưu trữ** thì không bắt đầu buổi học được.

### 5.3 Chế độ trình chiếu

Bấm **Trình chiếu** (mở tab mới, nền tối, chữ lớn) để chiếu lên màn hình lớp. Các màn:

| Màn | Hiển thị |
|---|---|
| **Tham gia** | QR lớn, địa chỉ, mã tham gia, số SV đã tham gia |
| **Câu hỏi** | 6 câu hỏi được ghim/bình chọn nhiều nhất |
| **Hoạt động** | Kết quả trực tiếp (biểu đồ); với trả lời tự do: các **câu trả lời tiêu biểu** đã đánh dấu sao |
| **Chưa hiểu** | Bài có nhiều “Cần giải thích thêm” hoặc câu hỏi trạng thái *Cần làm rõ* |

Chế độ trình chiếu **không hiển thị tên, mã sinh viên hay danh tính tác giả**, chỉ nội dung đang hiển thị với lớp (bài đã ẩn không xuất hiện).

## 6. Kiểm duyệt bảng tin

Lọc **Tất cả / Chưa giải đáp / Đã ghim / Đã ẩn**, sắp xếp **Mới nhất / Nhiều bình chọn nhất**. Bấm **⋯** trên bài:

| Thao tác | Ghi chú |
|---|---|
| **Ghim lên đầu** / **Bỏ ghim** | Bài ghim luôn ở đầu bảng tin và màn trình chiếu |
| **Xác nhận câu trả lời đúng** | Với câu trả lời; nhãn **GV xác nhận**, tác giả được thông báo, câu hỏi chuyển *Đã trả lời* |
| **Đánh dấu: Mới / Đã trả lời / Cần làm rõ / Đã giải quyết / Lưu trữ** | *Mới* và *Cần làm rõ* được tính là **chưa giải đáp**. Câu hỏi *Lưu trữ* không nhận phản hồi mới |
| **AI đề xuất trả lời** | Xem mục 8 |
| **Xem danh tính** | Chỉ với bài ẩn danh **và** khi lớp bật “Giảng viên được xem danh tính bài ẩn danh”. Mỗi lần xem được **ghi nhật ký**. Chỉ áp dụng cho bài được gửi **trong lúc** chính sách này đang bật (sinh viên thấy thông báo ngay khi chọn ẩn danh); bật sau không làm lộ bài ẩn danh cũ. |
| **Ẩn bài** / **Hiện lại** | Bài ẩn biến mất với sinh viên và không tính vào thống kê |

Khi giảng viên/trợ giảng gửi **Trả lời** cho một câu hỏi đang mở, câu hỏi tự chuyển *Đã trả lời*. Bạn có thể đăng bài trên bảng tin như sinh viên (không ẩn danh).

## 7. Hoạt động trên lớp

Tab **Hoạt động** → **Tạo hoạt động** → chọn mẫu:

| Mẫu | Mô tả |
|---|---|
| **Kiểm tra mức độ hiểu (1 chạm)** | Câu “Bạn đã hiểu nội dung này chưa?” với 3 lựa chọn cố định Đã hiểu / Hiểu một phần / Chưa hiểu |
| **Khảo sát ý kiến** | 2–10 phương án, có thể **Cho phép chọn nhiều phương án** |
| **Trắc nghiệm nhanh** | 2–10 phương án, **đánh dấu đáp án đúng** (có thể nhiều) |
| **Trả lời tự do** | Sinh viên nhập văn bản (≤ 3000 ký tự) |
| **Phiếu cuối buổi (Exit ticket)** | Trả lời tự do với 3 câu gợi ý sẵn |

Tùy chọn: **Sinh viên thấy kết quả tổng hợp** (mặc định tắt với trắc nghiệm), **Mở ngay cho sinh viên** (tắt = **Lưu nháp**). Hoạt động chỉ mở được khi buổi học đang diễn ra hoặc tạm dừng; sinh viên đã vào buổi nhận thông báo.

Trên thẻ hoạt động:
- **Mở / Mở lại**, **Đóng**. Sinh viên đổi được câu trả lời khi hoạt động còn mở.
- **SV thấy kết quả** / **Ẩn kết quả**: bật/tắt hiển thị biểu đồ cho sinh viên bất kỳ lúc nào.
- Trắc nghiệm: **đáp án đúng không bao giờ gửi tới máy sinh viên** cho đến khi bạn đóng hoạt động và bấm **Công bố đáp án** (có thể **Ẩn đáp án** lại). Thẻ hiện **Tỷ lệ đúng**.
- Trả lời tự do: xem danh sách câu trả lời (kèm tên, mã SV – chỉ cán bộ thấy); bấm ⭐ để chọn **câu trả lời tiêu biểu** hiển thị ở màn trình chiếu (không kèm tên).
- **Trình chiếu**: mở màn trình chiếu tại hoạt động đó.
- **Xóa**: chỉ với hoạt động chưa từng mở.

## 8. AI đề xuất trả lời

Điều kiện: AI bật trên toàn hệ thống (quản trị viên) và **Bật AI cho lớp này** (Cài đặt lớp).

1. Trên câu hỏi (bảng tin, trang chi tiết hoặc **Câu hỏi chờ xử lý**) bấm **AI đề xuất trả lời**.
2. AI soạn **bản nháp** (chưa ai khác thấy). Có thể chọn **Nhà cung cấp** (*Mặc định của hệ thống*, Claude, OpenAI, Gemini – chỉ hiện nhà cung cấp đã cấu hình) và **Tạo lại**.
3. Kiểm tra, chỉnh sửa ô **Nội dung sẽ công bố (có thể chỉnh sửa)**.
4. **Duyệt và công bố**: câu trả lời xuất hiện dưới câu hỏi với nhãn **AI Generated · GV đã duyệt**, câu hỏi chuyển *Đã trả lời*, tác giả được thông báo. Hoặc **Bỏ bản nháp**.

AI chỉ nhận: tên học phần, buổi học, chủ đề, nội dung chính của buổi, nội dung câu hỏi và tối đa 3 câu trả lời đã được giảng viên xác nhận – **không** nhận tên hay mã sinh viên.

**Chế độ AI Student Support** (Cài đặt lớp): sinh viên tự bấm **Hỏi AI** trên câu hỏi của mình; câu trả lời đăng ngay với nhãn **AI Generated**, không cần duyệt và không đổi trạng thái câu hỏi. Chỉ nên bật khi phù hợp với học phần.

**Hạn mức:** **Lượt AI/ngày của lớp** (mặc định 200, tính cả lượt *Tạo lại* và lượt lỗi), **Lượt AI/ngày mỗi SV** (mặc định 5), và hạn mức chi phí tháng của hệ thống. Khi AI lỗi, thông báo “Dịch vụ AI tạm thời không khả dụng…” – các chức năng lớp học khác vẫn bình thường.

## 9. Câu hỏi chờ xử lý

Tab **Câu hỏi chờ xử lý** gom câu hỏi **Chưa giải đáp** của mọi buổi (hoặc **Tất cả câu hỏi**), sắp theo số bình chọn. Mỗi dòng có **Trả lời (n)** (mở chi tiết thảo luận) và **AI đề xuất trả lời**.

## 10. Số liệu tham gia

### 10.1 Tổng quan lớp
Thẻ số liệu: **Sinh viên**, **Có ít nhất 1 tương tác**, **Chưa tương tác**, **Câu hỏi / Trả lời**, **Chưa giải đáp**, **Hoạt động · hoàn thành**. Biểu đồ: **Tương tác theo buổi học**, **Sinh viên tham gia qua các buổi**, **Phân bố mức độ tương tác** (0, 1–2, 3–5, 6–10, >10), **Chủ đề được quan tâm nhiều nhất**.

### 10.2 Mức độ tham gia
- **Bảng tham gia của sinh viên**: Mã SV, Họ tên, Số buổi, Câu hỏi, Trả lời, Hoạt động, Chủ đề, Đều đặn, Tổng tương tác, Gần nhất. Bấm tiêu đề cột để sắp xếp; lọc **Cả học kỳ** hoặc **Tương tác trong buổi N**; **Xuất Excel**. Bấm tên SV để mở **hồ sơ** (xu hướng theo buổi, chủ đề, lịch sử đóng góp).
- **Bản đồ nhiệt tham gia**: số tương tác của từng SV trong mỗi buổi; ô xám = không có mặt.

### 10.3 Cách tính – theo cơ hội thực tế
Mẫu số luôn là cơ hội **đã thực sự xảy ra**, không phải con số cố định:

| Chỉ số | Công thức |
|---|---|
| Tỷ lệ tham dự | buổi SV đã vào ÷ buổi **đã bắt đầu** (buổi nháp, chưa mở không tính) |
| Tỷ lệ hoàn thành HĐ (từng SV) | hoạt động SV đã làm ÷ hoạt động **đã mở** trong lớp |
| Hoàn thành HĐ (cả lớp) | tổng bài nộp ÷ Σ(số hoạt động đã mở × số SV có mặt) của từng buổi – “tính trên SV có mặt” |
| Độ chính xác quiz | câu đúng ÷ câu đã làm |
| Mức độ đều đặn | buổi có ≥ 1 tương tác ÷ buổi đã diễn ra |
| Tổng tương tác | câu hỏi + trả lời + bình luận + nhận xét/thảo luận + hoạt động + phản hồi nhanh |
| Có ít nhất 1 tương tác | tỷ lệ SV (gồm cả TA) có tổng tương tác > 0 |

Bài bị ẩn/xóa được trừ khỏi số liệu; bài ẩn danh vẫn tính cho tác giả. Đây là **số liệu tham khảo**, không tự động đưa vào bảng điểm.

## 11. Chủ đề

Tab **Chủ đề kiến thức**: bảng **Chủ đề / Hỏi / Đáp / SV / Chờ**, lọc theo **Mọi buổi** hoặc từng buổi. Bấm một chủ đề để xem toàn bộ câu hỏi và câu trả lời của chủ đề đó qua các buổi (câu trả lời đi theo chủ đề của câu hỏi). Bài không gắn chủ đề nằm ở **Chưa phân loại**. Bấm **Đổi chủ đề** để gắn lại tối đa 5 chủ đề (có thể thêm chủ đề mới).

## 12. Báo cáo và xuất dữ liệu

Tab **Báo cáo**:

1. **Excel tổng hợp (XLSX)** – một file gồm 7 trang: *Student Participation, Session Statistics, Questions, Answers, Topics, Activities, Activity Submissions*.
2. **Báo cáo trình bày (PDF)** – **In / Lưu PDF** mở bản in của trang Tổng quan; chọn “Lưu thành PDF” trong hộp thoại in.
3. **Từng bảng dữ liệu (CSV UTF-8)** – tải riêng từng bảng; và **JSON** chứa mọi bảng để tích hợp.

Bài ẩn danh được xuất là “Ẩn danh”; nếu lớp bật “Giảng viên được xem danh tính bài ẩn danh” thì bài gửi trong lúc chính sách bật được xuất tên kèm ghi chú “(ẩn danh)”. Hồ sơ từng sinh viên không hiển thị bài ẩn danh của họ với giảng viên. Bài đã ẩn vẫn có trong file với cột *Hiển thị = Đã ẩn*. Mỗi lần xuất được ghi nhật ký. File chứa dữ liệu cá nhân – lưu trữ và chia sẻ theo quy định của trường.

## 13. Cài đặt lớp

Tab **Cài đặt** (giảng viên phụ trách/quản trị) → chỉnh rồi bấm **Lưu thay đổi**.

| Mục | Ý nghĩa |
|---|---|
| **Tên lớp, Lịch học, Học kỳ, Năm học** | Thông tin hiển thị |
| **Trạng thái lớp** | *Đang hoạt động*; *Đã khóa*: SV chỉ xem, không gửi tương tác mới; *Lưu trữ*: lớp ẩn khỏi danh sách của SV |
| **Cho phép đặt câu hỏi ẩn danh** | Tên SV được ẩn với các bạn khác; hệ thống vẫn ghi nhận để tính tham gia và chống lạm dụng |
| **Giảng viên được xem danh tính bài ẩn danh** | Bật để dùng **Xem danh tính**; mỗi lần xem ghi nhật ký. Chỉ áp dụng cho bài được gửi **trong lúc** chính sách này đang bật (sinh viên thấy thông báo ngay khi chọn ẩn danh); bật sau không làm lộ bài ẩn danh cũ. |
| **Thời gian cho phép sửa/xóa bài (phút)** | 0–1440, mặc định 15; 0 = SV không sửa/xóa được |
| **Bật AI cho lớp này** | Tắt để không dùng AI trong lớp |
| **Chế độ** | *AI Assistant* (khuyến nghị) hoặc *AI Student Support* |
| **Nhà cung cấp** | *Theo cấu hình hệ thống*, Claude, OpenAI, Gemini |
| **Lượt AI/ngày của lớp**, **Lượt AI/ngày mỗi SV** | Hạn mức sử dụng (đếm theo ngày UTC) |

## 14. Sự cố thường gặp

| Vấn đề | Cách xử lý |
|---|---|
| SV báo “Mã sinh viên chưa có trong danh sách lớp” | Kiểm tra mã trong danh sách lớp, nhập bổ sung |
| SV quét QR nhưng báo chưa có trong lớp | SV gửi yêu cầu → duyệt ở tab Sinh viên, hoặc nhập mã vào danh sách |
| “Lớp đã dùng hết lượt AI trong ngày” | Tăng **Lượt AI/ngày của lớp** hoặc chờ ngày hôm sau |
| “Đã đạt hạn mức chi phí AI của tháng” | Liên hệ quản trị viên |
| Không mở được hoạt động | Buổi học phải đang diễn ra hoặc tạm dừng |

## Phase 2 – Phân tích lớp học thông minh

> Các chức năng AI dưới đây chạy nền: bấm nút xong có thể làm việc khác, kết quả tự hiện khi xong. Cần lớp bật AI (Cài đặt) và quản trị viên đã nhập API key.

### Tự động khi kết thúc buổi học
Khi bấm **Kết thúc** buổi học, hệ thống tự: phân loại chủ đề cho câu hỏi mới, gom nhóm câu hỏi của buổi, và soạn **bản tóm tắt buổi học** (bản nháp). Bạn nhận thông báo khi bản tóm tắt sẵn sàng. Có thể tắt trong **Cài đặt → Trợ lý AI**.

### Chủ đề (tab Chủ đề)
- **Danh mục chủ đề**: thêm, đổi tên, sửa mô tả, xóa, gộp nhiều chủ đề; bấm vào một chủ đề để xem các chuỗi hỏi đáp, chọn bài và **chuyển** hoặc **tách** sang chủ đề mới.
- **Duyệt đề xuất của AI**: bấm **Phân loại chủ đề** (cả lớp hoặc một buổi). Mỗi bài hiện chủ đề AI đề xuất → **Chấp nhận / Sửa / Bỏ qua** hoặc **Chấp nhận tất cả**. Đề xuất của AI được lưu lại để đối chiếu với nhãn cuối cùng của bạn.

### Nhóm câu hỏi (tab Nhóm câu hỏi)
AI gom các câu hỏi cùng ý (dù diễn đạt khác) thành nhóm vấn đề, kèm số câu hỏi, số sinh viên, số buổi, mức độ quan tâm và trạng thái giải đáp. Chọn phạm vi **Cả lớp** hoặc từng buổi → **Gom nhóm câu hỏi**. Bạn có thể đổi tên/mô tả, đánh dấu đã giải quyết, gộp nhóm, chuyển hoặc bỏ câu hỏi khỏi nhóm. Nhóm bạn đã chỉnh sửa được giữ nguyên khi chạy lại.

Khi sinh viên soạn câu hỏi, hệ thống gợi ý câu hỏi tương tự đã có (theo nghĩa nếu có key OpenAI/Gemini, nếu không thì theo từ khóa).

### Phiếu cuối buổi
**Tạo hoạt động → Phiếu cuối buổi (Exit ticket)**: sinh viên trả lời 3 câu hỏi chuẩn trong một lần nộp. Trong thẻ hoạt động, xem câu trả lời theo từng câu, đánh dấu sao để trình chiếu, và bấm **Tổng hợp câu trả lời hoạt động** để AI tóm tắt ý chính, khó khăn, gợi ý (cũng có cho hoạt động trả lời tự do).

### Tóm tắt buổi học (tab Tóm tắt trong trang điều hành buổi học)
AI soạn 8 mục: nội dung chính, chủ đề, câu hỏi quan trọng, câu trả lời đã xác nhận, vấn đề chưa giải đáp, nội dung khó, nội dung được quan tâm, gợi ý buổi sau. Mỗi nhận định có liên kết tới bài gốc. Quy trình: **sửa → Lưu → Duyệt → Công bố**. Chỉ bản đã duyệt và công bố mới hiện cho sinh viên; sửa bản đã công bố sẽ đưa về bản nháp và gỡ công bố.

### Gợi ý giảng dạy (tab Gợi ý AI)
**Phân tích bằng AI** đưa ra nhận định theo nhóm (chủ đề nhiều câu hỏi, khái niệm dễ nhầm, câu hỏi chưa trả lời, cần giảng giải thêm, mức độ tham gia chung, gợi ý), mỗi nhận định có **căn cứ** số liệu và liên kết bài gốc, kèm **câu hỏi tiếp nối** có thể sao chép để dùng ở buổi sau. AI không đánh giá năng lực hay động cơ của từng sinh viên.

### Điểm tham gia (tab Điểm tham gia)
- Điểm tham khảo 0–100 từ 5 thành phần (mặc định: hoạt động 30%, trả lời/thảo luận 25%, đặt câu hỏi 20%, đóng góp có ích 15%, phiếu cuối buổi 10%).
- Chỉ tính trên cơ hội thực tế: buổi đã diễn ra và hoạt động đã mở; thành phần chưa có cơ hội được bỏ qua; mỗi buổi chỉ tính tối đa một số đóng góp (chống spam).
- **Cấu hình công thức**: đổi trọng số (tổng 100%), giới hạn mỗi buổi, cách tính số buổi (tất cả buổi đã diễn ra / chỉ buổi có mặt). Mỗi lần đổi tạo phiên bản mới.
- **Điều chỉnh**: cộng/trừ điểm cho từng sinh viên kèm ghi chú.
- **Xác nhận điểm**: lưu bản chính thức (kèm phiên bản công thức); bảng "Engagement Scores" trong file Excel có điểm đã xác nhận gần nhất. Chưa xác nhận thì chỉ là điểm tham khảo.
- Bật **Cho sinh viên xem điểm tham khảo của mình** nếu muốn sinh viên thấy điểm và cách tính.

### Báo cáo trình bày (tab Báo cáo)
7 báo cáo in/PDF: buổi học, lớp học phần, cá nhân sinh viên, chủ đề kiến thức, câu hỏi chưa giải đáp, phân tích tương tác, gợi ý giảng dạy. Bấm **Mở bản in** → **In / Lưu PDF**. File Excel có thêm bảng **Engagement Scores** và **Question Clusters**.

### Ngôn ngữ
Chuyển **VI / EN** ở góc dưới thanh bên (hoặc thanh trên điện thoại). Ngôn ngữ được lưu theo tài khoản; file Excel và thông báo lỗi theo ngôn ngữ đang chọn; AI trả lời theo ngôn ngữ của câu hỏi.

/** English for the engagement score pages, class settings additions and per-task AI settings (Phase 2). */
const en: Record<string, string> = {
  // Scores page
  'Trả lời/thảo luận': 'Answers/discussion',
  'Đặt câu hỏi': 'Questions asked',
  'Phản hồi có ích': 'Helpful contributions',
  'Sinh viên đã có thể xem điểm tham khảo của mình': 'Students can now see their own reference score',
  'Đã ẩn điểm tham khảo với sinh viên': 'Reference scores are now hidden from students',
  'Đã xác nhận điểm': 'Scores confirmed',
  'Điểm tham gia là điểm tham khảo (0–100), chỉ tính trên các cơ hội thực sự đã diễn ra: {{n}} buổi học đã tổ chức và các hoạt động đã mở. Thành phần nào chưa có cơ hội sẽ được bỏ qua và trọng số của các thành phần còn lại được chia lại, nên một buổi không có hoạt động không làm giảm điểm của ai.':
    'The engagement score is a reference value (0–100) computed only from opportunities that actually happened: {{n}} sessions held and the activities that were opened. Components with no opportunity are skipped and the remaining weights are re-normalised, so a session without activities never lowers anyone’s score.',
  'Để chống spam, mỗi buổi chỉ tính tối đa {{answers}} trả lời/thảo luận, {{questions}} câu hỏi và {{helpful}} phản hồi có ích.':
    'To prevent spam, each session counts at most {{answers}} answers/discussion posts, {{questions}} questions and {{helpful}} helpful contributions.',
  'Đây không phải điểm chính thức cho đến khi giảng viên xác nhận điểm.': 'It is not an official grade until the lecturer confirms scores.',
  'Phiên bản công thức {{v}}': 'Formula version {{v}}',
  'Tính trên các buổi sinh viên có mặt': 'Based on sessions the student attended',
  'Tính trên tất cả các buổi đã diễn ra': 'Based on all sessions held',
  'Điểm tham gia của sinh viên': 'Student engagement scores',
  'Lần xác nhận gần nhất: {{at}} bởi {{by}} (phiên bản {{v}})': 'Last confirmed: {{at}} by {{by}} (version {{v}})',
  'Chưa xác nhận lần nào': 'Not confirmed yet',
  'Cấu hình công thức': 'Configure formula',
  'Xác nhận điểm': 'Confirm scores',
  'Cho sinh viên xem điểm tham khảo của mình': 'Let students see their own reference score',
  'Điều chỉnh': 'Adjustment',
  'Điểm': 'Score',
  'Chưa có cơ hội': 'No opportunity yet',
  'Chưa có cơ hội tham gia nào': 'No participation opportunities yet',
  'Điều chỉnh điểm của {{name}}': 'Adjust score of {{name}}',
  'Các lần xác nhận điểm': 'Score confirmations',
  'Sheet "Engagement Scores" trong file Excel xuất ra có điểm đã xác nhận gần nhất.': 'The "Engagement Scores" sheet of the Excel export includes the latest confirmed score.',
  'Thời gian xác nhận': 'Confirmed at',
  'Người xác nhận': 'Confirmed by',
  'Phiên bản công thức': 'Formula version',
  'Điểm hiện tại của {{n}} sinh viên sẽ được lưu thành một bản chốt kèm phiên bản công thức {{v}}. Bản chốt này là điểm chính thức có thể xuất ra Excel; điểm tham khảo vẫn tiếp tục cập nhật.':
    'The current scores of {{n}} students will be stored as a snapshot with formula version {{v}}. The snapshot is the official score and can be exported to Excel; the reference score keeps updating.',
  'Đã lưu công thức – phiên bản {{v}}': 'Formula saved – version {{v}}',
  'Đang dùng phiên bản công thức {{v}}. Mỗi lần lưu tạo một phiên bản mới; các bản chốt cũ giữ nguyên phiên bản đã dùng.':
    'Currently using formula version {{v}}. Each save creates a new version; earlier snapshots keep the version they used.',
  'Lưu công thức': 'Save formula',
  'Trọng số (%)': 'Weights (%)',
  'Tổng: {{sum}}/100': 'Total: {{sum}}/100',
  'Giới hạn mỗi buổi': 'Cap per session',
  'Số đóng góp tối đa được tính trong một buổi (1–20), để tránh spam.': 'Maximum contributions counted per session (1–20), to prevent spam.',
  'Buổi học được tính': 'Sessions counted',
  'Tất cả các buổi đã diễn ra': 'All sessions held',
  'Chỉ các buổi sinh viên có mặt': 'Only sessions the student attended',
  'Đã xóa điều chỉnh': 'Adjustment removed',
  'Đã lưu điều chỉnh': 'Adjustment saved',
  'Điều chỉnh điểm': 'Adjust score',
  'Xóa điều chỉnh': 'Remove adjustment',
  'Điểm theo công thức: {{raw}}. Điểm sau điều chỉnh được giới hạn trong 0–100.': 'Formula score: {{raw}}. The adjusted score is limited to 0–100.',
  'Cộng/trừ điểm (−100 đến 100)': 'Points to add/subtract (−100 to 100)',
  'Giá trị phải từ −100 đến 100': 'The value must be between −100 and 100',
  'Ghi chú': 'Note',
  'Lý do điều chỉnh (ví dụ: trình bày tốt trên lớp). Để 0 và bỏ trống ghi chú để xóa điều chỉnh.':
    'Reason for the adjustment (e.g. a good in-class presentation). Set 0 and leave the note empty to remove the adjustment.',

  // Student view
  'Điểm tham khảo': 'Reference score',
  'Điểm tham gia (0–100) tính trên {{n}} buổi học đã diễn ra': 'Engagement score (0–100) based on {{n}} sessions held',
  'Chưa có cơ hội tham gia nào được tính': 'No participation opportunities counted yet',
  'Theo công thức {{raw}}, điều chỉnh của giảng viên {{adj}}': 'Formula {{raw}}, lecturer adjustment {{adj}}',
  'trên 100': 'out of 100',
  '{{done}}/{{possible}} · trọng số {{w}}%': '{{done}}/{{possible}} · weight {{w}}%',
  'Chưa có cơ hội – không tính': 'No opportunity yet – not counted',
  'Đây là điểm tham khảo, không phải điểm chính thức. Điểm chỉ tính trên các cơ hội thực sự đã có (buổi học đã diễn ra, hoạt động đã mở); mỗi buổi chỉ tính một số đóng góp tối đa. Điểm chỉ được dùng chính thức sau khi giảng viên xác nhận.':
    'This is a reference score, not an official grade. It only counts opportunities that actually happened (sessions held, activities opened), and only a limited number of contributions per session. It is used officially only after the lecturer confirms it.',

  // Class settings
  'Tự động phân loại chủ đề, gom nhóm câu hỏi và tóm tắt khi kết thúc buổi học': 'Automatically classify topics, cluster questions and summarise when a session ends',
  'Bản tóm tắt AI luôn là bản nháp cho tới khi giảng viên duyệt.': 'AI summaries always stay drafts until the lecturer approves them.',
  'Điểm tham khảo tính từ các cơ hội tham gia thực tế; chỉ là điểm chính thức sau khi giảng viên xác nhận.':
    'A reference score computed from actual participation opportunities; it becomes official only after the lecturer confirms it.',
  'Mỗi sinh viên chỉ xem được điểm của chính mình, kèm giải thích cách tính.': 'Each student only sees their own score, with an explanation of how it is computed.',

  // AI settings
  'Trả lời câu hỏi': 'Answer questions',
  'Mô hình theo tác vụ': 'Models per task',
  'Chọn nhà cung cấp và mô hình riêng cho từng tác vụ AI. Để trống để dùng nhà cung cấp mặc định và mô hình của nhà cung cấp đó.':
    'Choose a provider and model for each AI task. Leave empty to use the default provider and its model.',
  'Mặc định ({{name}})': 'Default ({{name}})',
  'Chọn nhà cung cấp để dùng mô hình riêng': 'Choose a provider to use a specific model',
  'Model ID để trống: dùng mô hình đã cấu hình của nhà cung cấp đó. Nếu nhà cung cấp lỗi, hệ thống dùng thứ tự dự phòng.':
    'Empty model ID: the configured model of that provider is used. If the provider fails, the fallback order applies.',
  'Embedding (gom nhóm theo ngữ nghĩa)': 'Embeddings (semantic clustering)',
  'Dùng để gom nhóm câu hỏi tương tự và phát hiện câu hỏi trùng. Claude không có API embedding nên chỉ chọn được OpenAI hoặc Gemini; nếu không có, hệ thống dùng AI để gom nhóm.':
    'Used to cluster similar questions and detect duplicates. Claude has no embedding API, so only OpenAI or Gemini can be chosen; without them the system clusters with the language model.',
  'Khôi phục mặc định': 'Restore defaults',
  'Tự động (OpenAI, sau đó Gemini)': 'Automatic (OpenAI, then Gemini)',
  'Chế độ tự động dùng mô hình mặc định của nhà cung cấp': 'Automatic mode uses the provider’s default model',
  'Ngưỡng tương đồng': 'Similarity threshold',
  'Ngưỡng phải từ 0.3 đến 0.99': 'The threshold must be between 0.3 and 0.99',
  'Mặc định 0.6 (OpenAI) / 0.8 (Gemini). Cao hơn = nhóm chặt hơn.': 'Default 0.6 (OpenAI) / 0.8 (Gemini). Higher = tighter clusters.',
};

export default en;

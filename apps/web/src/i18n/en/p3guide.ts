/** English for the student start guide, the per-session checklist and the score breakdown ("how to raise your score"). */
const en: Record<string, string> = {
  // Score breakdown
  'Làm đủ các hoạt động giảng viên mở trong buổi học (thăm dò, câu hỏi nhanh, kiểm tra mức hiểu bài). Bạn đã làm {{done}}/{{possible}}.':
    'Complete every activity the lecturer opens in class (polls, quick questions, understanding checks). You have done {{done}}/{{possible}}.',
  'Trả lời, bình luận hoặc thảo luận câu hỏi của bạn khác: mỗi buổi được tính tối đa {{cap}} lần. Bạn đang có {{done}}/{{possible}}.':
    'Answer, comment on or discuss your classmates’ questions: up to {{cap}} per session count. You have {{done}}/{{possible}}.',
  'Đặt câu hỏi liên quan đến bài học: mỗi buổi được tính tối đa {{cap}} câu. Bạn đang có {{done}}/{{possible}}.':
    'Ask questions about the lesson: up to {{cap}} per session count. You have {{done}}/{{possible}}.',
  'Trả lời câu hỏi của bạn khác thật kỹ để giảng viên xác nhận là câu trả lời đúng: mỗi buổi được tính tối đa {{cap}} câu. Bạn đang có {{done}}/{{possible}}.':
    'Answer classmates’ questions carefully so the lecturer confirms your answer as correct: up to {{cap}} per session count. You have {{done}}/{{possible}}.',
  'Nộp phiếu cuối buổi mỗi khi giảng viên mở. Bạn đã nộp {{done}}/{{possible}}.': 'Submit the exit ticket whenever the lecturer opens one. You have submitted {{done}}/{{possible}}.',
  'Không tính điểm': 'Not scored',
  'Cách tăng điểm': 'How to raise your score',
  'Sinh viên cần làm gì để tăng điểm': 'What the student can do to raise the score',
  'Chưa có buổi học nào được tính điểm.': 'No session has been scored yet.',
  'Đã đạt tối đa ở mọi phần đang được tính. Hãy giữ nhịp này ở các buổi sau.': 'Full marks on every part counted so far. Keep it up in the next sessions.',
  'thiếu {{gain}} điểm': '{{gain}} points missing',
  'Mỗi buổi chỉ tính trong buổi đó, các buổi đã qua không làm bù được. Tham gia đủ ở mỗi buổi tiếp theo sẽ kéo điểm lên dần.':
    'Each session only counts within that session; past sessions cannot be made up. Taking full part in every upcoming session raises the score step by step.',
  'Theo từng buổi học': 'Session by session',
  'Có mặt': 'Present',

  // Scores page
  'Để chống spam, mỗi buổi chỉ tính tối đa {{answers}} trả lời/thảo luận, {{questions}} câu hỏi và {{helpful}} câu trả lời được giảng viên xác nhận.':
    'To prevent spam, each session counts at most {{answers}} answers/discussion posts, {{questions}} questions and {{helpful}} answers confirmed by the lecturer.',
  'Phần "GV xác nhận" chỉ có điểm khi giảng viên xác nhận câu trả lời: trong màn hình buổi học, bấm ⋮ ở một câu trả lời tốt rồi chọn "Xác nhận câu trả lời đúng". Bấm vào tên sinh viên để xem chi tiết và cách tăng điểm.':
    'The "Lecturer-confirmed" part only scores when the lecturer confirms answers: in the session view, click ⋮ on a good answer and choose "Mark as correct answer". Click a student’s name to see the details and how to raise the score.',
  'Không đưa vào bản xác nhận điểm và không gửi về Moodle': 'Left out of confirmed scores and not sent to Moodle',
  'Không tính điểm tài khoản này': 'Do not score this account',
  'Dùng cho tài khoản thử hoặc người không học lớp này: vẫn hiện trong bảng nhưng không đưa vào bản xác nhận điểm và không gửi về Moodle.':
    'For test accounts or people not taking this class: still listed, but left out of confirmed scores and not sent to Moodle.',

  // Session checklist
  'Vào buổi học (tự điểm danh khi bạn mở trang này)': 'Join the session (attendance is recorded when you open this page)',
  'Đặt câu hỏi: {{n}}/{{cap}}': 'Ask questions: {{n}}/{{cap}}',
  'Trả lời hoặc thảo luận câu hỏi của bạn khác: {{n}}/{{cap}}': 'Answer or discuss classmates’ questions: {{n}}/{{cap}}',
  'Làm hoạt động giảng viên mở: {{n}}/{{total}}': 'Do the activities the lecturer opened: {{n}}/{{total}}',
  'Nộp phiếu cuối buổi: {{n}}/{{total}}': 'Submit the exit ticket: {{n}}/{{total}}',
  'Nhiệm vụ buổi này': 'Tasks for this session',
  'Đã đủ, tuyệt vời!': 'All done, great work!',
  'Đã xong {{n}}/{{total}}': '{{n}}/{{total}} done',
  'Có {{n}} hoạt động đang mở chờ bạn ở tab "Hoạt động".': '{{n}} open activities are waiting for you in the "Activities" tab.',
  'Mỗi buổi chỉ tính đến mức tối đa ở trên; làm nhiều hơn không cộng thêm điểm.': 'Each session counts up to the limits above; doing more adds no extra points.',

  // Start guide
  'Bắt đầu từ đây': 'Start here',
  'Xem hướng dẫn': 'Show the guide',
  'Vào buổi đang diễn ra: {{name}}': 'Join the live session: {{name}}',
  'Hiện chưa có buổi học nào đang mở. Khi giảng viên mở buổi, nút vào buổi sẽ hiện ở đây; bạn vẫn có thể xem lại hỏi đáp của các buổi trước ở danh sách bên dưới.':
    'No session is open right now. When the lecturer opens one, the join button appears here; meanwhile you can review the Q&A of earlier sessions below.',
  'Vào buổi học': 'Join the session',
  'Bấm nút vào buổi đang diễn ra. Hệ thống tự điểm danh khi bạn mở buổi.': 'Click the live-session button. Your attendance is recorded when you open the session.',
  'Làm hoạt động': 'Do the activities',
  'Mở tab "Hoạt động" để trả lời thăm dò, câu hỏi nhanh và phiếu cuối buổi khi giảng viên mở.': 'Open the "Activities" tab to answer polls, quick questions and the exit ticket when the lecturer opens them.',
  'Hỏi và trả lời': 'Ask and answer',
  'Ở tab "Hỏi đáp", đặt câu hỏi về bài học và trả lời, bình luận câu hỏi của bạn khác.': 'In the "Q&A" tab, ask questions about the lesson and answer or comment on your classmates’ questions.',
  'Theo dõi điểm': 'Track your score',
  'Bấm "Mức độ tham gia của tôi" để xem mình đã làm gì và còn thiếu gì để tăng điểm.': 'Click "My participation" to see what you have done and what is still missing to raise your score.',
  'Điểm tham gia được tính từ 5 việc': 'Your participation score comes from 5 things',
  'Mỗi buổi tính tối đa {{q}} câu hỏi, {{a}} lần trả lời/thảo luận và {{h}} câu trả lời được giảng viên xác nhận. Buổi đã qua không làm bù được, nên hãy tham gia đều ở mọi buổi.':
    'Each session counts at most {{q}} questions, {{a}} answers/discussion posts and {{h}} answers confirmed by the lecturer. Past sessions cannot be made up, so take part in every session.',

  // Batch 2: weekly recap, next session
  '7 ngày qua': 'Last 7 days',
  'Có mặt {{n}}/{{total}} buổi': 'Present at {{n}}/{{total}} sessions',
  '{{n}} câu hỏi': '{{n}} questions',
  '{{n}} trả lời/thảo luận': '{{n}} answers/discussion posts',
  'Buổi tới:': 'Next session:',

  // Batch 2: answers awaiting confirmation
  'Xác nhận câu trả lời': 'Confirm answers',
  'Đã xác nhận {{n}} câu trả lời': '{{n}} answers confirmed',
  'Mỗi câu trả lời được xác nhận giúp tác giả có điểm phần "Câu trả lời được giảng viên xác nhận" và đánh dấu câu hỏi là đã được trả lời. Câu trả lời được các bạn bấm "Hữu ích" nhiều được xếp lên đầu.':
    'Each confirmed answer earns its author points in "Answers confirmed by the lecturer" and marks the question as answered. Answers that classmates marked "Helpful" most come first.',
  'Tất cả các buổi': 'All sessions',
  'Chọn tất cả ({{n}})': 'Select all ({{n}})',
  'Xác nhận đã chọn ({{n}})': 'Confirm selected ({{n}})',
  'Không còn câu trả lời nào chờ xác nhận': 'No answers waiting for confirmation',
  'Chọn câu trả lời của {{name}}': 'Select the answer by {{name}}',
  '{{n}} bạn thấy hữu ích': '{{n}} found it helpful',

  // Batch 2: early warning and reminders
  'Chưa vào buổi nào': 'Never joined a session',
  'Vắng các buổi gần đây': 'Missed recent sessions',
  'Có vào nhưng chưa đóng góp': 'Joined but no contribution yet',
  'Lý do': 'Reason',
  'Số buổi đã vào': 'Sessions joined',
  'Buổi gần nhất có mặt': 'Last session attended',
  'Sinh viên cần chú ý': 'Students needing attention',
  'Chưa vào buổi nào, vắng {{n}} buổi gần nhất, hoặc có vào nhưng chưa có đóng góp nào. Không gồm tài khoản đã đánh dấu "Không tính điểm".':
    'Never joined a session, missed the last {{n}} sessions, or joined without any contribution. Accounts marked "Not scored" are left out.',
  'Tải CSV': 'Download CSV',
  'Gửi nhắc nhở ({{n}})': 'Send reminder ({{n}})',
  'Tất cả sinh viên đều đang tham gia. Tuyệt vời!': 'Every student is taking part. Great!',
  'Chọn {{name}}': 'Select {{name}}',
  'Xem tất cả {{n}} sinh viên': 'Show all {{n}} students',
  'Đã gửi nhắc nhở cho {{n}} sinh viên': 'Reminder sent to {{n}} students',
  'Gửi nhắc nhở': 'Send reminder',
  '{{n}} sinh viên sẽ nhận thông báo trong ClassInteract (biểu tượng chuông).': '{{n}} students will get an in-app notification in ClassInteract (bell icon).',
  'Để trống để dùng lời nhắn mặc định: nhắc vào buổi, đặt câu hỏi, trả lời và làm hoạt động.':
    'Leave empty to use the default message: join the session, ask, answer and do the activities.',
  'Lời nhắn (không bắt buộc)': 'Message (optional)',

  // Batch 3: badges, streak, class goals, waiting questions, summaries
  'Bước đầu tiên': 'First step',
  'Vào buổi học đầu tiên': 'Join your first session',
  'Người hay hỏi': 'Curious mind',
  'Đặt đủ số câu hỏi được tính trong {{n}} buổi': 'Ask the full number of counted questions in {{n}} sessions',
  'Người giải đáp': 'Helper',
  'Trả lời, thảo luận đủ mức được tính trong {{n}} buổi': 'Reach the counted number of answers/discussion posts in {{n}} sessions',
  'Được giảng viên công nhận': 'Recognised by the lecturer',
  'Có câu trả lời được giảng viên xác nhận': 'Have an answer confirmed by the lecturer',
  'Không bỏ hoạt động nào': 'Never missed an activity',
  'Làm đủ mọi hoạt động đã mở (từ 3 hoạt động trở lên)': 'Complete every activity opened (3 or more)',
  'Tổng kết đều đặn': 'Steady reflector',
  'Nộp đủ mọi phiếu cuối buổi (từ 2 phiếu trở lên)': 'Submit every exit ticket (2 or more)',
  'Chuyên cần': 'Always there',
  'Có mặt ở mọi buổi đã diễn ra (từ 3 buổi trở lên)': 'Attend every session held (3 or more)',
  'Huy hiệu của bạn': 'Your badges',
  'Mỗi huy hiệu ứng với một việc được tính vào điểm tham gia. Huy hiệu chỉ hiện với bạn, không có bảng xếp hạng.':
    'Each badge matches something that counts towards your participation score. Badges are visible only to you; there is no ranking.',
  '{{n}}/{{total}} huy hiệu': '{{n}}/{{total}} badges',
  'Chuỗi có mặt hiện tại: {{n}} buổi liên tiếp': 'Current attendance streak: {{n}} sessions in a row',
  'Chưa có chuỗi có mặt. Vào buổi tới để bắt đầu chuỗi!': 'No attendance streak yet. Join the next session to start one!',
  'dài nhất {{n}} buổi': 'longest {{n}} sessions',
  'Câu hỏi của cả lớp': 'Questions from the whole class',
  'Trả lời và thảo luận của cả lớp': 'Answers and discussion from the whole class',
  'Mục tiêu của cả lớp': 'Class goals',
  'Cả lớp cùng góp để chạm mốc tiếp theo.': 'Everyone contributes to reach the next milestone together.',
  'Chuỗi của bạn: {{n}} buổi': 'Your streak: {{n}} sessions',
  'Còn {{n}} nữa để chạm mốc {{target}}': '{{n}} more to reach {{target}}',
  'Có tóm tắt': 'Summary available',
  'Câu hỏi đang chờ bạn trả lời': 'Questions waiting for your answer',
  'Trả lời câu hỏi của bạn khác là cách ôn bài tốt và được tính vào phần "Trả lời/thảo luận" của điểm tham gia.':
    'Answering classmates’ questions is good revision and counts towards the "Answers/discussion" part of your participation score.',
};

export default en;

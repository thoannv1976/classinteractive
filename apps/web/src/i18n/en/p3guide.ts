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
};

export default en;

import type {
  ActivityStatus,
  ActivityType,
  ClassStatus,
  PostType,
  QuestionStatus,
  Reaction,
  SessionStatus,
  UserRole,
  UserStatus,
} from './constants';

export const ROLE_LABELS: Record<UserRole, string> = {
  student: 'Sinh viên',
  lecturer: 'Giảng viên',
  admin: 'Quản trị',
  superadmin: 'Quản trị cấp cao',
};

export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  active: 'Hoạt động',
  disabled: 'Đã khóa',
};

export const CLASS_STATUS_LABELS: Record<ClassStatus, string> = {
  active: 'Đang hoạt động',
  locked: 'Đã khóa',
  archived: 'Lưu trữ',
};

export const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
  draft: 'Chưa bắt đầu',
  open: 'Đang diễn ra',
  paused: 'Tạm dừng',
  closed: 'Đã kết thúc',
  archived: 'Lưu trữ',
};

export const POST_TYPE_LABELS: Record<PostType, string> = {
  question: 'Câu hỏi',
  answer: 'Trả lời',
  comment: 'Bình luận',
  reflection: 'Nhận xét',
  discussion: 'Thảo luận',
};

export const QUESTION_STATUS_LABELS: Record<QuestionStatus, string> = {
  new: 'Mới',
  answered: 'Đã trả lời',
  need_clarification: 'Cần làm rõ',
  resolved: 'Đã giải quyết',
  archived: 'Lưu trữ',
};

export const REACTION_LABELS: Record<Reaction, string> = {
  agree: 'Đồng ý',
  disagree: 'Không đồng ý',
  helpful: 'Hữu ích',
  same_question: 'Tôi cũng có câu hỏi này',
  need_explanation: 'Cần giải thích thêm',
  understood: 'Đã hiểu',
};

export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  free_text: 'Trả lời tự do',
  poll: 'Khảo sát',
  quiz: 'Trắc nghiệm nhanh',
  understanding: 'Kiểm tra mức độ hiểu',
};

export const ACTIVITY_STATUS_LABELS: Record<ActivityStatus, string> = {
  draft: 'Nháp',
  open: 'Đang mở',
  closed: 'Đã đóng',
};

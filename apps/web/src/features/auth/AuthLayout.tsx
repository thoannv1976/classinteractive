import type { ReactNode } from 'react';
import { BarChart3, MessageCircleQuestion, Sparkles } from 'lucide-react';

export function AuthLayout({ children, title, subtitle }: { children: ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-blue-800 via-blue-700 to-teal-700 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3">
          <img src="/favicon.svg" alt="" className="h-10 w-10 rounded-xl ring-2 ring-white/30" />
          <span className="text-lg font-semibold">ClassInteract AI</span>
        </div>
        <div className="max-w-lg">
          <h2 className="text-3xl font-semibold leading-tight">Biến tương tác trên lớp thành dữ liệu học tập có cấu trúc</h2>
          <p className="mt-4 text-blue-100">Hỏi đáp như nhóm chat, nhưng mọi câu hỏi, câu trả lời và hoạt động đều gắn với lớp, buổi học và chủ đề kiến thức.</p>
          <ul className="mt-8 space-y-4 text-sm">
            <li className="flex items-center gap-3"><MessageCircleQuestion className="h-5 w-5 text-orange-300" /> Hỏi đáp và hoạt động trực tiếp theo từng buổi học</li>
            <li className="flex items-center gap-3"><BarChart3 className="h-5 w-5 text-teal-200" /> Thống kê mức độ tham gia của từng sinh viên</li>
            <li className="flex items-center gap-3"><Sparkles className="h-5 w-5 text-violet-200" /> AI hỗ trợ giảng viên, giảng viên luôn là người quyết định</li>
          </ul>
        </div>
        <p className="text-xs text-blue-200">Smart Classroom Engagement &amp; Analytics Platform</p>
      </div>
      <div className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <img src="/favicon.svg" alt="" className="h-9 w-9" />
            <span className="font-semibold">ClassInteract AI</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}
          <div className="mt-8">{children}</div>
        </div>
      </div>
    </div>
  );
}

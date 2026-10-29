import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError, type ZodType } from 'zod';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, 'BAD_REQUEST', message, details);
export const unauthorized = (message = 'Bạn cần đăng nhập') => new AppError(401, 'UNAUTHENTICATED', message);
export const forbidden = (message = 'Bạn không có quyền thực hiện thao tác này') =>
  new AppError(403, 'FORBIDDEN', message);
export const notFound = (message = 'Không tìm thấy dữ liệu') => new AppError(404, 'NOT_FOUND', message);
export const conflict = (message: string, code = 'CONFLICT') => new AppError(409, code, message);
export const tooMany = (message: string) => new AppError(429, 'RATE_LIMITED', message);

/** Validate input with a Zod schema and throw a 400 with field errors. */
export function parse<T extends ZodType>(schema: T, data: unknown): import('zod').infer<T> {
  const r = schema.safeParse(data ?? {});
  if (!r.success) throw zodToAppError(r.error);
  return r.data;
}

export function zodToAppError(err: ZodError) {
  const fields = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
  return new AppError(400, 'VALIDATION_ERROR', fields[0]?.message ?? 'Dữ liệu không hợp lệ', fields);
}

export function errorHandler(err: FastifyError | Error, req: FastifyRequest, reply: FastifyReply) {
  if (err instanceof ZodError) err = zodToAppError(err);
  if (err instanceof AppError) {
    if (err.statusCode >= 500) req.log.error({ err }, err.message);
    return reply.status(err.statusCode).send({ error: { code: err.code, message: err.message, details: err.details } });
  }
  const fe = err as FastifyError;
  if (fe.statusCode === 429) {
    return reply.status(429).send({ error: { code: 'RATE_LIMITED', message: 'Bạn thao tác quá nhanh, vui lòng thử lại sau' } });
  }
  if (fe.validation || (fe.statusCode && fe.statusCode < 500)) {
    return reply.status(fe.statusCode ?? 400).send({ error: { code: fe.code ?? 'BAD_REQUEST', message: fe.message } });
  }
  req.log.error({ err }, 'Unhandled error');
  return reply.status(500).send({ error: { code: 'INTERNAL', message: 'Lỗi hệ thống, vui lòng thử lại' } });
}

/**
 * 考勤附件按类型分流：PDF 与图片可以在页面里直接查看，Word / Excel 只能下载后再看。
 * 允许上传的类型以后端 middleware/attendance-attachments.js 为准，这里只决定「能不能内联预览」。
 */
export type AttachmentPreviewKind = 'pdf' | 'image' | 'none'

export function attachmentPreviewKind(mimeType?: string): AttachmentPreviewKind {
  const mime = String(mimeType ?? '').toLowerCase()
  if (mime === 'application/pdf') return 'pdf'
  if (mime.startsWith('image/')) return 'image'
  return 'none'
}

/** 能内联查看（PDF / 图片）返回 true；Word、Excel 返回 false，界面按「下载后查看」处理。 */
export function canPreviewAttachment(mimeType?: string) {
  return attachmentPreviewKind(mimeType) !== 'none'
}

/** 附件大小展示：不足 1MB 用 KB（至少 1KB），否则保留一位小数的 MB。 */
export function formatFileSize(size: number) {
  return size < 1024 * 1024 ? `${Math.max(1, Math.ceil(size / 1024))} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`
}

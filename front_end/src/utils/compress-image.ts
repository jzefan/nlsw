/**
 * 上传前压缩回执图片（浏览器 canvas 实现，零依赖）。
 *
 * 背景：线上 `uploads/receipts` 累积到 29G，平均 3MB/张 —— 全是没压过的手机原图。
 * 在「选取文件」这一步就压掉，既省上传带宽，也从源头上不再往服务器堆。
 *
 * 约束：**保持原格式与文件名后缀不变**。服务端用扩展名生成落盘文件名并写进
 * `receiptimages.file_path`，后缀和真实格式不符会让下游处理（sharp / 图片查看器）出问题。
 *
 * 任何一步失败都直接返回原文件 —— 压缩是优化，不能拦住上传。
 */

export interface CompressImageOptions {
  /** 长边上限（像素），默认 1600 */
  maxSize?: number
  /** JPEG / WebP 质量 0–1，默认 0.82 */
  quality?: number
  /** 小于该体积不压（字节），默认 300KB */
  minBytes?: number
}

const DEFAULT_OPTIONS: Required<CompressImageOptions> = {
  maxSize: 1600,
  quality: 0.82,
  minBytes: 300 * 1024,
}

/** 只压这些类型，且保持同格式输出 */
const OUTPUT_TYPES: Record<string, string> = {
  'image/jpeg': 'image/jpeg',
  'image/jpg': 'image/jpeg',
  'image/png': 'image/png',
  'image/webp': 'image/webp',
}

/**
 * 纯函数：按长边上限等比缩放。只缩不放。
 * 返回 [宽, 高]（整数，最小 1）。
 */
export function computeTargetSize(
  width: number,
  height: number,
  maxSize: number,
): [number, number] {
  if (width <= 0 || height <= 0)
    return [width, height]
  const longEdge = Math.max(width, height)
  if (longEdge <= maxSize)
    return [width, height]
  const scale = maxSize / longEdge
  return [Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))]
}

/** 该文件是否值得压缩 */
export function shouldCompress(file: File, options?: CompressImageOptions): boolean {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  if (!OUTPUT_TYPES[file.type])
    return false
  return file.size >= opts.minBytes
}

/** 解码图片：优先 createImageBitmap（可正确处理 EXIF 方向），失败回落 <img> */
async function decodeImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    }
    catch {
      // 某些浏览器不认 imageOrientation 选项，退到默认参数再试一次
      try {
        return await createImageBitmap(file)
      }
      catch {
        // 落到下面的 <img> 分支
      }
    }
  }

  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('图片解码失败'))
    }
    img.src = url
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    if (typeof canvas.toBlob === 'function') {
      canvas.toBlob(blob => resolve(blob), type, quality)
      return
    }
    // 极老浏览器兜底：dataURL → Blob
    try {
      const dataUrl = canvas.toDataURL(type, quality)
      const [meta, base64] = dataUrl.split(',')
      const mime = /:(.*?);/.exec(meta)?.[1] || type
      const bytes = atob(base64)
      const buffer = new Uint8Array(bytes.length)
      for (let i = 0; i < bytes.length; i += 1)
        buffer[i] = bytes.charCodeAt(i)
      resolve(new Blob([buffer], { type: mime }))
    }
    catch {
      resolve(null)
    }
  })
}

/**
 * 压缩单张图片。返回新的 File（文件名与扩展名不变）；
 * 不需要压 / 压完反而更大 / 出任何错，都返回原文件。
 */
export async function compressImageFile(
  file: File,
  options?: CompressImageOptions,
): Promise<File> {
  const opts = { ...DEFAULT_OPTIONS, ...options }

  if (!shouldCompress(file, opts))
    return file

  const outputType = OUTPUT_TYPES[file.type]

  try {
    const source = await decodeImage(file)
    const sourceWidth = source.width
    const sourceHeight = source.height
    const [targetWidth, targetHeight] = computeTargetSize(sourceWidth, sourceHeight, opts.maxSize)

    const canvas = document.createElement('canvas')
    canvas.width = targetWidth
    canvas.height = targetHeight

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      if ('close' in source)
        source.close()
      return file
    }

    // PNG 保真优先（截图类回单文字更清晰），其余给高质量插值
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    // JPEG 没有透明通道，先铺白底，避免透明区域变黑
    if (outputType === 'image/jpeg') {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, targetWidth, targetHeight)
    }
    ctx.drawImage(source as CanvasImageSource, 0, 0, targetWidth, targetHeight)
    if ('close' in source)
      source.close()

    const blob = await canvasToBlob(canvas, outputType, opts.quality)
    if (!blob)
      return file

    // 压完没变小就不换（不为 1% 的收益重新编码一次损失画质）
    if (blob.size >= file.size * 0.95)
      return file

    return new File([blob], file.name, {
      type: outputType,
      lastModified: file.lastModified,
    })
  }
  catch {
    return file
  }
}

/**
 * 批量压缩。逐个处理并回调进度，任何一张失败都保留原文件。
 */
export async function compressImageFiles(
  files: File[],
  options?: CompressImageOptions,
  onProgress?: (done: number, total: number) => void,
): Promise<File[]> {
  const result: File[] = []
  for (let i = 0; i < files.length; i += 1) {
    result.push(await compressImageFile(files[i], options))
    onProgress?.(i + 1, files.length)
  }
  return result
}

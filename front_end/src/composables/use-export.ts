import ExcelJS from 'exceljs'
import { ref } from 'vue'
import { toast } from 'vue-sonner'
import * as XLSX from 'xlsx'

export interface ExportColumn {
  /** 表头名称 */
  header: string
  /** 数据字段名 */
  key: string
  /** 格式化函数 */
  formatter?: (value: any, row: any) => any
  /** 单元格类型提示（用于设置 Excel 数字格式） */
  type?: 'number' | 'date' | 'datetime' | 'weight' | 'amount'
}

export interface ExportOptions {
  /** 文件名（不含扩展名） */
  fileName: string
  /** 工作表名称 */
  sheetName?: string
  /** 列定义 */
  columns: ExportColumn[]
  /** 数据 */
  data: any[]
}

export interface ExportAOAOptions {
  /** AOA 数据（二维数组） */
  aoa: any[][]
  /** 文件名（不含扩展名） */
  fileName: string
  /** 工作表名称 */
  sheetName?: string
  /** 每列的数字格式（按索引，跳过表头行自动应用到数据行） */
  columnFormats?: (string | null | undefined)[]
  /** 冻结首行 */
  freezeHeader?: boolean
  /** 首行自动筛选 */
  autoFilter?: boolean
}

export interface ExportBufferOptions {
  /** 文件名（不含扩展名） */
  fileName: string
  /** 生成 buffer 的函数（延迟到确认时执行） */
  generateBuffer: () => Promise<ArrayBuffer | Uint8Array>
}

type PendingExport = {
  type: 'columns'
  options: ExportOptions
} | {
  type: 'aoa'
  options: ExportAOAOptions
} | {
  type: 'buffer'
  options: ExportBufferOptions
}

/**
 * 导出功能 composable
 */
export function useExport() {
  // 对话框状态
  const showExportDialog = ref(false)
  const exportFileName = ref('')
  const pendingExport = ref<PendingExport | null>(null)

  /**
   * 自动检测 Date 类型的单元格并设置 Excel 日期格式
   */
  function applyDateFormats(ws: XLSX.WorkSheet) {
    const ref = ws['!ref']
    if (!ref) return
    const range = XLSX.utils.decode_range(ref)
    for (let R = range.s.r; R <= range.e.r; R++) {
      for (let C = range.s.c; C <= range.e.c; C++) {
        const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })]
        if (cell && cell.v instanceof Date) {
          const d = cell.v as Date
          const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0 || d.getSeconds() !== 0
          cell.z = hasTime ? 'yyyy-mm-dd hh:mm' : 'yyyy-mm-dd'
        }
      }
    }
  }

  function getCellDisplayText(value: any) {
    if (value instanceof Date) {
      const hasTime = value.getHours() !== 0 || value.getMinutes() !== 0 || value.getSeconds() !== 0
      return hasTime ? 'yyyy-mm-dd hh:mm' : 'yyyy-mm-dd'
    }
    return String(value ?? '')
  }

  function getDisplayWidth(value: any) {
    const text = getCellDisplayText(value)
    return [...text].reduce((sum, char) => {
      return sum + (char.charCodeAt(0) > 127 ? 2 : 1)
    }, 0)
  }

  function buildColumnWidths(matrix: any[][]) {
    if (matrix.length === 0) return []
    const columnCount = Math.max(...matrix.map(row => row.length))
    return Array.from({ length: columnCount }, (_, colIdx) => {
      let maxWidth = 0
      matrix.forEach((row) => {
        maxWidth = Math.max(maxWidth, getDisplayWidth(row[colIdx]))
      })
      return {
        wch: Math.max(8, maxWidth + 2),
      }
    })
  }

  /**
   * 生成工作簿（从列定义）
   */
  function generateWorkbook(options: ExportOptions): XLSX.WorkBook {
    const { columns, data, sheetName } = options

    // 构建表头
    const headers = columns.map(col => col.header)

    // 构建数据行
    const rows = data.map((row) => {
      return columns.map((col) => {
        const value = row[col.key]
        if (col.formatter) {
          return col.formatter(value, row)
        }
        return value
      })
    })

    // 创建工作表
    const aoa = [headers, ...rows]
    const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true })

    // 为有类型标记的列设置 Excel 数字格式
    const fmtMap: Record<string, string> = {
      date: 'yyyy-mm-dd',
      datetime: 'yyyy-mm-dd hh:mm',
      weight: '0.000',
      amount: '0.00',
    }
    columns.forEach((col, colIdx) => {
      if (!col.type) return
      const fmt = fmtMap[col.type]
      if (!fmt) return
      for (let rowIdx = 1; rowIdx <= rows.length; rowIdx++) {
        const cellRef = XLSX.utils.encode_cell({ r: rowIdx, c: colIdx })
        const cell = ws[cellRef]
        if (cell && cell.v != null && cell.v !== '') cell.z = fmt
      }
    })

    // 自动检测 Date 对象并设置格式（兜底）
    applyDateFormats(ws)

    // 自动调整列宽
    ws['!cols'] = buildColumnWidths(aoa)

    // 创建工作簿
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, sheetName || 'Sheet1')

    return wb
  }

  /**
   * 生成工作簿（从 AOA）
   */
  function generateWorkbookFromAOA(options: ExportAOAOptions): XLSX.WorkBook {
    const { aoa, sheetName, columnFormats, freezeHeader, autoFilter } = options
    const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true })

    // 应用列数字格式（跳过第一行表头）
    if (columnFormats && aoa.length > 1) {
      columnFormats.forEach((fmt, colIdx) => {
        if (!fmt) return
        for (let rowIdx = 1; rowIdx < aoa.length; rowIdx++) {
          const cellRef = XLSX.utils.encode_cell({ r: rowIdx, c: colIdx })
          const cell = ws[cellRef]
          if (cell && cell.v != null && cell.v !== '') cell.z = fmt
        }
      })
    }

    // 自动检测 Date 对象并设置格式
    applyDateFormats(ws)

    // 自动调整列宽
    ws['!cols'] = buildColumnWidths(aoa)

    // 自动筛选（SheetJS 支持）
    if (autoFilter && aoa.length > 0) {
      const colCount = aoa[0].length
      ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } }) }
    }

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, sheetName || 'Sheet1')

    return wb
  }

  /**
   * 直接导出（使用默认文件名，直接下载）
   */
  function exportDirect(options: ExportOptions) {
    try {
      const wb = generateWorkbook(options)
      XLSX.writeFile(wb, `${options.fileName}.xlsx`)
      toast.success('导出成功')
    }
    catch (error: any) {
      console.error('Export error:', error)
      toast.error('导出失败', { description: error.message })
    }
  }

  /**
   * 打开导出对话框（列定义方式）
   */
  function exportWithPicker(options: ExportOptions) {
    pendingExport.value = { type: 'columns', options }
    exportFileName.value = options.fileName
    showExportDialog.value = true
  }

  /**
   * 打开导出对话框（预生成 buffer 方式，适用于 ExcelJS 等自定义格式）
   */
  function exportWithBufferPicker(options: ExportBufferOptions) {
    pendingExport.value = { type: 'buffer', options }
    exportFileName.value = options.fileName
    showExportDialog.value = true
  }

  /**
   * 打开导出对话框（AOA 方式）
   */
  function exportFromAOAWithPicker(
    aoa: any[][],
    defaultFileName: string,
    sheetName?: string,
    columnFormats?: (string | null | undefined)[],
    extra?: { freezeHeader?: boolean, autoFilter?: boolean },
  ) {
    pendingExport.value = {
      type: 'aoa',
      options: { aoa, fileName: defaultFileName, sheetName, columnFormats, ...extra },
    }
    exportFileName.value = defaultFileName
    showExportDialog.value = true
  }

  /**
   * 从 AOA（二维数组）直接导出
   */
  function exportFromAOA(aoa: any[][], fileName: string, sheetName?: string, columnFormats?: (string | null | undefined)[]) {
    try {
      const wb = generateWorkbookFromAOA({ aoa, fileName, sheetName, columnFormats })
      XLSX.writeFile(wb, `${fileName}.xlsx`)
      toast.success('导出成功')
    }
    catch (error: any) {
      console.error('Export error:', error)
      toast.error('导出失败', { description: error.message })
    }
  }

  /**
   * 确认导出（由对话框调用）
   */
  async function confirmExport(fileName: string, directoryHandle: FileSystemDirectoryHandle | null) {
    if (!pendingExport.value)
      return

    try {
      const fullFileName = `${fileName}.xlsx`
      let blob: Blob

      if (pendingExport.value.type === 'buffer') {
        // 预生成 buffer（ExcelJS 等）
        const buffer = await pendingExport.value.options.generateBuffer()
        blob = new Blob([buffer instanceof ArrayBuffer ? buffer : new Uint8Array(buffer)], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        })
      }
      else {
        let wb: XLSX.WorkBook
        let needFreeze = false
        if (pendingExport.value.type === 'columns') {
          wb = generateWorkbook(pendingExport.value.options)
        }
        else {
          wb = generateWorkbookFromAOA(pendingExport.value.options)
          needFreeze = !!pendingExport.value.options.freezeHeader
        }
        const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })

        if (needFreeze) {
          // SheetJS 不支持冻结首行，用 ExcelJS 后处理
          const ejsWb = new ExcelJS.Workbook()
          await ejsWb.xlsx.load(wbout)
          ejsWb.eachSheet((sheet) => {
            sheet.views = [{ state: 'frozen', ySplit: 1 }]
          })
          const finalBuf = await ejsWb.xlsx.writeBuffer()
          blob = new Blob([finalBuf], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          })
        }
        else {
          blob = new Blob([wbout], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          })
        }
      }

      if (directoryHandle) {
        const fileHandle = await directoryHandle.getFileHandle(fullFileName, { create: true })
        const writable = await fileHandle.createWritable()
        await writable.write(blob)
        await writable.close()

        toast.success('导出成功', { description: `已保存到 ${directoryHandle.name}/${fullFileName}` })
      }
      else {
        // 保存到默认下载目录
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = fullFileName
        a.click()
        URL.revokeObjectURL(url)
        toast.success('导出成功')
      }
    }
    catch (error: any) {
      console.error('Export error:', error)
      toast.error('导出失败', { description: error.message })
    }
    finally {
      pendingExport.value = null
      showExportDialog.value = false
    }
  }

  /**
   * 取消导出
   */
  function cancelExport() {
    pendingExport.value = null
    showExportDialog.value = false
  }

  return {
    // 对话框状态
    showExportDialog,
    exportFileName,

    // 方法
    exportDirect,
    exportWithPicker,
    exportWithBufferPicker,
    exportFromAOA,
    exportFromAOAWithPicker,
    confirmExport,
    cancelExport,
  }
}

import * as XLSX from 'xlsx'

// ERP raw data types
export interface ERPRawRow {
  bundleNo: string // 捆号
  heatNo: string // 炉号
  orderNo: string // 订单编号
  orderItemNo: string // 订单项次
  weight: number // 重量
  diameter: number // 厚度(直径)
  length: number // 长度
  brandNo: string // 牌号
  quantity: number // 支数
  scaleWeight: number // 过磅重量
  customerName: string // 客户名称
  contractNo?: string // 合同号
  warehouse?: string // 仓库
}

// Aggregated output row
export interface AggregatedRow {
  billNo: string // 提单号
  orderNo: string // 订单号
  orderItemNo: string // 项次号
  brandNo: string // 牌号
  spec: string // 规格(厚x宽x长)
  unitWeight: number // 单重
  quantity: number // 发运数
  totalWeight: number // 发运重量
  warehouse: string // 仓库
  contractNo: string // 合同号
  colorMark: string // 色标
}

// Contract grouped data
export interface ContractGroup {
  contractNo: string
  rows: AggregatedRow[]
  subtotalQuantity: number
  subtotalWeight: number
}

// Header info for output
export interface HeaderInfo {
  invoiceNo: string // 运单号
  billingName: string // 开单名称
  vehicle: string // 车船号
  shipper: string // 发货单位
  shipDate: string // 发货日期
  destination: string // 目的地
}

// Table header mapping for round steel
const roundSteelHeaderMap: Record<string, string> = {
  '捆号': 'bundleNo',
  '炉号': 'heatNo',
  '订单编号': 'orderNo',
  '订单号': 'orderNo',
  '订单': 'orderNo',
  '订单项次': 'orderItemNo',
  '项次号': 'orderItemNo',
  '项次': 'orderItemNo',
  '重量': 'weight',
  '厚度': 'diameter',
  '直径': 'diameter',
  '长度': 'length',
  '牌号': 'brandNo',
  '钢号': 'brandNo',
  '标准全名': 'brandNo',
  '支数': 'quantity',
  '数量': 'quantity',
  '过磅重量': 'scaleWeight',
  '客户名称': 'customerName',
  '客户': 'customerName',
  '现有货主': 'customerName',
  '合同号': 'contractNo',
  '合同': 'contractNo',
  '客户采购案号': 'contractNo',
  '仓库': 'warehouse',
  '发货仓库': 'warehouse',
  '发货库别': 'warehouse',
}

// Table header mapping for plate
const plateHeaderMap: Record<string, string> = {
  ...roundSteelHeaderMap,
  '厚度': 'thickness',
  '厚': 'thickness',
  '宽度': 'width',
  '宽': 'width',
  '长度': 'length',
  '长': 'length',
  '块数': 'quantity',
  '发运数': 'quantity',
}

// Raw Excel data (all columns)
export interface RawExcelData {
  headers: string[] // Original column headers
  rows: Record<string, any>[] // All rows with all columns
}

// Column definition for preview
export interface ColumnDef {
  key: string // Original header name
  mappedKey?: string // Mapped field key (if needed)
  isRequired: boolean // Whether this column is needed for processing
}

export interface ParsedFile {
  fileName: string
  data: ERPRawRow[]
  rowCount: number
  rawData: RawExcelData // Original Excel data with all columns
  columnDefs: ColumnDef[] // Column definitions for preview
}

// Required fields for processing (these columns will be marked with checkmark)
const requiredFields = new Set([
  'orderNo', 'orderItemNo', 'brandNo', 'diameter', 'thickness',
  'length', 'quantity', 'weight', 'customerName', 'contractNo', 'warehouse',
])

/**
 * Parse ERP Excel file
 */
export function parseERPExcel(
  file: File,
  type: 'round-steel' | 'plate' = 'round-steel',
): Promise<ParsedFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = e.target?.result
        const workbook = XLSX.read(data, { type: 'binary' })
        const sheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[sheetName]
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][]

        const headerMap = type === 'round-steel' ? roundSteelHeaderMap : plateHeaderMap

        // Find header row
        let headerRow = -1
        let headers: string[] = []

        for (let i = 0; i < Math.min(jsonData.length, 20); i++) {
          const row = jsonData[i]
          if (row && row.some((cell: any) => cell && (
            cell.toString().includes('订单')
            || cell.toString().includes('捆号')
            || cell.toString().includes('提单')
          ))) {
            headerRow = i
            headers = row.map((cell: any) => cell?.toString().trim() || '')
            break
          }
        }

        if (headerRow === -1) {
          reject(new Error('未找到表头'))
          return
        }

        // Build column definitions - required columns first, then others
        const requiredCols: ColumnDef[] = []
        const otherCols: ColumnDef[] = []

        headers.forEach((header) => {
          if (!header)
            return
          const mappedKey = headerMap[header]
          const isRequired = mappedKey ? requiredFields.has(mappedKey) : false

          const colDef: ColumnDef = {
            key: header,
            mappedKey,
            isRequired,
          }

          if (isRequired) {
            requiredCols.push(colDef)
          }
          else {
            otherCols.push(colDef)
          }
        })

        // Combine: required columns first, then others
        const columnDefs = [...requiredCols, ...otherCols]

        // Parse raw data (all columns)
        const rawRows: Record<string, any>[] = []
        const result: ERPRawRow[] = []

        for (let i = headerRow + 1; i < jsonData.length; i++) {
          const row = jsonData[i]
          if (!row || row.every((cell: any) => !cell))
            continue

          // Store raw row data
          const rawRow: Record<string, any> = {}
          headers.forEach((header, idx) => {
            if (header) {
              rawRow[header] = row[idx] !== undefined && row[idx] !== null ? row[idx] : ''
            }
          })
          rawRows.push(rawRow)

          // Parse mapped data
          const item: any = {}
          headers.forEach((header, idx) => {
            const key = headerMap[header]
            if (key && row[idx] !== undefined && row[idx] !== null && row[idx] !== '') {
              item[key] = row[idx]
            }
          })

          // Validate required fields
          if (item.orderNo) {
            result.push({
              bundleNo: String(item.bundleNo || ''),
              heatNo: String(item.heatNo || ''),
              orderNo: String(item.orderNo || ''),
              orderItemNo: String(item.orderItemNo || '10'),
              weight: Number.parseFloat(item.weight) || 0,
              diameter: Number.parseFloat(item.diameter || item.thickness) || 0,
              length: Number.parseFloat(item.length) || 0,
              brandNo: String(item.brandNo || ''),
              quantity: Number.parseInt(item.quantity) || 1,
              scaleWeight: Number.parseFloat(item.scaleWeight) || 0,
              customerName: String(item.customerName || ''),
              contractNo: String(item.contractNo || ''),
              warehouse: String(item.warehouse || ''),
            })
          }
        }

        resolve({
          fileName: file.name,
          data: result,
          rowCount: result.length,
          rawData: {
            headers,
            rows: rawRows,
          },
          columnDefs,
        })
      }
      catch (err) {
        reject(err)
      }
    }
    reader.onerror = () => reject(new Error('读取文件失败'))
    reader.readAsBinaryString(file)
  })
}

/**
 * Merge multiple file data
 */
export function mergeFiles(files: ParsedFile[]): ERPRawRow[] {
  const merged: ERPRawRow[] = []
  for (const file of files) {
    merged.push(...file.data)
  }
  return merged
}

/**
 * Aggregate by order + item (sum quantity and weight)
 */
export function aggregateByOrderItem(data: ERPRawRow[]): AggregatedRow[] {
  const map = new Map<string, AggregatedRow>()

  for (const row of data) {
    const key = `${row.orderNo}-${row.orderItemNo}`

    if (map.has(key)) {
      const existing = map.get(key)!
      existing.quantity += row.quantity
      existing.totalWeight += row.weight || row.scaleWeight
    }
    else {
      map.set(key, {
        billNo: row.bundleNo,
        orderNo: row.orderNo,
        orderItemNo: row.orderItemNo,
        brandNo: row.brandNo,
        spec: row.diameter > 0 ? `φ${row.diameter}x${row.length}` : '',
        unitWeight: row.weight / (row.quantity || 1),
        quantity: row.quantity,
        totalWeight: row.weight || row.scaleWeight,
        warehouse: row.warehouse,
        contractNo: row.contractNo,
        colorMark: '',
      })
    }
  }

  return Array.from(map.values()).sort((a, b) => a.orderNo.localeCompare(b.orderNo))
}

/**
 * Group by contract number
 */
export function groupByContract(data: AggregatedRow[]): ContractGroup[] {
  const map = new Map<string, AggregatedRow[]>()

  for (const row of data) {
    const contractNo = row.contractNo || '未分组'
    if (!map.has(contractNo)) {
      map.set(contractNo, [])
    }
    map.get(contractNo)!.push(row)
  }

  const groups: ContractGroup[] = []
  for (const [contractNo, rows] of map.entries()) {
    // Sort rows by order number
    rows.sort((a, b) => a.orderNo.localeCompare(b.orderNo))

    groups.push({
      contractNo,
      rows,
      subtotalQuantity: rows.reduce((sum, r) => sum + r.quantity, 0),
      subtotalWeight: rows.reduce((sum, r) => sum + r.totalWeight, 0),
    })
  }

  // Sort groups by contract number
  groups.sort((a, b) => a.contractNo.localeCompare(b.contractNo))

  return groups
}

/**
 * Generate output Excel file
 */
export function generateOutputExcel(header: HeaderInfo, groups: ContractGroup[]): void {
  const wb = XLSX.utils.book_new()
  const aoa: any[][] = []

  // Header section
  aoa.push(['运单号', header.invoiceNo, '', '开单名称', header.billingName])
  aoa.push(['车船号', header.vehicle, '', '发货单位', header.shipper])
  aoa.push(['发货日期', header.shipDate, '', '目的地', header.destination])
  aoa.push([]) // Empty row

  // Table header
  aoa.push(['提单号', '订单号', '项次号', '牌号', '规格', '单重', '发运数', '发运重量', '仓库', '合同号'])

  // Calculate totals
  let grandTotalQuantity = 0
  let grandTotalWeight = 0

  for (const group of groups) {
    // Contract header
    aoa.push([`合同号: ${group.contractNo}`, '', '', '', '', '', '', '', '', ''])

    // Data rows
    for (const row of group.rows) {
      aoa.push([
        row.billNo,
        row.orderNo,
        row.orderItemNo,
        row.brandNo,
        row.spec,
        row.unitWeight.toFixed(4),
        row.quantity,
        row.totalWeight.toFixed(3),
        row.warehouse,
        row.contractNo,
      ])
    }

    // Subtotal row
    aoa.push([
      `小计: ${group.subtotalQuantity}件`,
      '',
      '',
      '',
      '',
      '',
      group.subtotalQuantity,
      group.subtotalWeight.toFixed(3),
      '',
      '',
    ])
    aoa.push([]) // Empty row

    grandTotalQuantity += group.subtotalQuantity
    grandTotalWeight += group.subtotalWeight
  }

  // Grand total
  aoa.push([
    `总计: ${grandTotalQuantity}件, ${grandTotalWeight.toFixed(3)}吨`,
    '',
    '',
    '',
    '',
    '',
    grandTotalQuantity,
    grandTotalWeight.toFixed(3),
    '',
    '',
  ])

  const ws = XLSX.utils.aoa_to_sheet(aoa)

  // Set column widths
  ws['!cols'] = [
    { wch: 15 }, // 提单号
    { wch: 15 }, // 订单号
    { wch: 8 }, // 项次号
    { wch: 15 }, // 牌号
    { wch: 15 }, // 规格
    { wch: 10 }, // 单重
    { wch: 8 }, // 发运数
    { wch: 12 }, // 发运重量
    { wch: 10 }, // 仓库
    { wch: 15 }, // 合同号
  ]

  XLSX.utils.book_append_sheet(wb, ws, '发货清单')

  // Generate filename with date
  const dateStr = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `发货清单_${dateStr}.xlsx`)
}

/**
 * Parse files and return preview data
 */
export async function parseMultipleFiles(
  files: File[],
  type: 'round-steel' | 'plate' = 'round-steel',
): Promise<ParsedFile[]> {
  const results: ParsedFile[] = []
  for (const file of files) {
    const parsed = await parseERPExcel(file, type)
    results.push(parsed)
  }
  return results
}

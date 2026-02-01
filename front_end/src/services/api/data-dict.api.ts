import { useAxios } from '@/composables/use-axios'

const { axiosInstance } = useAxios()

export interface DataDictItem {
  _id?: string
  name: string
  [key: string]: any
}

export interface PageResult<T> {
  ok: boolean
  data: T[]
  total: number
  page: number
  totalPages: number
}

// 通用 API
async function getList<T>(url: string, params: any) {
  const response = await axiosInstance.get<PageResult<T>>(url, { params })
  return response.data
}

async function postAction(url: string, data: any) {
  const response = await axiosInstance.post(url, data)
  return response.data
}

// -------------------------------------------------
// Company (开单名称)
// -------------------------------------------------
export async function getCompanies(params: { page?: number, limit?: number, search?: string }) {
  return getList<DataDictItem>('/companies', params)
}
export async function addCompany(data: { name: string, customers: string[], contact_name?: string, phone?: string, address?: string }) {
  return postAction('/datamgt/company_add', data)
}
export async function updateCompany(data: { name: string, customers: string[], contact_name?: string, phone?: string, address?: string }) {
  return postAction('/datamgt/company_modify', data)
}
export async function deleteCompany(name: string) {
  return postAction('/datamgt/company_delete', { name })
}

// -------------------------------------------------
// Vehicle (车船号)
// -------------------------------------------------
export async function getVehicles(params: { page?: number, limit?: number, search?: string, type?: string }) {
  // Use existing /vehicles/search which supports pagination
  return getList<DataDictItem>('/vehicles/search', params)
}
export async function addVehicle(data: { name: string, veh_type: string, veh_category?: string, boss?: string, contact_name?: string, phone?: string }) {
  return postAction('/datamgt/vehicle_add', data)
}
export async function updateVehicle(data: { name: string, veh_type: string, veh_category?: string, boss?: string, contact_name?: string, phone?: string }) {
  return postAction('/datamgt/vehicle_modify', data)
}
export async function deleteVehicle(name: string) {
  return postAction('/datamgt/vehicle_delete', { name })
}

// -------------------------------------------------
// Warehouse (仓库)
// -------------------------------------------------
export async function getWarehouses(params: { page?: number, limit?: number, search?: string }) {
  return getList<DataDictItem>('/warehouses', params)
}
export async function addWarehouse(data: { name: string, contact_name?: string, phone?: string, address?: string }) {
  return postAction('/datamgt/warehouse_add', data)
}
export async function updateWarehouse(data: { name: string, contact_name?: string, phone?: string, address?: string }) {
  return postAction('/datamgt/warehouse_modify', data)
}
export async function deleteWarehouse(name: string) {
  return postAction('/datamgt/warehouse_delete', { name })
}

// -------------------------------------------------
// Destination (目的地)
// -------------------------------------------------
export async function getDestinations(params: { page?: number, limit?: number, search?: string }) {
  return getList<DataDictItem>('/destinations', params)
}
export async function addDestination(data: { name: string, contact_name?: string, phone?: string, address?: string }) {
  return postAction('/datamgt/destination_add', data)
}
export async function updateDestination(data: { name: string, contact_name?: string, phone?: string, address?: string }) {
  return postAction('/datamgt/destination_modify', data)
}
export async function deleteDestination(name: string) {
  return postAction('/datamgt/destination_delete', { name })
}

// -------------------------------------------------
// Brand (牌号)
// -------------------------------------------------
export async function getBrands(params: { page?: number, limit?: number, search?: string }) {
  return getList<DataDictItem>('/brands', params)
}
export async function addBrand(data: { name: string }) {
  return postAction('/datamgt/brand_add', data)
}
export async function updateBrand(data: { name: string }) {
  return postAction('/datamgt/brand_modify', data)
}
export async function deleteBrand(name: string) {
  return postAction('/datamgt/brand_delete', { name })
}

// -------------------------------------------------
// SaleDep (销售部门)
// -------------------------------------------------
export async function getSaleDeps(params: { page?: number, limit?: number, search?: string }) {
  return getList<DataDictItem>('/sale_deps', params)
}
export async function addSaleDep(data: { name: string }) {
  return postAction('/datamgt/sale_dep_add', data)
}
export async function updateSaleDep(data: { name: string }) {
  return postAction('/datamgt/sale_dep_modify', data)
}
export async function deleteSaleDep(name: string) {
  return postAction('/datamgt/sale_dep_delete', { name })
}

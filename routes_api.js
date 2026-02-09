// New API routes
const companyApiController = require('./controllers/api/company');
const destinationApiController = require('./controllers/api/destination');
const brandApiController = require('./controllers/api/brand');
const saleDepApiController = require('./controllers/api/sale_dep');
const warehouseApiController = require('./controllers/api/warehouse');
const planApiController = require('./controllers/api/order_plan');
const billApiController = require('./controllers/api/bill');
const invoiceApiController = require('./controllers/api/invoice');
const userApiController = require('./controllers/api/user');
const reportApiController = require('./controllers/api/report');
const vehvesController = require('./controllers/vehves');
const settleApiController = require('./controllers/api/settle');
const vesselSettleController = require('./controllers/api/vessel_settle');
const ticketApiController = require('./controllers/api/ticket');
const moneyApiController = require('./controllers/api/money');
const statisticsApiController = require('./controllers/api/statistics');
const vesselStatisticsApiController = require('./controllers/api/vessel-statistics');
const drayageForkliftApiController = require('./controllers/api/drayage_forklift');
const vesselFixedCostApiController = require('./controllers/api/vessel_fixed_cost');
const platformApiController = require('./controllers/api/platform');

const planController = require('./controllers/order_plan');

// Tenant middleware guards
const { requireTenant, requirePlatformUser, requireOwnerOrPlatform } = require('./middleware/tenantContext');

module.exports = function (app) {
  // New API Routes for Frontend - Data Dictionary (tenant-scoped)
  app.get('/companies', requireTenant, companyApiController.getCompanies);
  app.get('/destinations', requireTenant, destinationApiController.getDestinations);
  app.get('/brands', requireTenant, brandApiController.getBrands);
  app.get('/sale_deps', requireTenant, saleDepApiController.getSaleDeps);
  app.get('/warehouses', requireTenant, warehouseApiController.getWarehouses);

  // Statistics API (tenant-scoped)
  app.get('/statistics/customer/data', requireTenant, statisticsApiController.getStatisticsDataByCondition);
  app.get('/statistics/customer/detail', requireTenant, statisticsApiController.getCustomerDetail);
  app.get('/statistics/customer/chart', requireTenant, statisticsApiController.getCustomerChartData);
  app.get('/statistics/dashboard', requireTenant, statisticsApiController.getDashboardStatistics);
  app.get('/statistics/dashboard/invoices', requireTenant, statisticsApiController.getDashboardInvoiceDetails);
  app.get('/statistics/dashboard/billing-names', requireTenant, statisticsApiController.getDashboardBillingNamesStats);

  app.get('/statistics/vessel/revenue', requireTenant, vesselStatisticsApiController.getVesselRevenueData);
  app.get('/statistics/vessel/detail', requireTenant, vesselStatisticsApiController.getVesselAllocationDetail);

  // Plan API (tenant-scoped)
  app.get('/plans', requireTenant, planApiController.getPlans);
  app.post('/plans', requireTenant, planController.postCreateOrderPlan);
  app.post('/plans/update', requireTenant, planController.postUpdatePlan);
  app.post('/plans/delete', requireTenant, planController.postDeletePlan);
  app.post('/plans/close', requireTenant, planController.postPlanStatusClosed);
  app.post('/plans/unclose', requireTenant, planController.postPlanStatusUnClosed);
  app.get('/plans/check', requireTenant, planController.orderPlanExist);

  // Invoice API (tenant-scoped)
  app.get('/get_max_waybill_no', requireTenant, invoiceApiController.getMaxWaybillNo);
  app.get('/invoices', requireTenant, invoiceApiController.getInvoiceList);
  app.get('/invoices/:waybillNo', requireTenant, invoiceApiController.getInvoiceDetail);
  app.post('/build_ship_invoice', requireTenant, invoiceApiController.buildShipInvoice);
  app.post('/build_truck_invoice', requireTenant, invoiceApiController.buildTruckInvoice);
  app.post('/delete_invoice', requireTenant, invoiceApiController.deleteInvoice);

  // User API (public endpoints and owner/platform only)
  app.get('/public-key', userApiController.getPublicKey);  // Public
  app.get('/me', userApiController.getMe);  // Public (authenticated)
  app.get('/users', requireTenant, userApiController.getUsers);  // Tenant-scoped user list
  app.get('/user_mgr', requireOwnerOrPlatform, userApiController.getUserMgr);  // Owner or platform only
  app.post('/user_mgr', requireOwnerOrPlatform, userApiController.postUserMgr);  // Owner or platform only
  app.post('/resetPwd', requireOwnerOrPlatform, userApiController.resetPassword);  // Owner or platform only
  
  // Report API (tenant-scoped)
  app.get('/get_invoices_bill', requireTenant, reportApiController.getIntegratedQuery);
  app.get('/report/invoice_report', requireTenant, reportApiController.getInvoiceReport);

  // Bill API (tenant-scoped)
  app.get('/bills', requireTenant, billApiController.getBills);
  app.get('/bills/orders', requireTenant, billApiController.getOrders);
  app.post('/bills', requireTenant, billApiController.createBills);
  app.post('/bills/delete', requireTenant, billApiController.deleteBills);
  app.post('/bills/update', requireTenant, billApiController.updateBill);
  app.post('/bills/search', requireTenant, billApiController.searchBills);
  app.post('/bills/export', requireTenant, billApiController.exportBills);

  // Vehicle API (tenant-scoped)
  app.get('/vehicles/search', requireTenant, vehvesController.searchVehicles);

  // Settle API (tenant-scoped)
  app.get('/settle/bills', requireTenant, settleApiController.getSettleBills);
  app.post('/settle/price_input', requireTenant, settleApiController.inputPrice);
  app.post('/settle/settle_bill', requireTenant, settleApiController.settleBills);
  app.post('/settle/not_require_settle', requireTenant, settleApiController.markNotRequireSettle);
  app.get('/settle/vehicles', requireTenant, settleApiController.getVehicleList);

  // Vessel Settle API (车船结算) (tenant-scoped)
  app.get('/settle/vessel_initial_data', requireTenant, vesselSettleController.getVesselInitialData);
  app.get('/get_invoice_settle_vellel', requireTenant, vesselSettleController.getInvoiceSettleVessel);
  app.post('/settle_vessel_price', requireTenant, vesselSettleController.updateVesselPrice);
  app.post('/settle_vessel', requireTenant, vesselSettleController.settleVessel);
  app.post('/settle_vessel_pay', requireTenant, vesselSettleController.settleVesselPay);
  app.post('/settle_vessel_delay_info', requireTenant, vesselSettleController.updateVesselDelayInfo);
  app.post('/settle_vessel_not_needed', requireTenant, vesselSettleController.settleVesselNotNeeded);
  app.post('/post-carrier-department', requireTenant, vesselSettleController.postCarrierDepartment);
  app.post('/upload-receipt-img', requireTenant, vesselSettleController.uploadReceiptImg);
  app.get('/get-receipt-img', requireTenant, vesselSettleController.getReceiptImg);
  app.get('/get-receipt-images-list', requireTenant, vesselSettleController.getReceiptImagesList);
  app.get('/get-receipt-image-by-id', requireTenant, vesselSettleController.getReceiptImageById);
  app.delete('/delete-receipt-image', requireTenant, vesselSettleController.deleteReceiptImage);
  app.get('/get_waybill', requireTenant, vesselSettleController.getWaybill);

  // Ticket API (开票管理) (tenant-scoped)
  app.get('/ticket/settles', requireTenant, ticketApiController.getSettleList);
  app.post('/ticket/update', requireTenant, ticketApiController.updateTicket);
  app.post('/ticket/delete', requireTenant, ticketApiController.deleteSettle);
  app.get('/ticket/detail', requireTenant, ticketApiController.getSettleDetail);

  // Money API (回款管理) (tenant-scoped)
  app.get('/money/list', requireTenant, moneyApiController.getMoneyList);
  app.post('/money/update', requireTenant, moneyApiController.updateMoney);
  app.post('/money/real-price', requireTenant, moneyApiController.updateRealPrice);

  // Drayage Forklift API (tenant-scoped)
  app.get('/drayage_forklifts', requireTenant, drayageForkliftApiController.getList);
  app.get('/drayage_forklifts/:month', requireTenant, drayageForkliftApiController.getByMonth);
  app.post('/drayage_forklifts', requireTenant, drayageForkliftApiController.upsert);
  app.delete('/drayage_forklifts/:month', requireTenant, drayageForkliftApiController.delete);

  // Vessel Fixed Cost API (tenant-scoped)
  app.get('/vessel_fixed_costs', requireTenant, vesselFixedCostApiController.getList);
  app.get('/vessel_fixed_costs/detail', requireTenant, vesselFixedCostApiController.getOne);
  app.post('/vessel_fixed_costs', requireTenant, vesselFixedCostApiController.upsert);
  app.post('/vessel_fixed_costs/delete', requireTenant, vesselFixedCostApiController.delete);

  // Platform Admin API (platform-only)
  app.get('/platform/tenants', requirePlatformUser, platformApiController.getTenants);
  app.post('/platform/tenants', requirePlatformUser, platformApiController.createTenant);
  app.post('/platform/tenants/update', requirePlatformUser, platformApiController.updateTenant);
  app.post('/platform/tenants/delete', requirePlatformUser, platformApiController.deleteTenant);
  app.post('/platform/tenants/status', requirePlatformUser, platformApiController.updateTenantStatus);
  app.get('/platform/tenants/:tenantId/users', requirePlatformUser, platformApiController.getTenantUsers);
  app.get('/platform/tenants/:tenantId/bills', requirePlatformUser, platformApiController.getTenantBills);
  app.get('/platform/tenants/:tenantId/invoices', requirePlatformUser, platformApiController.getTenantInvoices);
  app.get('/platform/statistics', requirePlatformUser, platformApiController.getPlatformStats);
};

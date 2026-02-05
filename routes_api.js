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

const planController = require('./controllers/order_plan');

module.exports = function (app) {
  // New API Routes for Frontend
  app.get('/companies', companyApiController.getCompanies);
  app.get('/destinations', destinationApiController.getDestinations);
  app.get('/brands', brandApiController.getBrands);
  app.get('/sale_deps', saleDepApiController.getSaleDeps);
  app.get('/warehouses', warehouseApiController.getWarehouses);

  // Statistics API
  app.get('/statistics/customer/data', statisticsApiController.getStatisticsDataByCondition);
  app.get('/statistics/customer/detail', statisticsApiController.getCustomerDetail);
  app.get('/statistics/customer/chart', statisticsApiController.getCustomerChartData);
  app.get('/statistics/dashboard', statisticsApiController.getDashboardStatistics);
  app.get('/statistics/dashboard/invoices', statisticsApiController.getDashboardInvoiceDetails);
  app.get('/statistics/dashboard/billing-names', statisticsApiController.getDashboardBillingNamesStats);
  
  app.get('/statistics/vessel/revenue', vesselStatisticsApiController.getVesselRevenueData);
  app.get('/statistics/vessel/detail', vesselStatisticsApiController.getVesselAllocationDetail);

  // Plan API
  app.get('/plans', planApiController.getPlans);
  app.post('/plans', planController.postCreateOrderPlan);
  app.post('/plans/update', planController.postUpdatePlan);
  app.post('/plans/delete', planController.postDeletePlan);
  app.post('/plans/close', planController.postPlanStatusClosed);
  app.post('/plans/unclose', planController.postPlanStatusUnClosed);
  app.get('/plans/check', planController.orderPlanExist);

  app.get('/get_max_waybill_no', invoiceApiController.getMaxWaybillNo);
  app.get('/invoices', invoiceApiController.getInvoiceList);
  app.get('/invoices/:waybillNo', invoiceApiController.getInvoiceDetail);
  app.post('/build_ship_invoice', invoiceApiController.buildShipInvoice);
  app.post('/build_truck_invoice', invoiceApiController.buildTruckInvoice);
  app.post('/delete_invoice', invoiceApiController.deleteInvoice);
  app.get('/me', userApiController.getMe);
  app.get('/users', userApiController.getUsers);
  app.get('/user_mgr', userApiController.getUserMgr);
  app.post('/user_mgr', userApiController.postUserMgr);
  app.post('/resetPwd', userApiController.resetPassword);
  
  app.get('/get_invoices_bill', reportApiController.getIntegratedQuery);
  app.get('/report/invoice_report', reportApiController.getInvoiceReport);

  // Bill API
  app.get('/bills', billApiController.getBills);
  app.get('/bills/orders', billApiController.getOrders); // New orders endpoint
  app.post('/bills', billApiController.createBills); // Batch create
  app.post('/bills/delete', billApiController.deleteBills); // Batch delete
  app.post('/bills/update', billApiController.updateBill); // Single update
  app.post('/bills/search', billApiController.searchBills); // Advanced search
  app.post('/bills/export', billApiController.exportBills); // Advanced export

  // Vehicle API
  app.get('/vehicles/search', vehvesController.searchVehicles);

  // Settle API
  app.get('/settle/bills', settleApiController.getSettleBills);
  app.post('/settle/price_input', settleApiController.inputPrice);
  app.post('/settle/settle_bill', settleApiController.settleBills);
  app.post('/settle/not_require_settle', settleApiController.markNotRequireSettle);
  app.get('/settle/vehicles', settleApiController.getVehicleList);

  // Vessel Settle API (车船结算)
  app.get('/settle/vessel_initial_data', vesselSettleController.getVesselInitialData);
  app.get('/get_invoice_settle_vellel', vesselSettleController.getInvoiceSettleVessel);
  app.post('/settle_vessel_price', vesselSettleController.updateVesselPrice);
  app.post('/settle_vessel', vesselSettleController.settleVessel);
  app.post('/settle_vessel_pay', vesselSettleController.settleVesselPay);
  app.post('/settle_vessel_delay_info', vesselSettleController.updateVesselDelayInfo);
  app.post('/settle_vessel_not_needed', vesselSettleController.settleVesselNotNeeded);
  app.post('/post-carrier-department', vesselSettleController.postCarrierDepartment);
  app.post('/upload-receipt-img', vesselSettleController.uploadReceiptImg);
  app.get('/get-receipt-img', vesselSettleController.getReceiptImg);
  app.get('/get-receipt-images-list', vesselSettleController.getReceiptImagesList);
  app.get('/get-receipt-image-by-id', vesselSettleController.getReceiptImageById);
  app.delete('/delete-receipt-image', vesselSettleController.deleteReceiptImage);
  app.get('/get_waybill', vesselSettleController.getWaybill);

  // Ticket API (开票管理)
  app.get('/ticket/settles', ticketApiController.getSettleList);
  app.post('/ticket/update', ticketApiController.updateTicket);
  app.post('/ticket/delete', ticketApiController.deleteSettle);
  app.get('/ticket/detail', ticketApiController.getSettleDetail);

  // Money API (回款管理)
  app.get('/api/money/list', moneyApiController.getMoneyList);
  app.post('/api/money/update', moneyApiController.updateMoney);
  app.post('/api/money/real-price', moneyApiController.updateRealPrice);

  // Drayage Forklift API
  app.get('/drayage_forklifts', drayageForkliftApiController.getList);
  app.get('/drayage_forklifts/:month', drayageForkliftApiController.getByMonth);
  app.post('/drayage_forklifts', drayageForkliftApiController.upsert);
  app.delete('/drayage_forklifts/:month', drayageForkliftApiController.delete);

  // Vessel Fixed Cost API
  app.get('/vessel_fixed_costs', vesselFixedCostApiController.getList);
  app.get('/vessel_fixed_costs/detail', vesselFixedCostApiController.getOne);
  app.post('/vessel_fixed_costs', vesselFixedCostApiController.upsert);
  app.post('/vessel_fixed_costs/delete', vesselFixedCostApiController.delete); // Using POST for delete with body
};

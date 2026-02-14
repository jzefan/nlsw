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

// 认证中间件：session 过期时返回 401
function auth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ ok: false, message: '未登录或登录已过期' });
  }
  next();
}

module.exports = function (app) {
  // 公开接口（不需要认证）
  app.get('/public-key', userApiController.getPublicKey);
  app.get('/me', userApiController.getMe);

  // New API Routes for Frontend（需要认证）
  app.get('/companies', auth, companyApiController.getCompanies);
  app.get('/destinations', auth, destinationApiController.getDestinations);
  app.get('/brands', auth, brandApiController.getBrands);
  app.get('/sale_deps', auth, saleDepApiController.getSaleDeps);
  app.get('/warehouses', auth, warehouseApiController.getWarehouses);

  // Statistics API
  app.get('/statistics/customer/data', auth, statisticsApiController.getStatisticsDataByCondition);
  app.get('/statistics/customer/detail', auth, statisticsApiController.getCustomerDetail);
  app.get('/statistics/customer/chart', auth, statisticsApiController.getCustomerChartData);
  app.get('/statistics/dashboard', auth, statisticsApiController.getDashboardStatistics);
  app.get('/statistics/dashboard/invoices', auth, statisticsApiController.getDashboardInvoiceDetails);
  app.get('/statistics/dashboard/billing-names', auth, statisticsApiController.getDashboardBillingNamesStats);

  app.get('/statistics/vessel/revenue', auth, vesselStatisticsApiController.getVesselRevenueData);
  app.get('/statistics/vessel/detail', auth, vesselStatisticsApiController.getVesselAllocationDetail);

  // Plan API
  app.get('/plans', auth, planApiController.getPlans);
  app.post('/plans', auth, planController.postCreateOrderPlan);
  app.post('/plans/update', auth, planController.postUpdatePlan);
  app.post('/plans/delete', auth, planController.postDeletePlan);
  app.post('/plans/close', auth, planController.postPlanStatusClosed);
  app.post('/plans/unclose', auth, planController.postPlanStatusUnClosed);
  app.get('/plans/check', auth, planController.orderPlanExist);

  app.get('/get_max_waybill_no', auth, invoiceApiController.getMaxWaybillNo);
  app.get('/invoices', auth, invoiceApiController.getInvoiceList);
  app.get('/invoices/:waybillNo', auth, invoiceApiController.getInvoiceDetail);
  app.post('/build_ship_invoice', auth, invoiceApiController.buildShipInvoice);
  app.post('/build_truck_invoice', auth, invoiceApiController.buildTruckInvoice);
  app.post('/delete_invoice', auth, invoiceApiController.deleteInvoice);
  app.get('/users', auth, userApiController.getUsers);
  app.get('/user_mgr', auth, userApiController.getUserMgr);
  app.post('/user_mgr', auth, userApiController.postUserMgr);
  app.post('/resetPwd', auth, userApiController.resetPassword);

  app.get('/get_invoices_bill', auth, reportApiController.getIntegratedQuery);
  app.get('/report/invoice_report', auth, reportApiController.getInvoiceReport);

  // Bill API
  app.get('/bills', auth, billApiController.getBills);
  app.get('/bills/orders', auth, billApiController.getOrders); // New orders endpoint
  app.post('/bills', auth, billApiController.createBills); // Batch create
  app.post('/bills/delete', auth, billApiController.deleteBills); // Batch delete
  app.post('/bills/update', auth, billApiController.updateBill); // Single update
  app.post('/bills/search', auth, billApiController.searchBills); // Advanced search
  app.post('/bills/export', auth, billApiController.exportBills); // Advanced export

  // Vehicle API
  app.get('/vehicles/search', auth, vehvesController.searchVehicles);

  // Settle API
  app.get('/settle/bills', auth, settleApiController.getSettleBills);
  app.post('/settle/price_input', auth, settleApiController.inputPrice);
  app.post('/settle/settle_bill', auth, settleApiController.settleBills);
  app.post('/settle/not_require_settle', auth, settleApiController.markNotRequireSettle);
  app.get('/settle/vehicles', auth, settleApiController.getVehicleList);

  // Vessel Settle API (车船结算)
  app.get('/settle/vessel_initial_data', auth, vesselSettleController.getVesselInitialData);
  app.get('/get_invoice_settle_vellel', auth, vesselSettleController.getInvoiceSettleVessel);
  app.post('/settle_vessel_price', auth, vesselSettleController.updateVesselPrice);
  app.post('/settle_vessel', auth, vesselSettleController.settleVessel);
  app.post('/settle_vessel_pay', auth, vesselSettleController.settleVesselPay);
  app.post('/settle_vessel_delay_info', auth, vesselSettleController.updateVesselDelayInfo);
  app.post('/settle_vessel_not_needed', auth, vesselSettleController.settleVesselNotNeeded);
  app.post('/post-carrier-department', auth, vesselSettleController.postCarrierDepartment);
  app.post('/upload-receipt-img', auth, vesselSettleController.uploadReceiptImg);
  app.get('/get-receipt-img', auth, vesselSettleController.getReceiptImg);
  app.get('/get-receipt-images-list', auth, vesselSettleController.getReceiptImagesList);
  app.get('/get-receipt-image-by-id', auth, vesselSettleController.getReceiptImageById);
  app.delete('/delete-receipt-image', auth, vesselSettleController.deleteReceiptImage);
  app.get('/get_waybill', auth, vesselSettleController.getWaybill);

  // Ticket API (开票管理)
  app.get('/ticket/settles', auth, ticketApiController.getSettleList);
  app.post('/ticket/update', auth, ticketApiController.updateTicket);
  app.post('/ticket/delete', auth, ticketApiController.deleteSettle);
  app.get('/ticket/detail', auth, ticketApiController.getSettleDetail);

  // Money API (回款管理)
  app.get('/money/list', auth, moneyApiController.getMoneyList);
  app.post('/money/update', auth, moneyApiController.updateMoney);
  app.post('/money/real-price', auth, moneyApiController.updateRealPrice);

  // Drayage Forklift API
  app.get('/drayage_forklifts', auth, drayageForkliftApiController.getList);
  app.get('/drayage_forklifts/:month', auth, drayageForkliftApiController.getByMonth);
  app.post('/drayage_forklifts', auth, drayageForkliftApiController.upsert);
  app.delete('/drayage_forklifts/:month', auth, drayageForkliftApiController.delete);

  // Vessel Fixed Cost API
  app.get('/vessel_fixed_costs', auth, vesselFixedCostApiController.getList);
  app.get('/vessel_fixed_costs/detail', auth, vesselFixedCostApiController.getOne);
  app.post('/vessel_fixed_costs', auth, vesselFixedCostApiController.upsert);
  app.post('/vessel_fixed_costs/delete', auth, vesselFixedCostApiController.delete); // Using POST for delete with body
};

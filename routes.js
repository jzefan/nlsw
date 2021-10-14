/**
 * Load controllers.
 */

let homeController = require('./controllers/home');
let userController = require('./controllers/user');
let contactController = require('./controllers/contact');
let passportConf = require('./config/passport');
let billController = require('./controllers/bill');
let nlDataController = require('./controllers/nldata');
let vehvesController = require('./controllers/vehves');
let drayageForkliftController = require('./controllers/drayage_forklift');
let queryController = require('./controllers/query');
let planController = require('./controllers/order_plan');

/**
 * Application routes.
 */
module.exports = function (app) {
  app.get('/', homeController.index);
  app.get('/login', userController.getLogin);
  app.post('/login', userController.postLogin);
  app.get('/logout', userController.logout);
  app.get('/forgot', userController.getForgot);
  app.post('/forgot', userController.postForgot);
  app.get('/reset/:token', userController.getReset);
  app.post('/reset/:token', userController.postReset);
  app.get('/signup', userController.getSignup);
  app.post('/signup', userController.postSignup);
  app.get('/contact', contactController.getContact);
  app.post('/contact', contactController.postContact);
  app.get('/account', passportConf.isAuthenticated, userController.getAccount);
  app.post('/account/profile', passportConf.isAuthenticated, userController.postUpdateProfile);
  app.post('/account/password', passportConf.isAuthenticated, userController.postUpdatePassword);
  app.post('/account/delete', passportConf.isAuthenticated, userController.postDeleteAccount);

  app.get('/user_mgr',userController.getUserMgr);
  app.post('/user_mgr', userController.postUserMgr);

  app.get('/search', homeController.search);
  app.post('/post_submit', homeController.postSubmitNews);
  app.post('/post_update', homeController.postUpdateNews);

  app.get('/get_bill', billController.getBillsByOrder);
  app.get('/get_bill_by_bno', billController.getBillsByNo);
  app.get('/get_bill_by_name', billController.getBillsByBillName);
  app.get('/get_bills_by_condition', billController.getBillsWithCondition);
  app.get('/get_waybill', billController.getWaybillByNo);
  app.get('/get_invoices_by_condition', billController.getInvoicesWithCondition);

  app.get('/create_bill', billController.createBills);
  app.post('/create_bill', billController.postCreateBills);
  app.get('/modify_bill', billController.modifyBill);
  app.post('/modify_bill/single', billController.postModifySingleBill);
  app.post('/modify_bill/batch', billController.postBatchModifyBill);
  app.get('/delete_bill', billController.deleteBill);
  app.post('/delete_bill', billController.postDeleteBill);
  app.get('/search_bill', billController.searchBill);

  app.get('/get_max_waybill_no', billController.getMaxWaybillNo);
  app.get('/build_invoice', billController.getBuildInvoice);
  app.post('/build_invoice', billController.postBuildInvoice);
  app.get('/distribute_invoice', billController.distributeInvoice);
  app.post('/distribute_invoice', billController.postDistributeInvoice);
  app.get('/delete_invoice', billController.deleteInvoice);
  app.post('/delete_invoice', billController.postDeleteInvoice);

  app.post('/price_input', billController.postPriceInput);
  app.get('/settle_bill', billController.getSettleBill);
  app.post('/settle_bill', billController.postSettleBill);
  app.post('/collection_not_require_settle', billController.postSettleCollectionNotRequire);
  app.post('/delete_settle', billController.postDeleteSettle);
  app.get('/settle_ticket', billController.getSettleTicket);
  app.post('/settle_ticket', billController.postSettleTicketMoney);
  app.get('/settle_money', billController.getSettleMoney);
  app.post('/settle_money', billController.postSettleTicketMoney);
  app.post('/settle_real_price', billController.postSettleRealPrice);
  app.get('/settle_vessel', billController.getSettleVessel);
  app.post('/settle_vessel_price', billController.postVesselPriceInput);
  app.post('/settle_vessel_not_needed', billController.postVesselNotNeeded);
  app.post('/settle_vessel_delay_info', billController.postVesselDelayInfo);
  app.post('/settle_vessel', billController.postSettleVessel);
  app.post('/settle_vessel_pay', billController.postSettleVesselPay);
  app.get('/settle_vehicle_list', billController.getVehicles);

  app.get('/datamgt/vehicle', nlDataController.httpGetVehicle);
  app.post('/datamgt/vehicle_add', nlDataController.httpPostVehicleAdd);
  app.post('/datamgt/vehicle_modify', nlDataController.httpPostVehicleModify);
  app.post('/datamgt/vehicle_delete', nlDataController.httpPostVehicleDelete);
  app.get('/datamgt/company', nlDataController.httpGetCompany);
  app.post('/datamgt/company_add', nlDataController.httpPostCompanyAdd);
  app.post('/datamgt/company_modify', nlDataController.httpPostCompanyModify);
  app.post('/datamgt/company_delete', nlDataController.httpPostCompanyDelete);
  app.get('/datamgt/warehouse', nlDataController.httpGetWarehouse);
  app.post('/datamgt/warehouse_add', nlDataController.httpPostWarehouseAdd);
  app.post('/datamgt/warehouse_modify', nlDataController.httpPostWarehouseModify);
  app.post('/datamgt/warehouse_delete', nlDataController.httpPostWarehouseDelete);
  app.get('/datamgt/destination', nlDataController.httpGetDestination);
  app.post('/datamgt/destination_add', nlDataController.httpPostDestinationAdd);
  app.post('/datamgt/destination_modify', nlDataController.httpPostDestinationModify);
  app.post('/datamgt/destination_delete', nlDataController.httpPostDestinationDelete);
  app.get('/datamgt/brand', nlDataController.httpGetBrand);
  app.post('/datamgt/brand_add', nlDataController.httpPostBrandAdd);
  app.post('/datamgt/brand_modify', nlDataController.httpPostBrandModify);
  app.post('/datamgt/brand_delete', nlDataController.httpPostBrandDelete);
  app.get('/datamgt/sale_dep', nlDataController.httpGetSaleDep);
  app.post('/datamgt/sale_dep_add', nlDataController.httpPostSaleDepAdd);
  app.post('/datamgt/sale_dep_modify', nlDataController.httpPostSaleDepModify);
  app.post('/datamgt/sale_dep_delete', nlDataController.httpPostSaleDepDelete);

  app.get('/invoice_report', billController.getInvoiceReport);

  app.get('/integrated_query', billController.getIntegratedQuery);
  app.get('/get_invoice_settle_vellel', queryController.getInvoiceWithVessel);
  app.get('/get_invoice_report', queryController.getInvoiceReport);
  app.get('/get_invoices_bill', queryController.getInvoiceBill);

  // 车船营业额统计
  app.get('/vessel_revenue', queryController.getVesselStatistics);
  app.get('/get_vessel_revenue_data', queryController.getVesselRevenueData);
  app.get('/get_vessel_alloc_detail', queryController.getVesselAllocationDetail);
  // 客户营业额统计
  app.get('/customer_report', queryController.getStatistics);
  app.get('/get_statistics_data', queryController.getStatisticsDataByCondition);
  app.get('/get_customer_detail', queryController.getCustomerDetail);
  app.get('/get_customer_chart_data', queryController.getCustomerChartData);
  app.get('/shipping_charge_report', queryController.getShippingChargeReport);

  app.get('/vessel_fixed_cost', vehvesController.getVehVesMgt);
  app.get('/get_vessel_fixed_cost_data', vehvesController.getVFCData);
  app.get('/get_one_vfc_data', vehvesController.getOneVFCData);
  app.post('/one_vessel_fixed_cost', vehvesController.postOneVFCData);
  app.post('/delete_vfc_data', vehvesController.postDeleteVFCData);

  app.get('/drayage_forklift_cost', drayageForkliftController.getDFMgt);
  app.get('/get_one_df_data', drayageForkliftController.getOneDfData);
  app.post('/one_df_receivables', drayageForkliftController.postOneDfData);
  app.post('/delete_df_data', drayageForkliftController.postDeleteDfData);

  app.post('/initial_settle_flag', billController.postInitSettleFlag);
  app.get('/get_settle_bill', billController.getSettleInvoiceBill);

  app.get('/create_plan', planController.getCreateOrderPlan);
  app.get('/order_plan_exist', planController.orderPlanExist);
  app.post('/create_order_plan', planController.postCreateOrderPlan);

  app.get('/plan_list', planController.getPlanList);
  app.get('/search_plans', planController.searchPlans);
  app.post('/plan/update', planController.postUpdatePlan);
  app.post('/plan/delete', planController.postDeletePlan);
  app.post('/plan/status_close', planController.postPlanStatusClosed);
  app.post('/plan/status_unclose', planController.postPlanStatusUnClosed);

  // test
  app.get('/plan/update_status', billController.updateStatus1);
};
 

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
const settleBasketController = require('./controllers/api/settle_basket');
const vesselSettleController = require('./controllers/api/vessel_settle');
const ticketApiController = require('./controllers/api/ticket');
const moneyApiController = require('./controllers/api/money');
const statisticsApiController = require('./controllers/api/statistics');
const vesselStatisticsApiController = require('./controllers/api/vessel-statistics');
const drayageForkliftApiController = require('./controllers/api/drayage_forklift');
const vesselFixedCostApiController = require('./controllers/api/vessel_fixed_cost');
const platformApiController = require('./controllers/api/platform');
const orderApiController = require('./controllers/api/order');
const orderNumberApiController = require('./controllers/api/order_number');
const paymentQRController = require('./controllers/api/payment-qr');
const dataProcessApiController = require('./controllers/api/data_process');
const attendanceApiController = require('./controllers/api/attendance');
const attendanceLedgerController = require('./controllers/api/attendance-ledger');
const payrollController = require('./controllers/api/payroll');

const planController = require('./controllers/order_plan');

// Tenant middleware guards
const { requireTenant, requirePlatformUser, requireOwnerOrPlatform } = require('./middleware/tenantContext');
const { isSaas, getDeployMode, getStandaloneCompany } = require('./utils/deploy-mode');
const { requireAttendanceEnabled, requireEmployee } = require('./utils/attendance-permissions');
const { requireSameOrigin } = require('./middleware/requireSameOrigin');
const { parseAttendanceAttachments } = require('./middleware/attendance-attachments');
const { serverVersion } = require('./utils/server-version');

module.exports = function (app) {
  // Deploy info (public, no auth required)
  app.get('/deploy-info', (req, res) => {
    res.json({ deployMode: getDeployMode(), standaloneCompany: getStandaloneCompany(), server: serverVersion.status() });
  });

  // 运行中的后端是否为旧代码（public，前端据此提示重启；前端改动不需要重启后端）
  app.get('/server-version', (req, res) => {
    res.json({ ok: true, data: serverVersion.status() });
  });

  // New API Routes for Frontend - Data Dictionary (tenant-scoped)
  app.get('/companies/search', requireTenant, companyApiController.searchCompanies);  // 快速搜索接口
  app.get('/companies', requireTenant, companyApiController.getCompanies);
  app.get('/destinations/search', requireTenant, destinationApiController.searchDestinations);  // 快速搜索接口
  app.get('/destinations', requireTenant, destinationApiController.getDestinations);
  app.get('/brands', requireTenant, brandApiController.getBrands);
  app.get('/sale_deps', requireTenant, saleDepApiController.getSaleDeps);
  app.get('/warehouses', requireTenant, warehouseApiController.getWarehouses);
  app.get('/order-numbers/search', requireTenant, orderNumberApiController.searchOrderNumbers);
  app.post('/order-numbers/add', requireTenant, orderNumberApiController.addOrderNumber);

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
  app.get('/plans/by-order/:orderNo', requireTenant, planApiController.getPlanByOrderNo);
  app.get('/plans', requireTenant, planApiController.getPlans);
  app.post('/plans', requireTenant, planController.postCreateOrderPlan);
  app.post('/plans/update', requireTenant, planController.postUpdatePlan);
  app.post('/plans/delete', requireTenant, planController.postDeletePlan);
  app.post('/plans/close', requireTenant, planController.postPlanStatusClosed);
  app.post('/plans/unclose', requireTenant, planController.postPlanStatusUnClosed);
  app.get('/plans/check', requireTenant, planController.orderPlanExist);

  // Invoice API (tenant-scoped)
  app.get('/search/global', requireTenant, invoiceApiController.searchGlobalRecords);
  app.get('/get_max_waybill_no', requireTenant, invoiceApiController.getMaxWaybillNo);
  app.get('/invoices', requireTenant, invoiceApiController.getInvoiceList);
  app.get('/invoices/:waybillNo', requireTenant, invoiceApiController.getInvoiceDetail);
  app.post('/invoices/:waybillNo/report-title', requireTenant, invoiceApiController.updateInvoiceReportTitle);
  app.post('/build_ship_invoice', requireTenant, invoiceApiController.buildShipInvoice);
  app.post('/build_truck_invoice', requireTenant, invoiceApiController.buildTruckInvoice);
  app.post('/delete_invoice', requireTenant, invoiceApiController.deleteInvoice);

  // User API (public endpoints and owner/platform only)
  app.get('/public-key', userApiController.getPublicKey);  // Public
  app.get('/me', userApiController.getMe);  // Public (authenticated)
  app.get('/users', requireTenant, userApiController.getUsers);  // Tenant-scoped user list
  app.get('/user_mgr', requireOwnerOrPlatform, userApiController.getUserMgr);  // Owner or platform only
  app.post('/user_mgr', requireOwnerOrPlatform, requireSameOrigin, userApiController.postUserMgr);  // Owner or platform only
  app.post('/resetPwd', requireOwnerOrPlatform, requireSameOrigin, userApiController.resetPassword);  // Owner or platform only
  app.post('/payroll/users/:userId/roles', requireTenant, requireAttendanceEnabled, requireSameOrigin, userApiController.updatePayrollRoles); // Exact owner check in controller
  app.get('/payroll/users/candidates', requireTenant, requireAttendanceEnabled, userApiController.getPayrollRoleCandidates);
  app.post('/payroll/general-manager/handover', requireTenant, requireAttendanceEnabled, requireSameOrigin, userApiController.handoverPayrollGeneralManager);
  app.get('/payroll/role-locks', requireTenant, requireAttendanceEnabled, userApiController.listPayrollRoleLocks);
  app.post('/payroll/role-locks/release', requireTenant, requireAttendanceEnabled, requireSameOrigin, userApiController.releaseStalePayrollRoleLock);
  app.post('/user/preferences', userApiController.updatePreferences);  // Authenticated user
  app.get('/tenant/settings', requireOwnerOrPlatform, userApiController.getTenantSettings);
  app.post('/tenant/settings', requireOwnerOrPlatform, requireSameOrigin, userApiController.updateTenantSettings);

  // Attendance (tenant-scoped; the feature flag is enforced on every endpoint)
  app.get('/attendance/requests', requireTenant, requireAttendanceEnabled, requireEmployee, attendanceApiController.listRequests);
  app.post('/attendance/requests', requireTenant, requireAttendanceEnabled, requireEmployee, requireSameOrigin, parseAttendanceAttachments, attendanceApiController.createRequest);
  app.get('/attendance/requests/:id/attachments/:attachmentId', requireTenant, requireAttendanceEnabled, attendanceApiController.getRequestAttachment);
  app.post('/attendance/requests/:id/withdraw', requireTenant, requireAttendanceEnabled, requireEmployee, requireSameOrigin, attendanceApiController.withdrawRequest);
  app.post('/attendance/requests/:id/review', requireTenant, requireAttendanceEnabled, requireEmployee, requireSameOrigin, attendanceApiController.reviewRequest);
  app.get('/attendance/users/people', requireTenant, requireAttendanceEnabled, attendanceApiController.listPeople);
  app.post('/attendance/users/profile', requireTenant, requireAttendanceEnabled, requireSameOrigin, attendanceApiController.updateEmployeeProfile);
  app.get('/attendance/calendar', requireTenant, requireAttendanceEnabled, attendanceApiController.getCalendar);
  app.post('/attendance/calendar/day', requireTenant, requireAttendanceEnabled, requireSameOrigin, attendanceApiController.updateCalendarDay);
  app.post('/attendance/calendar', requireTenant, requireAttendanceEnabled, requireSameOrigin, attendanceApiController.updateCalendar);
  app.get('/attendance/settings/approval-delegate', requireTenant, requireAttendanceEnabled, attendanceApiController.getGeneralManagerDelegate);
  app.post('/attendance/settings/approval-delegate', requireTenant, requireAttendanceEnabled, requireSameOrigin, attendanceApiController.setGeneralManagerDelegate);
  app.get('/attendance/settings/submission-locks', requireTenant, requireAttendanceEnabled, attendanceApiController.listSubmissionLocks);
  app.post('/attendance/settings/submission-locks/:applicantId/release', requireTenant, requireAttendanceEnabled, requireSameOrigin, attendanceApiController.releaseStaleSubmissionLock);
  app.get('/attendance/ledger', requireTenant, requireAttendanceEnabled, attendanceLedgerController.getLedger);
  app.post('/attendance/ledger/rows/:employeeId', requireTenant, requireAttendanceEnabled, requireSameOrigin, attendanceLedgerController.saveRow);
  app.post('/attendance/ledger/close', requireTenant, requireAttendanceEnabled, requireSameOrigin, attendanceLedgerController.closeMonth);
  app.post('/attendance/ledger/reopen', requireTenant, requireAttendanceEnabled, requireSameOrigin, attendanceLedgerController.reopenMonth);
  app.get('/attendance/ledger/statistics', requireTenant, requireAttendanceEnabled, attendanceLedgerController.getStatistics);
  app.get('/attendance/ledger/locks', requireTenant, requireAttendanceEnabled, attendanceLedgerController.listMonthLocks);
  app.post('/attendance/ledger/locks/:month/release', requireTenant, requireAttendanceEnabled, requireSameOrigin, attendanceLedgerController.releaseStaleMonthLock);

  // Payroll: employee endpoints are self-scoped in the controller; company data
  // requires an explicit payroll role and never inherits legacy admin privileges.
  app.get('/attendance/payroll/my', requireTenant, requireAttendanceEnabled, requireEmployee, payrollController.getMyStatements);
  app.get('/attendance/payroll/statements', requireTenant, requireAttendanceEnabled, payrollController.listStatements);
  // 累计预扣预缴个税的往月累计基数（只读，供录入弹窗算个税）
  app.get('/attendance/payroll/statements/:employeeId/:month/tax-basis', requireTenant, requireAttendanceEnabled, payrollController.getTaxBasis);
  app.get('/attendance/payroll/standards', requireTenant, requireAttendanceEnabled, payrollController.listStandards);
  app.post('/attendance/payroll/standards/:employeeId', requireTenant, requireAttendanceEnabled, requireSameOrigin, payrollController.saveStandard);
  app.post('/attendance/payroll/statements/:employeeId/:month/draft', requireTenant, requireAttendanceEnabled, requireSameOrigin, payrollController.saveDraft);
  app.post('/attendance/payroll/statements/:employeeId/:month/publish', requireTenant, requireAttendanceEnabled, requireSameOrigin, payrollController.publish);
  app.post('/attendance/payroll/statements/:employeeId/:month/withdraw', requireTenant, requireAttendanceEnabled, requireSameOrigin, payrollController.withdraw);
  app.post('/attendance/payroll/statements/:employeeId/:month/payments', requireTenant, requireAttendanceEnabled, requireSameOrigin, payrollController.addPayment);
  // 按月批量：导入工资草稿（名单匹配在前端完成，这里只收员工与金额）与批量发布待发布草稿
  app.post('/attendance/payroll/import/:month', requireTenant, requireAttendanceEnabled, requireSameOrigin, payrollController.importDrafts);
  app.post('/attendance/payroll/publish-batch/:month', requireTenant, requireAttendanceEnabled, requireSameOrigin, payrollController.publishBatch);
  app.get('/attendance/payroll/statistics', requireTenant, requireAttendanceEnabled, payrollController.getStatistics);

  // Report API (tenant-scoped)
  app.get('/report/integrated_query', requireTenant, reportApiController.getIntegratedQuery);
  app.get('/report/invoice_report', requireTenant, reportApiController.getInvoiceReport);
  app.get('/report/invoice_shippers', requireTenant, reportApiController.getInvoiceShippers);

  // Bill API (tenant-scoped)
  app.get('/bills', requireTenant, billApiController.getBills);
  app.get('/bills/billing-names', requireTenant, billApiController.getBillingNames);
  app.get('/bills/orders', requireTenant, billApiController.getOrders);
  app.get('/bills/order-bills', requireTenant, billApiController.getOrderBills);
  app.post('/bills', requireTenant, billApiController.createBills);
  app.post('/bills/delete', requireTenant, billApiController.deleteBills);
  app.post('/bills/update', requireTenant, billApiController.updateBill);
  app.post('/bills/update-batch', requireTenant, billApiController.updateBillsBatch);
  app.post('/bills/search', requireTenant, billApiController.searchBills);
  app.post('/bills/export', requireTenant, billApiController.exportBills);

  // Vehicle API (tenant-scoped)
  app.get('/vehicles/search', requireTenant, vehvesController.searchVehicles);
  app.get('/vehicles/boss-list', requireTenant, vehvesController.getVehicleBossList);

  // Settle API (tenant-scoped)
  app.get('/settle/bills', requireTenant, settleApiController.getSettleBills);
  app.post('/settle/price_input', requireTenant, settleApiController.inputPrice);
  app.post('/settle/settle_bill', requireTenant, settleApiController.settleBills);
  app.post('/settle/not_require_settle', requireTenant, settleApiController.markNotRequireSettle);
  app.post('/settle/cancel_not_require_settle', requireTenant, settleApiController.cancelNotRequireSettle);
  app.get('/settle/vehicles', requireTenant, settleApiController.getVehicleList);

  // Settle Basket API (结算篮持久化) (tenant-scoped)
  app.get('/settle/basket', requireTenant, settleBasketController.getBasket);
  app.post('/settle/basket', requireTenant, settleBasketController.saveBasket);
  app.get('/settle/basket/public', requireTenant, settleBasketController.getPublicBaskets);
  app.get('/settle/basket/shared', requireTenant, settleBasketController.getSharedBasket);
  app.post('/settle/basket/shared', requireTenant, settleBasketController.saveSharedBasket);

  // Vessel Settle API (车船结算) (tenant-scoped)
  app.get('/settle/vessel_initial_data', requireTenant, vesselSettleController.getVesselInitialData);
  app.get('/get_invoice_settle_vellel', requireTenant, vesselSettleController.getInvoiceSettleVessel);
  app.post('/settle_vessel_price', requireTenant, vesselSettleController.updateVesselPrice);
  app.post('/settle_vessel', requireTenant, vesselSettleController.settleVessel);
  app.post('/settle_vessel_pay', requireTenant, vesselSettleController.settleVesselPay);
  app.post('/settle_vessel_delay_info', requireTenant, vesselSettleController.updateVesselDelayInfo);
  app.post('/settle_vessel_not_needed', requireTenant, vesselSettleController.settleVesselNotNeeded);
  app.post('/toggle-vessel-receipt', requireTenant, vesselSettleController.toggleVesselReceipt);
  app.post('/post-carrier-department', requireTenant, vesselSettleController.postCarrierDepartment);
  app.post('/upload-receipt-img', requireTenant, vesselSettleController.uploadReceiptImg);
  app.get('/get-receipt-img', requireTenant, vesselSettleController.getReceiptImg);
  app.get('/get-receipt-images-list', requireTenant, vesselSettleController.getReceiptImagesList);
  app.post('/get-receipt-download-items', requireTenant, vesselSettleController.getReceiptDownloadItems);
  app.get('/get-receipt-image-by-id', requireTenant, vesselSettleController.getReceiptImageById);
  app.get('/receipt-image/:id', requireTenant, vesselSettleController.streamReceiptImage);
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

  // Data Process API (数据处理) (tenant-scoped)
  app.post('/data-process/shipment/save', requireTenant, dataProcessApiController.saveShipmentDetail);
  app.get('/data-process/shipment/batches', requireTenant, dataProcessApiController.getShipmentBatches);
  app.get('/data-process/shipment/list', requireTenant, dataProcessApiController.getShipmentDetails);
  app.post('/data-process/shipment/delete-batch', requireTenant, dataProcessApiController.deleteShipmentBatch);
  app.post('/data-process/shipment/update', requireTenant, dataProcessApiController.updateShipmentDetail);

  // Platform Admin API (platform-only, SaaS mode only)
  if (isSaas()) {
    app.get('/platform/tenants', requirePlatformUser, platformApiController.getTenants);
    app.post('/platform/tenants', requirePlatformUser, requireSameOrigin, platformApiController.createTenant);
    app.post('/platform/tenants/update', requirePlatformUser, requireSameOrigin, platformApiController.updateTenant);
    app.post('/platform/tenants/delete', requirePlatformUser, requireSameOrigin, platformApiController.deleteTenant);
    app.post('/platform/tenants/status', requirePlatformUser, requireSameOrigin, platformApiController.updateTenantStatus);
    app.get('/platform/tenants/:tenantId/users', requirePlatformUser, platformApiController.getTenantUsers);
    app.post('/platform/users/reset-password', requirePlatformUser, requireSameOrigin, platformApiController.resetUserPassword);
    app.get('/platform/tenants/:tenantId/bills', requirePlatformUser, platformApiController.getTenantBills);
    app.get('/platform/tenants/:tenantId/invoices', requirePlatformUser, platformApiController.getTenantInvoices);
    app.get('/platform/statistics', requirePlatformUser, platformApiController.getPlatformStats);

    // Order management
    app.get('/platform/orders', requirePlatformUser, orderApiController.getOrders);
    app.post('/platform/orders', requirePlatformUser, orderApiController.createOrder);
    app.post('/platform/orders/update', requirePlatformUser, orderApiController.updateOrder);
    app.post('/platform/orders/delete', requirePlatformUser, orderApiController.deleteOrder);

    // Payment QR code
    app.post('/platform/payment-qr', requirePlatformUser, paymentQRController.uploadQR);
    app.get('/payment-qr', requireTenant, paymentQRController.getQR);
    app.get('/payment-qr/check', requireTenant, paymentQRController.checkQR);
  }
};

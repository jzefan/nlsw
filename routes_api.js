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
const vehvesController = require('./controllers/vehves');

const planController = require('./controllers/order_plan');

module.exports = function (app) {
  // New API Routes for Frontend
  app.get('/companies', companyApiController.getCompanies);
  app.get('/destinations', destinationApiController.getDestinations);
  app.get('/brands', brandApiController.getBrands);
  app.get('/sale_deps', saleDepApiController.getSaleDeps);
  app.get('/warehouses', warehouseApiController.getWarehouses);

  // Plan API
  app.get('/plans', planApiController.getPlans);
  app.post('/plans', planController.postCreateOrderPlan);
  app.post('/plans/update', planController.postUpdatePlan);
  app.post('/plans/delete', planController.postDeletePlan);
  app.post('/plans/close', planController.postPlanStatusClosed);
  app.post('/plans/unclose', planController.postPlanStatusUnClosed);
  app.get('/plans/check', planController.orderPlanExist);

  app.get('/get_max_waybill_no', invoiceApiController.getMaxWaybillNo);
  app.get('/me', userApiController.getMe);
  
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
};

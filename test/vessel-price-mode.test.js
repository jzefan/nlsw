const test = require('node:test');
const assert = require('node:assert/strict');

const Invoice = require('../models/Invoice');
const Bill = require('../models/Bill');
const { updateVesselPrice } = require('../controllers/api/vessel_settle');

function makeRes() {
  const res = {};
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.body = body;
    return res;
  };
  return res;
}

function makeInvoice(overrides = {}) {
  return {
    waybill_no: 'W001',
    vessel_price: 0,
    price_mode: 0,
    price_remark: '',
    bills: [],
    saved: false,
    async save() {
      this.saved = true;
    },
    ...overrides,
  };
}

// updateVesselPrice 需要 req.tenantId（utils/tenant.buildTenantQuery）
function makeReq(priceData, wnoList = ['W001']) {
  return { tenantId: 'tenant-test', body: { wnoList, priceData } };
}

test('主运单：落库恒存单价，price_mode 记录输入方式（打包价=1）', async () => {
  const invoice = makeInvoice();
  Invoice.find = () => ({ exec: async () => [invoice] });
  Bill.findById = () => ({ exec: async () => null });

  const res = makeRes();
  await updateVesselPrice(
    makeReq([
      {
        wno: 'W001',
        price: 5000,
        inner: 0,
        mode: 1,
        unitPrice: 68.424,
        remark: '打包价录入',
      },
    ]),
    res,
  );

  assert.equal(res.body.ok, true);
  assert.equal(invoice.vessel_price, 68.424);
  assert.equal(invoice.price_mode, 1);
  assert.equal(invoice.price_remark, '打包价录入');
});

test('主运单：录入方式切回每吨时 price_mode 回到 0', async () => {
  const invoice = makeInvoice({ price_mode: 1 });
  Invoice.find = () => ({ exec: async () => [invoice] });
  Bill.findById = () => ({ exec: async () => null });

  const res = makeRes();
  await updateVesselPrice(
    makeReq([{ wno: 'W001', price: 35, inner: 0, mode: 0, unitPrice: 35 }]),
    res,
  );

  assert.equal(invoice.vessel_price, 35);
  assert.equal(invoice.price_mode, 0);
});

test('主运单：调用方未传 mode 时不清掉已记录的输入方式', async () => {
  const invoice = makeInvoice({ price_mode: 1 });
  Invoice.find = () => ({ exec: async () => [invoice] });
  Bill.findById = () => ({ exec: async () => null });

  const res = makeRes();
  await updateVesselPrice(
    makeReq([{ wno: 'W001', price: 35, inner: 0, unitPrice: 35 }]),
    res,
  );

  assert.equal(invoice.vessel_price, 35);
  assert.equal(invoice.price_mode, 1, 'mode 缺省时应保留原值');
});

test('内部车辆：veh_price 存单价，vehicles[].price_mode 记录输入方式', async () => {
  // 内部运单号前 17 位即主运单号（controller 按此匹配）
  const mainWno = '01202607280286001';
  const innerWno = '0120260728028600101';
  const vehicle = {
    inner_waybill_no: innerWno,
    veh_price: 0,
    price_mode: 0,
    price_remark: '',
  };
  const invoice = makeInvoice({
    waybill_no: mainWno,
    bills: [{ bill_id: null, vehicles: [vehicle] }],
  });
  Invoice.find = () => ({ exec: async () => [invoice] });
  Bill.findById = () => ({ exec: async () => null });

  const res = makeRes();
  await updateVesselPrice(
    makeReq(
      [
        {
          wno: innerWno,
          price: 1000,
          inner: 1,
          mode: 1,
          unitPrice: 7.5,
          remark: '',
        },
      ],
      [innerWno],
    ),
    res,
  );

  assert.equal(vehicle.veh_price, 7.5);
  assert.equal(vehicle.price_mode, 1);
});

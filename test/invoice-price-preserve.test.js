const test = require('node:test');
const assert = require('node:assert/strict');

const { __testables } = require('../controllers/api/invoice');

test('getMergedInvoiceState never downgrades invoice status', () => {
  assert.equal(__testables.getMergedInvoiceState('已配发', '新建'), '已配发');
  assert.equal(__testables.getMergedInvoiceState('已结算', '已配发'), '已结算');
  assert.equal(__testables.getMergedInvoiceState('新建', '已配发'), '已配发');
});

test('applyVehiclePricingFromExisting preserves existing vehicle pricing during invoice update', () => {
  const existingVehicles = [
    {
      inner_waybill_no: '01202603310001002001',
      veh_name: '甘A80331',
      veh_ship_from: '南钢',
      veh_price: 7,
      price_mode: 2,
      price_remark: '按吨结算'
    }
  ];

  const nextVehicles = [
    {
      inner_waybill_no: '01202603310001002001',
      veh_name: '甘A80331',
      veh_ship_from: '南钢',
      send_num: 5,
      send_weight: 9.3,
      veh_price: 0,
      price_mode: 0,
      price_remark: ''
    },
    {
      inner_waybill_no: '01202603310001002002',
      veh_name: '苏A0B812',
      veh_ship_from: '南钢',
      send_num: 2,
      send_weight: 3.72,
      veh_price: 0,
      price_mode: 0,
      price_remark: ''
    }
  ];

  const result = __testables.applyVehiclePricingFromExisting(nextVehicles, existingVehicles);

  assert.equal(result[0].veh_price, 7);
  assert.equal(result[0].price_mode, 2);
  assert.equal(result[0].price_remark, '按吨结算');
  assert.equal(result[1].veh_price, 0);
  assert.equal(result[1].price_mode, 0);
  assert.equal(result[1].price_remark, '');
});

test('applyInvoicePricingFromExisting preserves existing truck invoice pricing during invoice update', () => {
  const nextInvoiceInfo = {
    inv_no: '02202604010000001',
    veh_ves_name: '苏A12345',
    num: 8,
    weight: 32.5,
    price: 0,
    veh_ves_price: 0,
    ship_to: '仪征',
    ship_from: '南钢',
    vehicles: [],
    inv_settle_flag: 0
  };

  const existingInvoiceInfo = {
    inv_no: '02202604010000001',
    veh_ves_name: '苏A12345',
    price: 135.6,
    veh_ves_price: 4.2
  };

  const result = __testables.applyInvoicePricingFromExisting(nextInvoiceInfo, existingInvoiceInfo);

  assert.equal(result.price, 135.6);
  assert.equal(result.veh_ves_price, 4.2);
});

test('applyVehiclePricingFromExisting preserves ship vehicle pricing when quantities change during re-dispatch', () => {
  const existingVehicles = [
    {
      inner_waybill_no: '01202603310001002000',
      veh_name: '赣C44945',
      veh_ship_from: '南钢',
      send_num: 36,
      send_weight: 66.96,
      veh_price: 8.5,
      price_mode: 1,
      price_remark: '修改前已录价'
    }
  ];

  const nextVehicles = [
    {
      inner_waybill_no: '01202603310001002000',
      veh_name: '赣C44945',
      veh_ship_from: '南钢',
      send_num: 29,
      send_weight: 53.94,
      veh_price: 0,
      price_mode: 0,
      price_remark: ''
    }
  ];

  const result = __testables.applyVehiclePricingFromExisting(nextVehicles, existingVehicles);

  assert.equal(result[0].veh_price, 8.5);
  assert.equal(result[0].price_mode, 1);
  assert.equal(result[0].price_remark, '修改前已录价');
});

test('applyVehiclePricingFromExisting does not carry price to a different vehicle', () => {
  const existingVehicles = [
    {
      inner_waybill_no: '01202603310001002000',
      veh_name: '赣C44945',
      veh_ship_from: '南钢',
      veh_price: 8.5,
      price_mode: 1,
      price_remark: '旧车价格'
    }
  ];

  const nextVehicles = [
    {
      inner_waybill_no: '01202603310001002000',
      veh_name: '苏A0B812',
      veh_ship_from: '南钢',
      send_num: 2,
      send_weight: 3.72,
      veh_price: 0,
      price_mode: 0,
      price_remark: ''
    }
  ];

  const result = __testables.applyVehiclePricingFromExisting(nextVehicles, existingVehicles);

  assert.equal(result[0].veh_price, 0);
  assert.equal(result[0].price_mode, 0);
  assert.equal(result[0].price_remark, '');
});

test('applyVehiclePricingFromExisting does not carry price when ship_from changes', () => {
  const existingVehicles = [
    {
      inner_waybill_no: '01202603310001002000',
      veh_name: '赣C44945',
      veh_ship_from: '南钢',
      veh_price: 8.5,
      price_mode: 1,
      price_remark: '南钢价格'
    }
  ];

  const nextVehicles = [
    {
      inner_waybill_no: '01202603310001002000',
      veh_name: '赣C44945',
      veh_ship_from: '梅钢',
      send_num: 29,
      send_weight: 53.94,
      veh_price: 0,
      price_mode: 0,
      price_remark: ''
    }
  ];

  const result = __testables.applyVehiclePricingFromExisting(nextVehicles, existingVehicles);

  assert.equal(result[0].veh_price, 0);
  assert.equal(result[0].price_mode, 0);
  assert.equal(result[0].price_remark, '');
});

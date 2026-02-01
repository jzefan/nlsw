const Bill = require('../../models/Bill');
const Invoice = require('../../models/Invoice');
const Settle = require('../../models/Settle');
const Vehicle = require('../../models/Vehicle');
const utils = require('../../controllers/utils');

// Helper to get start/end date
function getStartEndDate(start, end, isDay) {
  if (start === end) {
    const d1 = utils.convertDateToUTC(new Date(start));
    const d2 = utils.convertDateToUTC(new Date(end));
    if (isDay) {
      d2.setDate(d1.getDate() + 1);
    } else {
      d2.setMonth(d1.getMonth() + 1);
    }
    return { s: d1, e: d2 };
  } else {
    return { s: start, e: end };
  }
}

// Helper to copy bill properties
function copyBill(bill, binv, veh) {
  const obj = {
    _id: bill._id,
    bill_no: bill.bill_no,
    order_no: bill.order_no,
    order_item_no: bill.order_item_no,
    brand_no: bill.brand_no,
    billing_name: bill.billing_name,
    len: bill.len,
    width: bill.width,
    thickness: bill.thickness,
    size_type: bill.size_type,
    weight: bill.weight,
    block_num: bill.block_num,
    total_weight: bill.total_weight,
    left_num: bill.left_num,
    collection_price: bill.collection_price,
    invoices: [],
    warehouse: bill.warehouse,
    ship_warehouse: bill.ship_warehouse,
    contract_no: bill.contract_no,
    sales_dep: bill.sales_dep,
    create_date: bill.create_date,
    shipping_date: bill.shipping_date,
    creater: bill.creater,
    shipper: bill.shipper,
    status: bill.status,
    settle_flag: bill.settle_flag,
    product_type: bill.product_type,
    ship_customer: bill.ship_customer,
    inv_ship_date: bill.inv_ship_date,
    inv_shipper: bill.inv_shipper,
    status_2: bill.status_2,
    inv_settle_flag: bill.inv_settle_flag
  };

  if (veh) {
    obj.inv_no = veh.inner_waybill_no;
    obj.veh_ves_name = veh.veh_name;
    obj.send_num = veh.send_num;
    obj.send_weight = veh.send_weight;
    obj.price = veh.veh_price;
    obj.ship_to = binv.veh_ves_name;
    obj.ship_from = veh.veh_ship_from;
  } else {
    obj.inv_no = binv.inv_no;
    obj.veh_ves_name = binv.veh_ves_name;
    obj.send_num = binv.num;
    obj.send_weight = (bill.block_num > 0 ? bill.weight * binv.num : binv.weight);
    obj.price = binv.price;
    obj.veh_ves_price = binv.veh_ves_price;
    obj.ship_to = binv.ship_to;
    obj.ship_from = binv.ship_from;
  }

  return obj;
}

// Helper to construct bill array
function getBillArray(bills, invs, settles, vehList, mode) {
  const statObj = {};
  settles.forEach(function (settle) {
    settle.bills.forEach(function (sbill) {
      if (statObj[sbill.bill_id]) {
        statObj[sbill.bill_id].push({ no: sbill.inv_no, stat: settle.status })
      } else {
        statObj[sbill.bill_id] = [{ no: sbill.inv_no, stat: settle.status }];
      }
    })
  });

  const invObj = {};
  invs.forEach(function (inv) {
    invObj[inv.waybill_no] = { customer: inv.ship_customer, date: inv.ship_date, shipper: inv.shipper }
  });

  const copied = [];
  const b = vehList && vehList.length > 0;

  bills.forEach(function (bill) {
    bill.invoices.forEach(function (binv) {
      let o = invObj[binv.inv_no];
      if (o) {
        bill.ship_customer = o.customer;
        bill.inv_ship_date = o.date;
        bill.inv_shipper = o.shipper;
        bill.status_2 = '';

        if (statObj[bill._id]) {
          for (let k = 0; k < statObj[bill._id].length; ++k) {
            if (binv.inv_no === statObj[bill._id][k].no) {
              bill.status_2 = statObj[bill._id][k].stat;
              break;
            }
          }
        }

        bill.inv_settle_flag = binv.inv_settle_flag;
        if (mode === 0) {
          if (!b || vehList.indexOf(binv.veh_ves_name) >= 0) {
            copied.push(copyBill(bill, binv, null));
          }
        } else if (mode === 1) {
          binv.vehicles.forEach(function (veh) {
            if (!b || vehList.indexOf(veh.veh_name) >= 0) {
              copied.push(copyBill(bill, binv, veh));
            }
          })
        } else {
          if (!b || vehList.indexOf(binv.veh_ves_name) >= 0) {
            copied.push(copyBill(bill, binv, null));
            binv.vehicles.forEach(function (veh) {
              if (!b || vehList.indexOf(veh.veh_name) >= 0) {
                copied.push(copyBill(bill, binv, veh));
              }
            })
          }
        }
      }
    })
  });

  return copied;
}

function combineBill(bills, invs) {
  let invObj = {};
  invs.forEach(function (inv) {
    invObj[inv.waybill_no] = { customer: inv.ship_customer, date: inv.ship_date, shipper: inv.shipper, remark: inv.incoming_price_remark }
  });

  let copied = [];

  bills.forEach(function (bill) {
    bill.invoices.forEach(function (binv) {
      let o = invObj[binv.inv_no];
      if (o) {
        copied.push({
          _id: bill._id,
          bill_no: bill.bill_no,
          order_no: bill.order_no,
          order_item_no: bill.order_item_no,
          order: bill.order_no + '-' + utils.leftPad(bill.order_item_no, 3),
          brand_no: bill.brand_no,
          billing_name: bill.billing_name,
          len: bill.len,
          width: bill.width,
          thickness: bill.thickness,
          size_type: bill.size_type,
          weight: bill.weight,
          block_num: bill.block_num,
          total_weight: bill.total_weight,
          left_num: bill.left_num,
          collection_price: bill.collection_price,
          invoices: [],
          warehouse: bill.warehouse,
          ship_warehouse: bill.ship_warehouse,
          contract_no: bill.contract_no,
          sales_dep: bill.sales_dep,
          create_date: bill.create_date,
          shipping_date: bill.shipping_date,
          creater: bill.creater,
          shipper: bill.shipper,
          status: bill.status,
          settle_flag: bill.settle_flag,
          product_type: bill.product_type,
          inv_no: binv.inv_no,
          veh_ves_name: binv.veh_ves_name,
          send_num: binv.num,
          send_weight: bill.block_num > 0 ? bill.weight * binv.num : binv.weight,
          price: binv.price,
          ship_to: binv.ship_to,
          ship_from: binv.ship_from,
          ship_customer: o.customer,
          inv_ship_date: o.date,
          inv_shipper: o.shipper,
          inv_settle_flag: binv.inv_settle_flag,
          incoming_price_remark: o.remark
        });
      }
    })
  });

  return copied;
}

exports.getIntegratedQuery = async function (req, res) {
  var query = req.query;
  var obj = {};
  var bVeh = !utils.isEmpty(query.fVeh);
  var bDest = !utils.isEmpty(query.fDest);
  var bDate = !utils.isEmpty(query.fDate1) && !utils.isEmpty(query.fDate2);
  var bName = !utils.isEmpty(query.fName);
  var bBNo = !utils.isEmpty(query.fBno);
  var bOrder = !utils.isEmpty(query.fOrder);
  var bVehMode = !utils.isEmpty(query.fVehMode);
  var qDate;

  // Pagination parameters
  const page = parseInt(query.page) || 1;
  const limit = parseInt(query.limit) || 20;
  const skip = (page - 1) * limit;
  const isExport = query.isExport === 'true'; // Flag to skip pagination for export

  if (bDate) {
    qDate = getStartEndDate(query.fDate1, query.fDate2, true);
  }

  try {
    if (query.fType === 'invoice-first') {
      obj = { $and: [{ state: { $ne: '新建' } }] };
      if (bVeh) obj["$and"].push({ vehicle_vessel_name: { $in: query.fVeh } });
      if (bDest) obj["$and"].push({ ship_to: { $in: query.fDest } });
      if (bDate) obj["$and"].push({ ship_date: { $gte: qDate.s, $lte: qDate.e } });
      if (bName) obj["$and"].push({ ship_name: { $in: query.fName } });

      // 只有当selfOwned为1或'1'时，才作为查询条件
      if (query.selfOwned === 1 || query.selfOwned === '1') {
        obj["$and"].push({ selfOwned: 1 })
      }

      // Invoice First: Pagination on Invoices first? No, we merge with Bills.
      // Logic: Fetch Invoices -> Get Bill IDs -> Fetch Bills -> Combine
      // Pagination is tricky here because it's a join.
      // Simple approach: Fetch all matching invoices first (might be large), then paginate the combined result?
      // Or paginate invoices? If we paginate invoices, we get a subset of bills.
      
      const db_invs = await Invoice.find(obj)
        .select('waybill_no ship_customer ship_date shipper bills incoming_price_remark')
        .lean()
        .exec();

      if (db_invs && db_invs.length) {
        let ids = utils.getAllList(true, db_invs, "bills", "bill_id");
        let billQueryObj = { $and: [{ _id: { $in: ids } }] };
        if (bBNo) billQueryObj["$and"].push({ bill_no: { $regex: new RegExp(query.fBno, 'gi') } });
        if (bOrder) billQueryObj["$and"].push({ order_no: { $regex: new RegExp(query.fOrder, 'gi') } });

        const bills = await Bill.find(billQueryObj).lean().exec();
        if (bills && bills.length) {
          const combined = combineBill(bills, db_invs);
          const total = combined.length;
          const pagedData = isExport ? combined : combined.slice(skip, skip + limit);
          res.json({ bills: pagedData, ok: true, total, page, limit });
        } else {
          res.json({ ok: false, bills: [], total: 0 });
        }
      } else {
        res.json({ ok: false, bills: [], total: 0 });
      }
    } else {  // bill first
      var showVehicles = (utils.isExist(query.fShowDestForVessel) && (query.fShowDestForVessel == 1)) ? 1 : 0;
      var showUnsend = (utils.isExist(query.fShowUnsend) && (query.fShowUnsend == 1)) ? true : false;
      var bc = !utils.isEmpty(query.fCustomerName);

      const vehList = await Vehicle.find({ veh_category: '自有' }).select('name').lean().exec();
      var vehs = utils.getAllList(false, vehList, "name", "");

      obj = { $and: [] };
      let finalBills = [];

      if (!showUnsend && (bVeh || bDest || bDate || bc)) {
        if (bVeh && !bDest && !bDate && !bc) {
          obj["$and"].push({ $or: [{ vehicle_vessel_name: { $in: query.fVeh } }, { 'bills.vehicles.veh_name': { $in: query.fVeh } }] });
        } else if (bDest && !bVeh && !bDate && !bc) {
          obj["$and"].push({ ship_to: { $in: query.fDest } });
        } else if (bDate && !bVeh && !bDest && !bc) {
          obj["$and"].push({ ship_date: { $gte: qDate.s, $lte: qDate.e } });
        } else if (bc && !bVeh && !bDest && !bDate) {
          obj["$and"].push({ ship_customer: query.fCustomerName });
        } else {
          if (bVeh) obj["$and"].push({ $or: [{ vehicle_vessel_name: { $in: query.fVeh } }, { 'bills.vehicles.veh_name': { $in: query.fVeh } }] });
          if (bDest) obj["$and"].push({ ship_to: { $in: query.fDest } });
          if (bDate) obj["$and"].push({ ship_date: { $gte: query.fDate1, $lte: query.fDate2 } });
          if (bc) obj["$and"].push({ ship_customer: query.fCustomerName });
        }

        let invoices;
        if (bVehMode) {
          var vehs_inner = utils.getAllList(false, vehList, "name", "");
          if (query.fVehMode === '自有') {
            if (Object.keys(obj).length > 0)
              obj["$and"].push({ $or: [{ vehicle_vessel_name: { $in: vehs_inner } }, { 'bills.vehicles.veh_name': { $in: vehs_inner } }] });
            else
              obj = { $or: [{ vehicle_vessel_name: { $in: vehs_inner } }, { 'bills.vehicles.veh_name': { $in: vehs_inner } }] };
          } else {
            if (Object.keys(obj).length > 0) {
              obj["$and"].push({ $and: [{ vehicle_vessel_name: { $nin: vehs_inner } }, { 'bills.vehicles.veh_name': { $nin: vehs_inner } }] });
            } else {
              obj = { $and: [{ vehicle_vessel_name: { $nin: vehs_inner } }, { 'bills.vehicles.veh_name': { $nin: vehs_inner } }] };
            }
          }
          invoices = await Invoice.find(obj).select('waybill_no ship_customer ship_date shipper bills').lean().exec();
        } else {
          invoices = await Invoice.find(obj).select('waybill_no ship_customer ship_date shipper bills').lean().exec();
        }

        if (invoices && invoices.length) {
          var ids = utils.getAllList(true, invoices, "bills", "bill_id");
          let billQueryObj = { _id: { $in: ids } };
          if (bName || bBNo || bOrder) {
            billQueryObj = { $and: [{ _id: { $in: ids } }] };
            if (bName) billQueryObj["$and"].push({ billing_name: { $in: query.fName } });
            if (bBNo) billQueryObj["$and"].push({ bill_no: { $regex: new RegExp(query.fBno, 'gi') } });
            if (bOrder) billQueryObj["$and"].push({ order_no: { $regex: new RegExp(query.fOrder, 'gi') } });
          }

          const bills = await Bill.find(billQueryObj).lean().exec();
          const settles = await Settle.find({ status: { '$ne': '已结算' } }).select('bills status').lean().exec();
          finalBills = getBillArray(bills, invoices, settles, query.fVeh, showVehicles);
        }

      } else { // only find from Bill
        if (bName || bBNo || bOrder || bVehMode || showUnsend) { // Added showUnsend to condition to allow fetching unsent bills without other filters
          obj = { $and: [] };
          if (bName) obj["$and"].push({ billing_name: { $in: query.fName } });
          if (bBNo) obj["$and"].push({ bill_no: { $regex: new RegExp(query.fBno, 'gi') } });
          if (bOrder) obj["$and"].push({ order_no: { $regex: new RegExp(query.fOrder, 'gi') } });
          if (showUnsend) {
            obj["$and"].push({ status: { $ne: '已配发' } });
            obj["$and"].push({ status: { $ne: '已结算' } });
            obj["$and"].push({ status: { $ne: '待配发' } });
          }

          if (bVehMode) {
            if (query.fVehMode === '自有') {
              obj["$and"].push({ $or: [{ 'invoices.veh_ves_name': { $in: vehs } }, { 'invoices.vehicles.veh_name': { $in: vehs } }] });
            } else {
              obj["$and"].push({ $and: [{ 'invoices.veh_ves_name': { $nin: vehs } }, { 'invoices.vehicles.veh_name': { $nin: vehs } }] });
            }
          }

          const bills = await Bill.find(obj).lean().exec();
          if (showUnsend) {
            finalBills = bills;
          } else {
            var invNoList = utils.getAllList(true, bills, "invoices", "inv_no");
            if (invNoList.length) {
              const db_invs = await Invoice.find({ waybill_no: { $in: invNoList } })
                .select('waybill_no ship_customer ship_date shipper')
                .lean()
                .exec();
              const settles = await Settle.find({ status: { '$ne': '已结算' } }).select('bills status').lean().exec();
              finalBills = getBillArray(bills, db_invs, settles, query.fVeh, showVehicles);
            } else {
              finalBills = getBillArray(bills, [], [], query.fVeh, showVehicles);
            }
          }
        }
      }

      // Memory Pagination
      const total = finalBills.length;
      const pagedData = isExport ? finalBills : finalBills.slice(skip, skip + limit);
      res.json({ ok: true, bills: pagedData, total, page, limit });
    }
  } catch (err) {
    console.error("getIntegratedQuery error:", err);
    res.json({ ok: false, error: err.message });
  }
};

exports.getInvoiceReport = async function (req, res) {
  const query = req.query;
  const obj = { $and: [] };

  if (query.fDest) {
    obj.$and.push({ ship_to: query.fDest });
  }

  if (!utils.isEmpty(query.fDate1) && !utils.isEmpty(query.fDate2)) {
    const qDate = getStartEndDate(query.fDate1, query.fDate2, true);
    obj.$and.push({ ship_date: { $gte: qDate.s, $lte: qDate.e } });
  }

  if (query.fName) {
    obj.$and.push({ ship_name: query.fName });
  }

  if (query.fVeh) {
    obj.$and.push({ vehicle_vessel_name: query.fVeh });
  }

  if (query.fShipper) {
    obj.$and.push({ shipper: query.fShipper });
  }

  if (obj.$and.length === 0) {
    delete obj.$and;
  }

  try {
    const db_invs = await Invoice.find(obj).sort({ ship_date: 'desc' }).lean().exec();
    if (db_invs && db_invs.length > 0) {
      if (db_invs.length > 150) {
        return res.json({ ok: true, hint: true, num: db_invs.length, invs: db_invs });
      }

      const ids = utils.getAllList(true, db_invs, "bills", "bill_id");
      const bills = await Bill.find({ _id: { $in: ids } }).lean().exec();
      
      if (!bills || bills.length === 0) {
        return res.json({ ok: false, message: '未找到相关提单' });
      }

      const prices = {};
      db_invs.forEach(function (inv) {
        let customer_price = 0;
        let veh_price = inv.vessel_price > 0 ? inv.vessel_price * inv.total_weight : 0;

        inv.bills.forEach(function (b) {
          const bill = bills.find(item => String(item._id) === String(b.bill_id));
          if (bill) {
            const invRecord = bill.invoices.find(ir => ir.inv_no === inv.waybill_no);
            if (invRecord) {
              let w = invRecord.weight;
              if ((!w || w === 0) && bill.block_num > 0) {
                w = invRecord.num * bill.weight;
              }

              let p = invRecord.price > 0 ? invRecord.price : 0;
              p += bill.collection_price > 0 ? bill.collection_price : 0;
              customer_price += p * w;
            }
          }
        });

        const c = customer_price / inv.total_weight;
        const v = veh_price / inv.total_weight;
        prices[inv.waybill_no] = {
          cust_price: utils.toFixedNumber(c, 3),
          veh_price: utils.toFixedNumber(v, 3),
          net_income: utils.toFixedNumber(c - v, 3)
        };
      });

      res.json({ ok: true, hint: false, invs: db_invs, prices: prices });
    } else {
      res.json({ ok: false, message: '未找到符合条件的运单' });
    }
  } catch (err) {
    console.error("getInvoiceReport error:", err);
    res.json({ ok: false, error: err.message });
  }
};

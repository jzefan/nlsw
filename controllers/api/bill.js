const Bill = require("../../models/Bill");
const Invoice = require("../../models/Invoice");
const Company = require("../../models/Company");
const Warehouse = require("../../models/Warehouse");
const Brand = require("../../models/Brand");
const utils = require("../../controllers/utils");
const fastcsv = require("fast-csv");
const {
  buildTenantQuery,
  injectTenantId,
  isPlatformUser,
} = require("../../utils/tenant");
const { pinyin } = require("pinyin-pro");

function pushArr(arr, elem) {
  if (elem && arr.indexOf(elem) < 0) {
    arr.push(elem);
  }
}

function isInteger(n) {
  return n === +n && n === (n | 0);
}

function isEmpty(variable) {
  return typeof variable === "undefined" || !variable || 0 === variable.length;
}

exports.getBills = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const baseQuery = {};

    // Filters
    if (req.query.billNo) {
      baseQuery.bill_no = { $regex: req.query.billNo, $options: "i" };
    }
    if (req.query.orderNo) {
      baseQuery.order_no = req.query.orderNo; // Use exact match for performance
    }
    if (req.query.billingName) {
      baseQuery.billing_name = req.query.billingName;
    }
    if (req.query.brandNo) {
      baseQuery.brand_no = { $regex: req.query.brandNo, $options: "i" };
    }
    if (req.query.contractNo) {
      baseQuery.contract_no = { $regex: req.query.contractNo, $options: "i" };
    }
    if (req.query.status) {
      baseQuery.status = req.query.status;
    }
    if (req.query.leftNumOnly === "true") {
      baseQuery.left_num = { $gt: 0 };
    }
    if (req.query.creater) {
      baseQuery.creater = req.query.creater;
    }

    if (req.query.startTime || req.query.endTime) {
      baseQuery.create_date = {};
      if (req.query.startTime) {
        baseQuery.create_date.$gte = utils.parseLocalDate(req.query.startTime);
      }
      if (req.query.endTime) {
        // Add 1 day to include the end date fully
        const end = utils.parseLocalDate(req.query.endTime);
        end.setDate(end.getDate() + 1);
        baseQuery.create_date.$lt = end;
      }
    }

    const query = buildTenantQuery(req, baseQuery);
    const count = await Bill.countDocuments(query);
    const bills = await Bill.find(query)
      .sort({ create_date: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    // 查询每个提单关联的运单信息（车船号/运单号）
    const billIds = bills.map((b) => b._id);
    if (billIds.length > 0) {
      const invoices = await Invoice.find(
        buildTenantQuery(req, {
          "bills.bill_id": { $in: billIds },
          state: { $ne: "新建" },
        }),
        {
          waybill_no: 1,
          vehicle_vessel_name: 1,
          "bills.bill_id": 1,
          "bills.vehicles.veh_name": 1,
          "bills.vehicles.inner_waybill_no": 1,
        },
      ).lean();

      // 构建 billId -> [{vehicle_vessel_name, waybill_no, veh_name?}] 映射
      const billDispatchMap = {};
      for (const inv of invoices) {
        for (const b of inv.bills || []) {
          const bid = String(b.bill_id);
          if (!billIds.some((id) => String(id) === bid)) continue;
          if (!billDispatchMap[bid]) billDispatchMap[bid] = [];

          if (b.vehicles && b.vehicles.length > 0) {
            // 船运：每个车一条记录
            for (const veh of b.vehicles) {
              billDispatchMap[bid].push({
                veh_name: veh.veh_name,
                waybill_no: veh.inner_waybill_no || inv.waybill_no,
              });
            }
          } else {
            // 车运
            billDispatchMap[bid].push({
              veh_name: inv.vehicle_vessel_name,
              waybill_no: inv.waybill_no,
            });
          }
        }
      }

      // 附加到提单数据
      for (const bill of bills) {
        bill.dispatches = billDispatchMap[String(bill._id)] || [];
      }
    }

    // 兼容历史数据：camelCase 字段映射回 snake_case
    for (const bill of bills) {
      console.log("Original bill: sales_dep", bill.sale_dep);
      if (!bill.sales_dep && bill.salesDep) bill.sales_dep = bill.salesDep;
      if (!bill.ship_warehouse && bill.shipWarehouse)
        bill.ship_warehouse = bill.shipWarehouse;
      if (!bill.contract_no && bill.contractNo)
        bill.contract_no = bill.contractNo;
      if (!bill.bill_no && bill.billNo) bill.bill_no = bill.billNo;
      if (!bill.billing_name && bill.billingName)
        bill.billing_name = bill.billingName;
      if (!bill.brand_no && bill.brandNo) bill.brand_no = bill.brandNo;
    }

    res.json({
      ok: true,
      data: bills,
      total: count,
      page: page,
      totalPages: Math.ceil(count / limit),
    });
  } catch (error) {
    console.error("getBills error:", error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

// 获取可配发提单的开单名称列表（left_num > 0 即可配发）
// Cache pinyin initials per tenant to avoid repeated computation
const _pinyinCache = new Map(); // tenantId -> { names: Map<name, initials>, ts: number }
const PINYIN_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getPinyinInitials(name) {
  return pinyin(name, { pattern: "first", toneType: "none", type: "array" })
    .join("")
    .toLowerCase();
}

exports.getBillingNames = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = (req.query.search || "").trim();

    const matchStage = {
      left_num: { $gt: 0 },
      billing_name: { $exists: true, $nin: [null, ""] },
    };

    if (!isPlatformUser(req)) {
      matchStage.tenantId = req.tenantId;
    }

    // Get all distinct billing names (small set, typically <200)
    const allNames = await Bill.aggregate([
      { $match: matchStage },
      { $group: { _id: "$billing_name" } },
      { $sort: { _id: 1 } },
    ]);

    let filtered = allNames.map((r) => r._id);

    if (search) {
      const searchLower = search.toLowerCase();
      // Get or build pinyin cache for this tenant
      const cacheKey = String(req.tenantId || "platform");
      let cache = _pinyinCache.get(cacheKey);
      if (!cache || Date.now() - cache.ts > PINYIN_CACHE_TTL) {
        cache = { names: new Map(), ts: Date.now() };
        _pinyinCache.set(cacheKey, cache);
      }

      filtered = filtered.filter((name) => {
        // Match by Chinese substring
        if (name.toLowerCase().includes(searchLower)) return true;
        // Match by pinyin initials
        let initials = cache.names.get(name);
        if (initials === undefined) {
          initials = getPinyinInitials(name);
          cache.names.set(name, initials);
        }
        return initials.includes(searchLower);
      });
    }

    const total = filtered.length;
    const data = filtered.slice((page - 1) * limit, page * limit);

    res.json({
      ok: true,
      data: data.map((name) => ({ name })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("getBillingNames error:", error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

/**
 * 获取订单号列表（仅返回订单号，不含提单明细）
 * GET /bills/orders
 * Query: billingName, search, page, limit
 */
exports.getOrders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search || "";
    const billingName = req.query.billingName;

    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

    const matchStage = {
      left_num: { $gt: 0 },
      create_date: { $gte: twoYearsAgo },
    };

    if (billingName) {
      matchStage.billing_name = billingName;
    }
    if (search) {
      matchStage.$or = [
        { order_no: { $regex: search, $options: "i" } },
        { bill_no: { $regex: search, $options: "i" } },
      ];
    }

    if (!isPlatformUser(req)) {
      matchStage.tenantId = req.tenantId;
    }

    const [orderResult] = await Bill.aggregate([
      { $match: matchStage },
      { $group: { _id: "$order_no" } },
      { $sort: { _id: 1 } },
      {
        $facet: {
          metadata: [{ $count: "total" }],
          data: [{ $skip: (page - 1) * limit }, { $limit: limit }],
        },
      },
    ]);

    const total =
      orderResult.metadata.length > 0 ? orderResult.metadata[0].total : 0;
    const data = orderResult.data.map((r) => ({ order_no: r._id }));

    res.json({
      ok: true,
      data,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("getOrders error:", error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

/**
 * 获取指定订单的提单列表
 * GET /bills/order-bills
 * Query: billingName, orderNo, waybillNo (可选，修改运单时传入以包含已配发的提单)
 */
exports.getOrderBills = async (req, res) => {
  try {
    const { billingName, orderNo, waybillNo, allBills } = req.query;
    if (!orderNo) {
      return res.status(400).json({ ok: false, error: "缺少 orderNo 参数" });
    }

    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

    const projection = {
      _id: 1,
      order_no: 1,
      bill_no: 1,
      order_item_no: 1,
      left_num: 1,
      block_num: 1,
      weight: 1,
      thickness: 1,
      width: 1,
      len: 1,
      ship_warehouse: 1,
      contract_no: 1,
      brand_no: 1,
      total_weight: 1,
    };

    const baseMatch = {
      order_no: orderNo,
      create_date: { $gte: twoYearsAgo },
    };

    if (billingName) {
      baseMatch.billing_name = billingName;
    }

    if (!isPlatformUser(req)) {
      baseMatch.tenantId = req.tenantId;
    }

    // 查询提单（allBills=true 时不过滤 left_num，用于数据处理等场景）
    const findQuery = allBills === 'true'
      ? { ...baseMatch }
      : { ...baseMatch, left_num: { $gt: 0 } };
    const bills = await Bill.find(findQuery, projection)
      .sort({ order_item_no: 1, bill_no: 1 })
      .lean();

    // 修改运单时，还需包含该运单已配发但 left_num 为 0 的提单
    if (waybillNo) {
      const existingBillIds = new Set(bills.map((b) => b._id.toString()));

      const invoiceQuery = { waybill_no: waybillNo };
      if (!isPlatformUser(req)) {
        invoiceQuery.tenantId = req.tenantId;
      }
      const invoice = await Invoice.findOne(invoiceQuery, { bills: 1 }).lean();

      if (invoice && invoice.bills) {
        const invoiceBillIds = invoice.bills
          .map((ib) => ib.bill_id)
          .filter((id) => id && !existingBillIds.has(id.toString()));

        if (invoiceBillIds.length > 0) {
          const extraBills = await Bill.find(
            { _id: { $in: invoiceBillIds }, ...baseMatch },
            projection,
          )
            .sort({ order_item_no: 1, bill_no: 1 })
            .lean();
          bills.push(...extraBills);
        }
      }
    }

    res.json({
      ok: true,
      data: bills,
    });
  } catch (error) {
    console.error("getOrderBills error:", error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

exports.createBills = async (req, res) => {
  let allBillName = [];
  let allWarehouse = [];
  let allBrandNo = [];
  let allocatedData = [];
  let createdCount = 0;

  try {
    for (let row_data of req.body) {
      let order_no = row_data.orderNo || row_data.order_no;
      let order_item_no = row_data.orderItemNo || row_data.order_item_no;
      let bno = row_data.billNo || row_data.bill_no;
      let order_combined = order_no + "-" + utils.leftPad(order_item_no, 3);

      // Validate billing_name is required
      let billing_name = row_data.billingName || row_data.billing_name;
      if (!billing_name || billing_name.trim() === "") {
        return res.status(400).json({
          ok: false,
          error: `提单 ${order_combined}-${bno} 缺少开单名称，该字段为必填项`,
        });
      }

      let bill = await Bill.findOne(
        buildTenantQuery(req, { order: order_combined, bill_no: bno }),
      ).exec();
      if (!bill) {
        bill = new Bill(
          injectTenantId(req, {
            order: order_combined,
            bill_no: bno,
            order_no: order_no,
            order_item_no: order_item_no,
            billing_name: billing_name,
            sale_dep: row_data.saleDep || row_data.sale_dep,
            block_num: utils.getIntValue(
              row_data.blockNum || row_data.block_num,
            ),
            total_weight: utils.getFloatValue(
              row_data.totalWeight || row_data.total_weight,
              3,
            ),

            warehouse: row_data.warehouse,
            ship_warehouse: row_data.shipWarehouse || row_data.ship_warehouse,
            contract_no: row_data.contractNo || row_data.contract_no,
            shipping_address:
              row_data.shippingAddress || row_data.shipping_address,
            product_type: row_data.productType || row_data.product_type,
            carrier: row_data.carrier,
            creater: req.user ? req.user.userid : "admin",
            invoices: [],
            customer_price: 0,
            collection_price: 0,
          }),
        );

        // Handle Brand
        let brandNo = row_data.brandNo || row_data.brand_no;
        if (brandNo) {
          let brd_list = brandNo.split(/\s*;\s*/);
          if (brd_list.length) {
            bill.brand_no = brd_list[brd_list.length - 1];
            pushArr(allBrandNo, bill.brand_no);
          }
        }

        // Handle Dimensions
        let dimensions = row_data.dimensions;
        if (!isEmpty(dimensions)) {
          bill.len = bill.width = bill.thickness = 0;
          let temp = dimensions.replace(/≠/, "").split("*");
          if (temp.length) {
            bill.thickness = utils.getFloatValue(temp[0], 0);
            if (temp.length === 2) {
              bill.width = utils.getIntValue(temp[1]);
            } else if (temp.length === 3) {
              bill.width = utils.getIntValue(temp[1]);
              bill.len = utils.getIntValue(temp[2]);
            }
          }
        } else {
          bill.len = utils.getIntValue(row_data.len || row_data.length);
          bill.width = utils.getIntValue(row_data.width);
          bill.thickness = utils.getFloatValue(row_data.thickness, 0);
        }

        // Size Type: 保留原始值（定尺、双定尺、单定、非定尺等）
        let sizeType = row_data.sizeType || row_data.size_type;
        if (isEmpty(sizeType)) {
          bill.size_type = "定尺";
        } else if (sizeType === "单定尺") {
          bill.size_type = "单定";
        } else {
          bill.size_type = sizeType;
        }

        // Calculate Weight
        if (bill.total_weight > 0) {
          if (bill.block_num > 0) {
            bill.weight = bill.total_weight / bill.block_num;
          } else {
            bill.block_num = 0;
            let weight = 0;
            if (row_data.weight) {
              weight = utils.getFloatValue(row_data.weight, 3);
            } else {
              if (bill.len > 0 && bill.width > 0 && bill.thickness > 0) {
                weight = utils.toFixedNumber(
                  bill.len *
                    bill.width *
                    bill.thickness *
                    7.85 *
                    Math.pow(10, -9),
                  3,
                );
              }
            }

            if (weight > 0) {
              let n = bill.total_weight / weight;
              if (isInteger(n)) {
                bill.block_num = n;
              } else {
                let round = Math.round(n);
                if (Math.abs(round - n) < 0.00001) {
                  bill.block_num = round;
                }
              }
            }
            bill.weight = bill.block_num > 0 ? weight : 0;
          }
          bill.left_num =
            bill.block_num > 0 ? bill.block_num : bill.total_weight;

          await bill.save();
          createdCount++;
        }
      } else {
        if (bill.status != "新建") {
          allocatedData.push(bill);
        }
      }

      pushArr(allBillName, bill.billing_name);
      pushArr(allWarehouse, bill.warehouse);
      pushArr(allWarehouse, bill.ship_warehouse);
    }

    // Update OrderNumber dictionary
    try {
      const OrderNumber = require('../../models/OrderNumber');
      const orderNoOps = [];
      const seenOrderNos = new Set();
      for (let row_data of req.body) {
        const orderNo = row_data.orderNo || row_data.order_no;
        if (orderNo && !seenOrderNos.has(orderNo)) {
          seenOrderNos.add(orderNo);
          orderNoOps.push({
            updateOne: {
              filter: { tenantId: req.tenantId, type: 'order_no', value: orderNo },
              update: { $setOnInsert: { tenantId: req.tenantId, type: 'order_no', value: orderNo } },
              upsert: true
            }
          });
        }
      }
      if (orderNoOps.length > 0) {
        await OrderNumber.bulkWrite(orderNoOps);
      }
    } catch (e) {
      console.error('OrderNumber insert error (non-fatal):', e.message);
    }

    // Update Dictionaries
    for (let w of allWarehouse) {
      if (!w) continue;
      let ware = await Warehouse.findOne(
        buildTenantQuery(req, { name: w }),
      ).exec();
      if (!ware) {
        ware = new Warehouse(injectTenantId(req, { name: w }));
        await ware.save();
      }
    }
    for (let b of allBrandNo) {
      if (!b) continue;
      let brand = await Brand.findOne(
        buildTenantQuery(req, { name: b }),
      ).exec();
      if (!brand) {
        brand = new Brand(injectTenantId(req, { name: b }));
        await brand.save();
      }
    }
    for (let bn of allBillName) {
      if (!bn) continue;
      let comp = await Company.findOne(
        buildTenantQuery(req, { name: bn }),
      ).exec();
      if (!comp) {
        comp = new Company(injectTenantId(req, { name: bn }));
        await comp.save();
      }
    }

    res.json({ ok: true, count: createdCount, allocatedData });
  } catch (err) {
    console.error("createBills error:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
};

exports.deleteBills = async (req, res) => {
  try {
    const ids = req.body;
    await Bill.deleteMany(buildTenantQuery(req, { _id: { $in: ids } })).exec();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};

exports.updateBill = async (req, res) => {
  try {
    const id = req.body._id;
    const updateData = req.body;
    delete updateData._id;

    // Validate billing_name is required and not empty
    if ("billing_name" in updateData) {
      if (!updateData.billing_name || updateData.billing_name.trim() === "") {
        return res.status(400).json({
          ok: false,
          error: "开单名称不能为空，该字段为必填项",
        });
      }

      let company = await Company.findOne(
        buildTenantQuery(req, { name: updateData.billing_name }),
      ).exec();
      if (!company) {
        await new Company(
          injectTenantId(req, { name: updateData.billing_name }),
        ).save();
      }
    }

    await Bill.findOneAndUpdate(
      buildTenantQuery(req, { _id: id }),
      updateData,
    ).exec();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};

// 批量更新提单
exports.updateBillsBatch = async (req, res) => {
  try {
    const { ids, field, value } = req.body;
    if (!ids || !ids.length || !field) {
      return res.status(400).json({ ok: false, error: "缺少必要参数" });
    }

    // 只允许更新安全的字段
    const allowedFields = [
      "bill_no",
      "billing_name",
      "brand_no",
      "contract_no",
      "sales_dep",
      "ship_warehouse",
      "size_type",
    ];
    if (!allowedFields.includes(field)) {
      return res
        .status(400)
        .json({ ok: false, error: `不允许批量更新字段: ${field}` });
    }

    const result = await Bill.updateMany(
      buildTenantQuery(req, { _id: { $in: ids } }),
      { $set: { [field]: value } },
    );

    res.json({ ok: true, count: result.modifiedCount });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};

const buildQuery = (node) => {
  if (node.logic) {
    if (!node.conditions || !Array.isArray(node.conditions)) return {};
    const conditions = node.conditions
      .map(buildQuery)
      .filter((c) => c && Object.keys(c).length > 0);

    if (conditions.length === 0) return {};
    return node.logic === "AND" ? { $and: conditions } : { $or: conditions };
  } else {
    // Condition node
    if (!node.field || !node.operator) return {};
    const { field, operator, value } = node;

    // Handle specific type conversions if necessary based on field
    // For now rely on Mongoose schema casting for numbers/dates

    switch (operator) {
      case "eq":
        return { [field]: value };
      case "neq":
        return { [field]: { $ne: value } };
      case "contains":
        return { [field]: { $regex: value, $options: "i" } };
      case "not_contains":
        return { [field]: { $not: { $regex: value, $options: "i" } } };
      case "gt":
        return { [field]: { $gt: Number(value) } };
      case "lt":
        return { [field]: { $lt: Number(value) } };
      case "gte":
        return { [field]: { $gte: Number(value) } };
      case "lte":
        return { [field]: { $lte: Number(value) } };
      case "is_empty":
        return { $or: [{ [field]: null }, { [field]: "" }] };
      case "is_not_empty":
        return { $and: [{ [field]: { $ne: null } }, { [field]: { $ne: "" } }] };
      default:
        return {};
    }
  }
};

exports.searchBills = async (req, res) => {
  try {
    const { queryTree, sort, page = 1, limit = 20 } = req.body;

    let baseQuery = {};
    if (queryTree) {
      baseQuery = buildQuery(queryTree);
    }
    const query = buildTenantQuery(req, baseQuery);

    const sortObj = {};
    if (sort && Array.isArray(sort)) {
      sort.forEach((s) => {
        sortObj[s.field] = s.order === "asc" ? 1 : -1;
      });
    }
    // Default sort if empty
    if (Object.keys(sortObj).length === 0) {
      sortObj.create_date = -1;
    }

    const count = await Bill.countDocuments(query);
    const bills = await Bill.find(query)
      .sort(sortObj)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    res.json({
      ok: true,
      data: bills,
      total: count,
      page: page,
      totalPages: Math.ceil(count / limit),
    });
  } catch (e) {
    console.error("searchBills error:", e);
    res.status(500).json({ ok: false, error: e.message });
  }
};

exports.exportBills = async (req, res) => {
  try {
    const { queryTree, sort, columns } = req.body;
    let baseQuery = {};
    if (queryTree) {
      baseQuery = buildQuery(queryTree);
    }
    const query = buildTenantQuery(req, baseQuery);

    const sortObj = {};
    if (sort && Array.isArray(sort)) {
      sort.forEach((s) => {
        sortObj[s.field] = s.order === "asc" ? 1 : -1;
      });
    } else {
      sortObj.create_date = -1;
    }

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=bills_export.csv",
    );

    const cursor = Bill.find(query).sort(sortObj).cursor();

    const transformer = (doc) => {
      const row = {};
      if (columns && Array.isArray(columns)) {
        columns.forEach((col) => {
          let val = doc[col.field];
          if (
            ["create_date", "shipping_date", "settle_date"].includes(col.field)
          ) {
            val = val ? new Date(val).toLocaleDateString() : "";
          }
          row[col.label] = val;
        });
      }
      return row;
    };

    cursor
      .pipe(fastcsv.format({ headers: true }).transform(transformer))
      .pipe(res);
  } catch (e) {
    console.error("exportBills error:", e);
    res.status(500).end();
  }
};

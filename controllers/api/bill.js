const Bill = require('../../models/Bill');
const Company = require('../../models/Company');
const Warehouse = require('../../models/Warehouse');
const Brand = require('../../models/Brand');
const utils = require('../../controllers/utils');
const fastcsv = require('fast-csv');

function pushArr(arr, elem) {
  if (elem && arr.indexOf(elem) < 0) {
    arr.push(elem);
  }
}

function isInteger(n) {
  return n === +n && n === (n | 0);
}

function isEmpty(variable) {
  return (typeof variable === 'undefined' || !variable || 0 === variable.length);
}

exports.getBills = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const query = {};

    // Filters
    if (req.query.billNo) {
      query.bill_no = { $regex: req.query.billNo, $options: 'i' };
    }
    if (req.query.orderNo) {
      query.order_no = req.query.orderNo; // Use exact match for performance
    }
    if (req.query.billingName) {
      query.billing_name = req.query.billingName;
    }
    if (req.query.brandNo) {
      query.brand_no = { $regex: req.query.brandNo, $options: 'i' };
    }
    if (req.query.contractNo) {
      query.contract_no = { $regex: req.query.contractNo, $options: 'i' };
    }
    if (req.query.status) {
      query.status = req.query.status;
    }
    if (req.query.leftNumOnly === 'true') {
      query.left_num = { $gt: 0 };
    }

    if (req.query.startTime || req.query.endTime) {
      query.create_date = {};
      if (req.query.startTime) {
        query.create_date.$gte = new Date(req.query.startTime);
      }
      if (req.query.endTime) {
        // Add 1 day to include the end date fully
        const end = new Date(req.query.endTime);
        end.setDate(end.getDate() + 1);
        query.create_date.$lt = end;
      }
    }

    const count = await Bill.countDocuments(query);
    const bills = await Bill.find(query)
      .sort({ create_date: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    res.json({
      ok: true,
      data: bills,
      total: count,
      page: page,
      totalPages: Math.ceil(count / limit)
    });
  } catch (error) {
    console.error('getBills error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

exports.getOrders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20; // 每页订单数
    const search = req.query.search || '';
    const billingName = req.query.billingName;

    // Default to last 2 years data for performance
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

    const matchStage = {
      left_num: { $gt: 0 },
      create_date: { $gte: twoYearsAgo }
    };

    if (billingName) {
      matchStage.billing_name = billingName;
    }
    if (search) {
      matchStage.$or = [
        { order_no: { $regex: search, $options: 'i' } },
        { bill_no: { $regex: search, $options: 'i' } }
      ];
    }

    // 使用聚合按订单号分组
    const pipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: '$order_no',
          bills: {
            $push: {
              _id: '$_id',
              bill_no: '$bill_no',
              order_item_no: '$order_item_no',
              left_num: '$left_num',
              block_num: '$block_num',
              weight: '$weight',
              thickness: '$thickness',
              width: '$width',
              len: '$len',
              ship_warehouse: '$ship_warehouse',
              contract_no: '$contract_no',
              brand_no: '$brand_no',
              total_weight: '$total_weight'
            }
          }
        }
      },
      { $sort: { _id: 1 } } // 按订单号排序
    ];

    // 获取总订单数
    const countResult = await Bill.aggregate([
      { $match: matchStage },
      { $group: { _id: '$order_no' } },
      { $count: 'total' }
    ]);
    const total = countResult.length > 0 ? countResult[0].total : 0;

    // 分页获取订单
    const orders = await Bill.aggregate([
      ...pipeline,
      { $skip: (page - 1) * limit },
      { $limit: limit }
    ]);

    // 格式化结果
    const formattedOrders = orders.map(order => ({
      order_no: order._id,
      bills: order.bills.sort((a, b) => {
        // 按 order_item_no 和 bill_no 排序
        const aItem = a.order_item_no || 0;
        const bItem = b.order_item_no || 0;
        if (aItem !== bItem) return aItem - bItem;
        return String(a.bill_no || '').localeCompare(String(b.bill_no || ''));
      })
    }));

    res.json({
      ok: true,
      data: formattedOrders,
      total: total,
      page: page,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error('getOrders error:', error);
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
      let order_combined = order_no + '-' + utils.leftPad(order_item_no, 3);

      let bill = await Bill.findOne({ order: order_combined, bill_no: bno }).exec();
      if (!bill) {
        bill = new Bill({
          order: order_combined, 
          bill_no: bno,
          order_no: order_no,
          order_item_no: order_item_no,
          billing_name: row_data.billingName || row_data.billing_name,
          sale_dep: row_data.saleDep || row_data.sale_dep,
          block_num: utils.getIntValue(row_data.blockNum || row_data.block_num),
          total_weight: utils.getFloatValue(row_data.totalWeight || row_data.total_weight, 3),

          warehouse: row_data.warehouse,
          ship_warehouse: row_data.shipWarehouse || row_data.ship_warehouse,
          contract_no: row_data.contractNo || row_data.contract_no,
          shipping_address: row_data.shippingAddress || row_data.shipping_address,
          product_type: row_data.productType || row_data.product_type,
          creater: req.user ? req.user.userid : 'admin',
          invoices: [],
          customer_price: 0,
          collection_price: 0
        });

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
          let temp = dimensions.replace(/≠/, "").split('*');
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

        // Size Type
        let sizeType = row_data.sizeType || row_data.size_type;
        if (isEmpty(sizeType) || sizeType == '双定尺') {
          bill.size_type = '定尺';
        } else if (sizeType === '单定尺') {
          bill.size_type = '单定';
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
                weight = utils.toFixedNumber(bill.len * bill.width * bill.thickness * 7.85 * Math.pow(10, -9), 3);
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
          bill.left_num = (bill.block_num > 0) ? bill.block_num : bill.total_weight;
          
          await bill.save();
          createdCount++;
        }
      } else {
        if (bill.status != '新建') {
          allocatedData.push(bill);
        }
      }

      pushArr(allBillName, bill.billing_name);
      pushArr(allWarehouse, bill.warehouse);
      pushArr(allWarehouse, bill.ship_warehouse);
    }

    // Update Dictionaries
    for (let w of allWarehouse) {
      if (!w) continue;
      let ware = await Warehouse.findOne({ name: w }).exec();
      if (!ware) {
        ware = new Warehouse({ name: w });
        await ware.save();
      }
    }
    for (let b of allBrandNo) {
      if (!b) continue;
      let brand = await Brand.findOne({ name: b }).exec();
      if (!brand) {
        brand = new Brand({ name: b });
        await brand.save();
      }
    }
    for (let bn of allBillName) {
      if (!bn) continue;
      let comp = await Company.findOne({ name: bn }).exec();
      if (!comp) {
        comp = new Company({ name: bn });
        await comp.save();
      }
    }

    res.json({ ok: true, count: createdCount, allocatedData });
  } catch (err) {
    console.error('createBills error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
};

exports.deleteBills = async (req, res) => {
  try {
    const ids = req.body;
    await Bill.deleteMany({ _id: { $in: ids } }).exec();
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

    if (updateData.billing_name) {
       let company = await Company.findOne({ name: updateData.billing_name }).exec();
       if (!company) {
         await new Company({ name: updateData.billing_name }).save();
       }
    }

    await Bill.findByIdAndUpdate(id, updateData).exec();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};

const buildQuery = (node) => {
  if (node.logic) {
    if (!node.conditions || !Array.isArray(node.conditions)) return {};
    const conditions = node.conditions
      .map(buildQuery)
      .filter(c => c && Object.keys(c).length > 0);
    
    if (conditions.length === 0) return {};
    return node.logic === 'AND' ? { $and: conditions } : { $or: conditions };
  } else {
    // Condition node
    if (!node.field || !node.operator) return {};
    const { field, operator, value } = node;
    
    // Handle specific type conversions if necessary based on field
    // For now rely on Mongoose schema casting for numbers/dates

    switch (operator) {
      case 'eq': return { [field]: value };
      case 'neq': return { [field]: { $ne: value } };
      case 'contains': return { [field]: { $regex: value, $options: 'i' } };
      case 'not_contains': return { [field]: { $not: { $regex: value, $options: 'i' } } };
      case 'gt': return { [field]: { $gt: Number(value) } };
      case 'lt': return { [field]: { $lt: Number(value) } };
      case 'gte': return { [field]: { $gte: Number(value) } };
      case 'lte': return { [field]: { $lte: Number(value) } };
      case 'is_empty': return { $or: [{ [field]: null }, { [field]: '' }] };
      case 'is_not_empty': return { $and: [{ [field]: { $ne: null } }, { [field]: { $ne: '' } }] };
      default: return {};
    }
  }
};

exports.searchBills = async (req, res) => {
  try {
    const { queryTree, sort, page = 1, limit = 20 } = req.body;
    
    let query = {};
    if (queryTree) {
      query = buildQuery(queryTree);
    }

    const sortObj = {};
    if (sort && Array.isArray(sort)) {
      sort.forEach(s => {
        sortObj[s.field] = s.order === 'asc' ? 1 : -1;
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
      totalPages: Math.ceil(count / limit)
    });
  } catch (e) {
    console.error('searchBills error:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
};

exports.exportBills = async (req, res) => {
  try {
    const { queryTree, sort, columns } = req.body;
    let query = {};
    if (queryTree) {
      query = buildQuery(queryTree);
    }
    
    const sortObj = {};
    if (sort && Array.isArray(sort)) {
      sort.forEach(s => {
        sortObj[s.field] = s.order === 'asc' ? 1 : -1;
      });
    } else {
      sortObj.create_date = -1;
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=bills_export.csv');

    const cursor = Bill.find(query).sort(sortObj).cursor();
    
    const transformer = (doc) => {
      const row = {};
      if (columns && Array.isArray(columns)) {
        columns.forEach(col => {
          let val = doc[col.field];
          if (['create_date', 'shipping_date', 'settle_date'].includes(col.field)) {
             val = val ? new Date(val).toLocaleDateString() : '';
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
    console.error('exportBills error:', e);
    res.status(500).end();
  }
};

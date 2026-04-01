const Invoice = require("../../models/Invoice");
const Bill = require("../../models/Bill");
const Vehicle = require("../../models/Vehicle");
const ReceiptImage = require("../../models/ReceiptImage");
const fs = require("fs");
const path = require("path");
const utils = require("../utils");
const { uploadReceiptImages } = require("../../config/multer");
const { buildTenantQuery, injectTenantId } = require("../../utils/tenant");
const Tenant = require("../../models/Tenant");
const receiptStorage = require("../../utils/receipt-storage");
const secrets = require("../../config/secrets");

// 查询车船结算运单（优化版：使用聚合管道，避免 populate）
exports.getInvoiceSettleVessel = async (req, res) => {
  try {
    const {
      fVeh,
      fContact,
      fName,
      fDest,
      fOrigin,
      fDate1,
      fDate2,
      fSettledState,
      fReceipt,
      fAmount,
      fWeight,
      selfOwned,
    } = req.query;

    const page = parseInt(req.query.page) || 0;
    const pageSize = parseInt(req.query.pageSize) || 50;

    // 第一步：匹配条件（租户过滤必须在最前面）
    const matchStage = { state: { $ne: "新建" } };

    // 租户过滤
    if (req.tenantId) {
      matchStage.tenantId = req.tenantId;
    }

    if (fVeh)
      matchStage.$or = [
        { vehicle_vessel_name: fVeh },
        { "bills.vehicles.veh_name": fVeh },
      ];
    if (fName) matchStage.ship_name = fName;
    if (fOrigin) matchStage.ship_from = fOrigin;
    if (fDest) matchStage.ship_to = fDest;

    // 日期过滤：统一使用发货日期，结算状态仅作为额外筛选条件
    if (fDate1 && fDate2) {
      matchStage.ship_date = {
        $gte: utils.parseLocalDate(fDate1),
        $lte: utils.parseLocalDateEnd(fDate2),
      };
    }

    if (fSettledState && fSettledState !== "全部") {
      // 同时匹配船运主记录的状态 和 车运子行的状态
      // 例如：船已付款但车运子行仅已结算时，按"已结算"筛选也应返回该记录
      const settleOr = [
        { vessel_settle_state: fSettledState },
        { "inner_settle.state": fSettledState },
      ];
      if (matchStage.$or) {
        // 已有 $or（如车辆筛选），用 $and 合并
        const existingOr = matchStage.$or;
        delete matchStage.$or;
        if (!matchStage.$and) matchStage.$and = [];
        matchStage.$and.push({ $or: existingOr }, { $or: settleOr });
      } else {
        matchStage.$or = settleOr;
      }
    }
    if (fReceipt != null && fReceipt != 2)
      matchStage.receipt = parseInt(fReceipt);
    if (fAmount) matchStage.vessel_price = parseFloat(fAmount);
    if (fWeight) matchStage.total_weight = parseFloat(fWeight);

    // 自有车过滤
    if (selfOwned === "1" || selfOwned === 1) {
      matchStage.selfOwned = 1;
    } else if (selfOwned === "0" || selfOwned === 0) {
      matchStage.selfOwned = { $ne: 1 };
    } else if (secrets.enableSelfVehicle) {
      // ENABLE_SELF_VEHICLE=true 时，未指定 selfOwned 参数默认排除自有车
      matchStage.selfOwned = { $ne: 1 };
    }

    // $lookup + $addFields + $project 阶段（复用）
    const lookupStages = [
      {
        $lookup: {
          from: "bills",
          localField: "bills.bill_id",
          foreignField: "_id",
          as: "billDetails",
        },
      },
      {
        $addFields: {
          bills: {
            $map: {
              input: "$bills",
              as: "bill",
              in: {
                $mergeObjects: [
                  "$$bill",
                  {
                    $arrayElemAt: [
                      {
                        $filter: {
                          input: "$billDetails",
                          cond: { $eq: ["$$this._id", "$$bill.bill_id"] },
                        },
                      },
                      0,
                    ],
                  },
                ],
              },
            },
          },
        },
      },
      { $project: { billDetails: 0 } },
    ];

    let invs;
    let totalCount = 0;
    let summaryRecords = null;

    const matchAndSort = [
      { $match: matchStage },
      { $sort: { ship_date: -1 } },
    ];

    if (page > 0) {
      // 分页模式：3 个独立查询并行执行，避免 $facet 单文档超 16MB 限制
      const skip = (page - 1) * pageSize;

      const [pageResult, countResult, summaryResult] = await Promise.all([
        // 1. 当前页数据（带 $lookup）
        Invoice.aggregate([
          ...matchAndSort,
          { $skip: skip },
          { $limit: pageSize },
          ...lookupStages,
        ]).exec(),
        // 2. 总记录数
        Invoice.aggregate([
          { $match: matchStage },
          { $count: "totalCount" },
        ]).exec(),
        // 3. 轻量汇总数据：不做 $lookup，只取汇总需要的字段
        Invoice.aggregate([
          ...matchAndSort,
          { $project: {
            total_weight: 1,
            vessel_price: 1,
            charge_cash: 1,
            charge_oil: 1,
            vessel_settle_state: 1,
            receipt: 1,
            vehicle_vessel_name: 1,
            ship_customer: 1,
            ship_name: 1,
            ship_from: 1,
            ship_to: 1,
            waybill_no: 1,
            "bills.vehicles.veh_name": 1,
            "bills.vehicles.send_weight": 1,
            "bills.vehicles.send_num": 1,
            "bills.vehicles.veh_price": 1,
            "bills.vehicles.inner_waybill_no": 1,
            "bills.vehicles.veh_ship_from": 1,
            inner_settle: 1,
          }},
        ]).exec(),
      ]);

      invs = pageResult;
      totalCount = countResult[0]?.totalCount || 0;
      summaryRecords = summaryResult;

      console.log("[getInvoiceSettleVessel] Page", page, "of", Math.ceil(totalCount / pageSize), "- showing", invs.length, "of", totalCount, "invoices");
    } else {
      // 全量模式
      invs = await Invoice.aggregate([
        ...matchAndSort,
        ...lookupStages,
      ]).exec();
      console.log("[getInvoiceSettleVessel] Found", invs.length, "invoices");
    }

    // 构建 vehPersonMap (只查询结果集中出现的车辆)
    // 分页模式下需要从 summaryRecords 收集所有车辆，从 invs 收集当前页的运单号
    const vehSet = new Set();
    const allWaybillNos = [];

    // 从当前页数据收集运单号（用于回执图片查询）和车辆
    invs.forEach((inv) => {
      if (inv.vehicle_vessel_name) vehSet.add(inv.vehicle_vessel_name);
      allWaybillNos.push(inv.waybill_no);
      if (inv.bills && inv.bills.length > 0) {
        inv.bills.forEach((bill) => {
          if (bill.vehicles && bill.vehicles.length > 0) {
            bill.vehicles.forEach((veh) => {
              if (veh.veh_name) vehSet.add(veh.veh_name);
              if (veh.inner_waybill_no) allWaybillNos.push(veh.inner_waybill_no);
            });
          }
        });
      }
    });

    // 分页模式下，从 summaryRecords 也收集车辆（用于承运单位筛选）
    if (summaryRecords) {
      summaryRecords.forEach((inv) => {
        if (inv.vehicle_vessel_name) vehSet.add(inv.vehicle_vessel_name);
        if (inv.bills && inv.bills.length > 0) {
          inv.bills.forEach((bill) => {
            if (bill.vehicles && bill.vehicles.length > 0) {
              bill.vehicles.forEach((veh) => {
                if (veh.veh_name) vehSet.add(veh.veh_name);
              });
            }
          });
        }
      });
    }

    // 并行查询车辆信息和回执图片
    const vehQuery = vehSet.size > 0
      ? { name: { $in: Array.from(vehSet) } }
      : null;
    if (vehQuery && req.tenantId) vehQuery.tenantId = req.tenantId;

    const imgQuery = allWaybillNos.length > 0
      ? { waybill_no: { $in: allWaybillNos } }
      : null;
    if (imgQuery && req.tenantId) imgQuery.tenantId = req.tenantId;

    const [vehs, imageWaybills] = await Promise.all([
      vehQuery
        ? Vehicle.find(vehQuery).select("name boss real_boss veh_category").lean().exec()
        : [],
      imgQuery
        ? ReceiptImage.distinct("waybill_no", imgQuery)
        : [],
    ]);

    const vehPersonMap = {};
    const vehCategoryMap = {};
    vehs.forEach(function (veh) {
      if (veh.boss && (veh.boss.includes(",") || veh.boss.includes("，"))) {
        vehPersonMap[veh.name] = { boss: veh.boss, real_boss: veh.real_boss };
      } else if (veh.boss) {
        vehPersonMap[veh.name] = veh.boss;
      }
      if (veh.veh_category) {
        vehCategoryMap[veh.name] = veh.veh_category;
      }
    });

    const responseData = { ok: true, invs, vehPersonMap, vehCategoryMap, imageWaybills };
    if (page > 0) {
      responseData.totalCount = totalCount;
      responseData.summaryRecords = summaryRecords;
    }

    res.json(responseData);
  } catch (error) {
    console.error("查询失败:", error);
    res.status(500).json({ ok: false, message: "查询失败" });
  }
};

// 更新价格
exports.updateVesselPrice = async (req, res) => {
  try {
    const { wnoList, priceData } = req.body;
    const invQuery = buildTenantQuery(req, { waybill_no: { $in: wnoList } });
    const invoices = await Invoice.find(invQuery).exec();

    // 收集需要同步到 Bill 的内部车辆价格变更: { billId -> { innerWaybillNo -> price } }
    const billSyncMap = new Map();

    for (const pd of priceData) {
      const invoice = invoices.find(
        (inv) =>
          inv.waybill_no === pd.wno ||
          inv.waybill_no === pd.wno.substring(0, 17),
      );
      if (!invoice) continue;

      if (pd.inner === 0) {
        invoice.vessel_price = pd.unitPrice;
        invoice.price_remark = pd.remark;
        // 收集需要同步 veh_ves_price 的 Bill
        invoice.bills.forEach((bill) => {
          if (!bill.bill_id) return;
          const billIdStr = String(bill.bill_id);
          if (!billSyncMap.has(billIdStr)) billSyncMap.set(billIdStr, new Map());
          billSyncMap.get(billIdStr).set(`main:${invoice.waybill_no}`, {
            invNo: invoice.waybill_no,
            vehVesPrice: pd.unitPrice,
          });
        });
      } else {
        invoice.bills.forEach((bill) => {
          bill.vehicles.forEach((veh) => {
            if (veh.inner_waybill_no === pd.wno) {
              veh.veh_price = pd.unitPrice;
              veh.price_remark = pd.remark;
              // 记录需要同步到 Bill 的变更
              const billIdStr = String(bill.bill_id);
              if (!billSyncMap.has(billIdStr)) billSyncMap.set(billIdStr, new Map());
              billSyncMap.get(billIdStr).set(pd.wno, { price: pd.unitPrice, invNo: invoice.waybill_no });
            }
          });
        });
      }
      await invoice.save();
    }

    // 同步 Bill 侧的 veh_ves_price 和 veh_price
    for (const [billIdStr, syncEntries] of billSyncMap) {
      const dbBill = await Bill.findById(billIdStr).exec();
      if (!dbBill) continue;
      let modified = false;
      for (const invRecord of dbBill.invoices || []) {
        // 同步主运单的 veh_ves_price
        const mainSync = syncEntries.get(`main:${invRecord.inv_no}`);
        if (mainSync) {
          invRecord.veh_ves_price = mainSync.vehVesPrice;
          modified = true;
        }
        // 同步内部车辆的 veh_price
        for (const bVeh of invRecord.vehicles || []) {
          const vehSync = syncEntries.get(bVeh.inner_waybill_no);
          if (vehSync && invRecord.inv_no === vehSync.invNo) {
            bVeh.veh_price = vehSync.price;
            modified = true;
          }
        }
      }
      if (modified) {
        dbBill.markModified('invoices');
        await dbBill.save();
      }
    }

    res.json({ ok: true });
  } catch (error) {
    console.error("更新价格失败:", error);
    res.status(500).json({ ok: false, message: "更新价格失败" });
  }
};

// 结算/取消结算
exports.settleVessel = async (req, res) => {
  try {
    const { allSelectedInvNo, allInvNoFromInner, allInnerNo, settle } =
      req.body;
    const date = settle ? new Date() : null;
    const state = settle ? "已结算" : "未结算";

    if (allSelectedInvNo?.length > 0) {
      const updateQuery = buildTenantQuery(req, {
        waybill_no: { $in: allSelectedInvNo },
      });
      await Invoice.updateMany(updateQuery, {
        $set: { vessel_settle_state: state, vessel_settle_date: date },
      }).exec();
    }

    if (allInvNoFromInner?.length > 0) {
      const innerQuery = buildTenantQuery(req, {
        waybill_no: { $in: allInvNoFromInner },
      });
      const invoices = await Invoice.find(innerQuery).exec();
      for (const invoice of invoices) {
        if (!invoice.inner_settle) invoice.inner_settle = [];
        allInnerNo.forEach((innerNo) => {
          let innerSettle = invoice.inner_settle.find(
            (is) => is.inner_waybill_no === innerNo,
          );
          if (!innerSettle) {
            innerSettle = {
              inner_waybill_no: innerNo,
              state: "未结算",
              date: null,
            };
            invoice.inner_settle.push(innerSettle);
          }
          if (innerNo.substring(0, 17) === invoice.waybill_no) {
            innerSettle.state = state;
            innerSettle.date = date;
          }
        });
        invoice.markModified('inner_settle');
        await invoice.save();
      }
    }

    res.json({ ok: true });
  } catch (error) {
    console.error("结算失败:", error);
    res.status(500).json({ ok: false, message: "结算失败" });
  }
};

// 付款/取消付款
exports.settleVesselPay = async (req, res) => {
  try {
    const { allPayInvNo, allInvNoFromInner, allInnerNo, forPay, ticketNo } =
      req.body;
    const date = forPay ? new Date() : null;
    const state = forPay ? "已付款" : "已结算";

    if (allPayInvNo?.length > 0) {
      const payQuery = buildTenantQuery(req, {
        waybill_no: { $in: allPayInvNo },
      });
      const updateData = { vessel_settle_state: state, pay_date: date };
      if (forPay && ticketNo) {
        updateData.ticket_no = ticketNo;
      }
      await Invoice.updateMany(payQuery, { $set: updateData }).exec();
    }

    if (allInvNoFromInner?.length > 0) {
      const innerPayQuery = buildTenantQuery(req, {
        waybill_no: { $in: allInvNoFromInner },
      });
      const invoices = await Invoice.find(innerPayQuery).exec();
      for (const invoice of invoices) {
        allInnerNo.forEach((innerNo) => {
          const innerSettle = invoice.inner_settle?.find(
            (is) => is.inner_waybill_no === innerNo,
          );
          if (innerSettle && innerNo.substring(0, 17) === invoice.waybill_no) {
            innerSettle.state = state;
            innerSettle.pay_date = date;
            if (forPay && ticketNo) {
              innerSettle.ticket_no = ticketNo;
            }
          }
        });
        invoice.markModified('inner_settle');
        await invoice.save();
      }
    }

    res.json({ ok: true });
  } catch (error) {
    console.error("付款失败:", error);
    res.status(500).json({ ok: false, message: "付款失败" });
  }
};

// 更新卸船/滞留信息
exports.updateVesselDelayInfo = async (req, res) => {
  try {
    const { unshipData, wnoList, partInd } = req.body;

    for (const wno of wnoList) {
      const waybillNo = wno.substring(0, 17);
      const invQ = buildTenantQuery(req, { waybill_no: waybillNo });
      const invoice = await Invoice.findOne(invQ).exec();
      if (!invoice) continue;

      if (wno.length > 17) {
        if (!invoice.inner_settle) invoice.inner_settle = [];
        let innerSettle = invoice.inner_settle.find(
          (is) => is.inner_waybill_no === wno,
        );
        if (!innerSettle) {
          innerSettle = { inner_waybill_no: wno, state: "未结算", date: null };
          invoice.inner_settle.push(innerSettle);
        }

        if (partInd === 0) Object.assign(innerSettle, unshipData);
        else if (partInd === 1) {
          innerSettle.charge_cash = unshipData.charge_cash;
          innerSettle.charge_oil = unshipData.charge_oil;
        } else if (partInd === 2) innerSettle.receipt = unshipData.receipt;
        else if (partInd === 3) innerSettle.remark = unshipData.remark;
        invoice.markModified('inner_settle');
      } else {
        if (partInd === 0) Object.assign(invoice, unshipData);
        else if (partInd === 1) {
          invoice.charge_cash = unshipData.charge_cash;
          invoice.charge_oil = unshipData.charge_oil;
        } else if (partInd === 2) invoice.receipt = unshipData.receipt;
        else if (partInd === 3) invoice.remark = unshipData.remark;
      }

      await invoice.save();
    }

    res.json({ ok: true });
  } catch (error) {
    console.error("更新失败:", error);
    res.status(500).json({ ok: false, message: "更新失败" });
  }
};

// 标记不需要结算
exports.settleVesselNotNeeded = async (req, res) => {
  try {
    const { wayNoList, notNeeded } = req.body;

    // 收集需要同步到 Bill 的变更
    const billSyncMap = new Map();

    for (const wno of wayNoList) {
      const waybillNo = wno.substring(0, 17);
      const invQ = buildTenantQuery(req, { waybill_no: waybillNo });
      const invoice = await Invoice.findOne(invQ).exec();
      if (!invoice) continue;

      if (wno.length > 17) {
        const newPrice = notNeeded ? -1 : 0;
        invoice.bills.forEach((bill) => {
          bill.vehicles.forEach((veh) => {
            if (veh.inner_waybill_no === wno) {
              veh.veh_price = newPrice;
              // 记录同步到 Bill
              const billIdStr = String(bill.bill_id);
              if (!billSyncMap.has(billIdStr)) billSyncMap.set(billIdStr, new Map());
              billSyncMap.get(billIdStr).set(wno, { price: newPrice, invNo: waybillNo });
            }
          });
        });

        if (!invoice.inner_settle) invoice.inner_settle = [];
        let innerSettle = invoice.inner_settle.find(
          (is) => is.inner_waybill_no === wno,
        );
        if (!innerSettle) {
          innerSettle = { inner_waybill_no: wno, state: "未结算", date: null };
          invoice.inner_settle.push(innerSettle);
        }

        if (notNeeded) {
          innerSettle.state = "不需要结算";
          innerSettle.date = new Date();
        } else {
          innerSettle.state = "未结算";
          innerSettle.date = null;
        }
        invoice.markModified('inner_settle');
      } else {
        const newPrice = notNeeded ? -1 : 0;
        if (notNeeded) {
          invoice.vessel_price = -1;
          invoice.vessel_settle_state = "不需要结算";
          invoice.vessel_settle_date = new Date();
        } else {
          invoice.vessel_price = 0;
          invoice.vessel_settle_state = "未结算";
          invoice.vessel_settle_date = null;
        }
        // 收集需要同步 veh_ves_price 的 Bill
        invoice.bills.forEach((bill) => {
          if (!bill.bill_id) return;
          const billIdStr = String(bill.bill_id);
          if (!billSyncMap.has(billIdStr)) billSyncMap.set(billIdStr, new Map());
          billSyncMap.get(billIdStr).set(`main:${invoice.waybill_no}`, {
            invNo: invoice.waybill_no,
            vehVesPrice: newPrice,
          });
        });
      }

      await invoice.save();
    }

    // 同步 Bill 侧的 veh_ves_price 和 veh_price
    for (const [billIdStr, syncEntries] of billSyncMap) {
      const dbBill = await Bill.findById(billIdStr).exec();
      if (!dbBill) continue;
      let modified = false;
      for (const invRecord of dbBill.invoices || []) {
        // 同步主运单的 veh_ves_price
        const mainSync = syncEntries.get(`main:${invRecord.inv_no}`);
        if (mainSync) {
          invRecord.veh_ves_price = mainSync.vehVesPrice;
          modified = true;
        }
        // 同步内部车辆的 veh_price
        for (const bVeh of invRecord.vehicles || []) {
          const vehSync = syncEntries.get(bVeh.inner_waybill_no);
          if (vehSync && invRecord.inv_no === vehSync.invNo) {
            bVeh.veh_price = vehSync.price;
            modified = true;
          }
        }
      }
      if (modified) {
        dbBill.markModified('invoices');
        await dbBill.save();
      }
    }

    res.json({ ok: true });
  } catch (error) {
    console.error("操作失败:", error);
    res.status(500).json({ ok: false, message: "操作失败" });
  }
};

// 更新承运单位
exports.postCarrierDepartment = async (req, res) => {
  try {
    const { vehName, wno, boss } = req.body;
    const vehQ = buildTenantQuery(req, { name: vehName });
    const vehicle = await Vehicle.findOne(vehQ).exec();
    if (!vehicle)
      return res.status(404).json({ ok: false, message: "车辆不存在" });

    if (!vehicle.real_boss) vehicle.real_boss = [];
    const existingIndex = vehicle.real_boss.findIndex(
      (rb) => rb.waybill_no === wno,
    );
    if (existingIndex >= 0) vehicle.real_boss[existingIndex].rb = boss;
    else vehicle.real_boss.push({ waybill_no: wno, rb: boss });

    await vehicle.save();
    res.json({
      ok: true,
      data: {
        name: vehicle.name,
        boss: vehicle.boss,
        real_boss: vehicle.real_boss,
      },
    });
  } catch (error) {
    console.error("更新失败:", error);
    res.status(500).json({ ok: false, message: "更新失败" });
  }
};

// 上传回执图片
// 上传回执图片（支持多图片）
exports.uploadReceiptImg = [
  uploadReceiptImages,
  async (req, res) => {
    try {
      const inv_no = req.body.inv_no;
      if (!inv_no) {
        return res.status(400).json({ ok: false, message: "缺少运单号" });
      }

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ ok: false, message: "没有上传文件" });
      }

      // 获取上传人信息（从session或body中）
      const uploader = req.user?.userid || req.body.uploader || "unknown";

      // 验证运单是否存在
      const waybillNo = inv_no.substring(0, 17);
      const invQ = buildTenantQuery(req, { waybill_no: waybillNo });
      const invoice = await Invoice.findOne(invQ).exec();
      if (!invoice) {
        // 删除已上传的文件
        req.files.forEach((file) => {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        });
        return res.status(404).json({ ok: false, message: "运单不存在" });
      }

      // 获取租户存储配置
      const tenant = await Tenant.findById(req.tenantId).lean();
      const storageType = tenant?.settings?.receiptStorage || 'local';
      const tenantId = String(req.tenantId || 'default');

      // 重命名文件以包含运单号，并保存到存储后端
      const savedImages = [];
      for (const file of req.files) {
        // 获取原始文件路径和目录
        const oldPath = file.path;
        const dir = path.dirname(oldPath);
        const ext = path.extname(file.filename);

        // 生成新文件名：运单号_时间戳_随机数.扩展名
        const timestamp = new Date()
          .toISOString()
          .replace(/:/g, "-")
          .replace(/\..+/, "");
        const randomStr = Math.random().toString(36).substring(2, 8);
        const newFilename = `${inv_no}_${timestamp}_${randomStr}${ext}`;
        const newPath = path.join(dir, newFilename);

        // 重命名文件（multer 临时文件 → 带运单号的文件名）
        fs.renameSync(oldPath, newPath);

        // 保存到存储后端（local 保持原位，minio 上传后删除本地文件）
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const relativePath = `${year}/${month}/${day}/${newFilename}`;
        const finalPath = await receiptStorage.saveFile(storageType, tenantId, relativePath, newPath);

        // 确保 original_filename 正确处理 UTF-8 编码
        const originalFilename = Buffer.from(
          file.originalname,
          "latin1",
        ).toString("utf8");

        const receiptData = injectTenantId(req, {
          waybill_no: inv_no,
          uploader: uploader,
          upload_time: new Date(),
          file_path: finalPath,
          original_filename: originalFilename,
          file_size: file.size,
          mime_type: file.mimetype,
        });
        const receiptImage = new ReceiptImage(receiptData);

        await receiptImage.save();
        savedImages.push(receiptImage);
      }

      // 更新运单的回执状态
      if (inv_no.length > 17) {
        // 内部运单
        if (!invoice.inner_settle) invoice.inner_settle = [];
        let innerSettle = invoice.inner_settle.find(
          (is) => is.inner_waybill_no === inv_no,
        );
        if (!innerSettle) {
          innerSettle = {
            inner_waybill_no: inv_no,
            state: "未结算",
            date: null,
            receipt: 0,
          };
          invoice.inner_settle.push(innerSettle);
        }
        innerSettle.receipt = 1;
        invoice.markModified('inner_settle');
      } else {
        // 主运单
        invoice.receipt = 1;
      }

      await invoice.save();

      res.json({
        ok: true,
        message: `成功上传 ${savedImages.length} 张图片`,
        images: savedImages.map((img) => ({
          id: img._id,
          filename: path.basename(img.file_path),
          size: img.file_size,
          upload_time: img.upload_time,
        })),
      });
    } catch (error) {
      console.error("上传失败:", error);

      // 如果出错，清理已上传的文件（包括已重命名的文件）
      if (req.files) {
        req.files.forEach((file) => {
          // 尝试删除原始文件
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
          // 尝试删除可能已重命名的文件
          const dir = path.dirname(file.path);
          const pattern = new RegExp(
            `^${inv_no || "temp"}_.*${path.extname(file.filename)}$`,
          );
          try {
            const files = fs.readdirSync(dir);
            files.forEach((f) => {
              if (pattern.test(f)) {
                const fullPath = path.join(dir, f);
                if (fs.existsSync(fullPath)) {
                  fs.unlinkSync(fullPath);
                }
              }
            });
          } catch (cleanupError) {
            console.error("清理文件失败:", cleanupError);
          }
        });
      }

      res.status(500).json({
        ok: false,
        message: error.message || "上传失败",
      });
    }
  },
];

// 获取回执图片
exports.getReceiptImg = async (req, res) => {
  try {
    const wno = req.query.q;
    if (!wno) return res.status(400).json({ ok: false, message: "缺少运单号" });

    const waybillNo = wno.substring(0, 17);
    const invQ = buildTenantQuery(req, { waybill_no: waybillNo });
    const invoice = await Invoice.findOne(invQ).lean().exec();
    if (!invoice)
      return res.status(404).json({ ok: false, message: "运单不存在" });

    let receiptImage = null;
    if (wno.length > 17) {
      const innerSettle = invoice.inner_settle?.find(
        (is) => is.inner_waybill_no === wno,
      );
      receiptImage = innerSettle?.receipt_image;
    } else {
      receiptImage = invoice.receipt_image;
    }

    if (!receiptImage)
      return res.status(404).json({ ok: false, message: "回执图片不存在" });

    // 兼容旧格式（相对路径）和新格式（绝对路径/minio://）
    const filePath = receiptImage.startsWith('minio://') || path.isAbsolute(receiptImage)
      ? receiptImage
      : path.join(__dirname, "../../uploads/receipts", receiptImage);

    try {
      const imageData = await receiptStorage.getFile(filePath);
      const base64Data = imageData.toString("base64");

      const ext = path.extname(receiptImage).toLowerCase();
      let contentType = "image/jpeg";
      if (ext === ".png") contentType = "image/png";
      else if (ext === ".gif") contentType = "image/gif";

      res.json({ ok: true, contentType, data: base64Data });
    } catch (fileErr) {
      return res.status(404).json({ ok: false, message: "图片文件不存在" });
    }
  } catch (error) {
    console.error("获取失败:", error);
    res.status(500).json({ ok: false, message: "获取失败" });
  }
};

// 获取运单的所有回执图片列表
exports.getReceiptImagesList = async (req, res) => {
  try {
    const wno = req.query.q;
    if (!wno) {
      return res.status(400).json({ ok: false, message: "缺少运单号" });
    }

    // 从数据库查询该运单的所有回执图片
    const imgQuery = buildTenantQuery(req, { waybill_no: wno });
    const images = await ReceiptImage.find(imgQuery)
      .sort({ upload_time: -1 }) // 按上传时间倒序
      .lean()
      .exec();

    // 返回图片列表（不包含实际图片数据，只返回元数据）
    const imageList = images.map((img) => ({
      id: img._id,
      filename: path.basename(img.file_path),
      original_filename: img.original_filename,
      file_size: img.file_size,
      mime_type: img.mime_type,
      uploader: img.uploader,
      upload_time: img.upload_time,
    }));

    res.json({
      ok: true,
      images: imageList,
      total: imageList.length,
    });
  } catch (error) {
    console.error("获取图片列表失败:", error);
    res.status(500).json({ ok: false, message: "获取图片列表失败" });
  }
};

// 批量获取回执图片列表（用于本地目录批量下载）
exports.getReceiptDownloadItems = async (req, res) => {
  try {
    const targets = Array.isArray(req.body?.targets) ? req.body.targets : [];
    const normalizedTargets = Array.from(
      new Set(
        targets
          .map((item) => (typeof item === "string" ? item.trim() : ""))
          .filter(Boolean),
      ),
    );

    if (normalizedTargets.length === 0) {
      return res.status(400).json({ ok: false, message: "缺少回执运单号" });
    }

    const imgQuery = buildTenantQuery(req, {
      waybill_no: { $in: normalizedTargets },
    });
    const images = await ReceiptImage.find(imgQuery)
      .sort({ upload_time: 1, _id: 1 })
      .lean()
      .exec();

    const groupedMap = new Map();
    images.forEach((img) => {
      const key = img.waybill_no;
      if (!groupedMap.has(key)) groupedMap.set(key, []);
      groupedMap.get(key).push({
        id: String(img._id),
        filename: path.basename(img.file_path),
        original_filename: img.original_filename,
        file_size: img.file_size,
        mime_type: img.mime_type,
        uploader: img.uploader,
        upload_time: img.upload_time,
      });
    });

    const items = normalizedTargets.map((waybillNo) => ({
      waybill_no: waybillNo,
      images: groupedMap.get(waybillNo) || [],
    }));

    res.json({
      ok: true,
      items,
      total: images.length,
    });
  } catch (error) {
    console.error("批量获取回执图片列表失败:", error);
    res.status(500).json({ ok: false, message: "批量获取回执图片列表失败" });
  }
};

// 获取单张回执图片（通过图片ID）
exports.getReceiptImageById = async (req, res) => {
  try {
    const imageId = req.query.id;
    if (!imageId) {
      return res.status(400).json({ ok: false, message: "缺少图片ID" });
    }

    const imgByIdQuery = buildTenantQuery(req, { _id: imageId });
    const image = await ReceiptImage.findOne(imgByIdQuery).lean().exec();
    if (!image) {
      return res.status(404).json({ ok: false, message: "图片记录不存在" });
    }

    try {
      const imageData = await receiptStorage.getFile(image.file_path);
      const base64Data = imageData.toString("base64");

      res.json({
        ok: true,
        contentType: image.mime_type,
        data: base64Data,
        filename: image.original_filename,
      });
    } catch (fileErr) {
      return res.status(404).json({ ok: false, message: "图片文件不存在" });
    }
  } catch (error) {
    console.error("获取图片失败:", error);
    res.status(500).json({ ok: false, message: "获取图片失败" });
  }
};

// 流式返回回执图片（浏览器直接加载，支持 HTTP 缓存）
exports.streamReceiptImage = async (req, res) => {
  try {
    const imageId = req.params.id;
    if (!imageId) {
      return res.status(400).json({ ok: false, message: "缺少图片ID" });
    }

    const imgQuery = buildTenantQuery(req, { _id: imageId });
    const image = await ReceiptImage.findOne(imgQuery).lean().exec();
    if (!image) {
      return res.status(404).json({ ok: false, message: "图片记录不存在" });
    }

    try {
      const imageData = await receiptStorage.getFile(image.file_path);
      res.set("Content-Type", image.mime_type || "image/jpeg");
      res.set("Cache-Control", "private, max-age=86400");
      res.set("Content-Length", String(imageData.length));
      res.send(imageData);
    } catch (fileErr) {
      return res.status(404).json({ ok: false, message: "图片文件不存在" });
    }
  } catch (error) {
    console.error("获取图片失败:", error);
    res.status(500).json({ ok: false, message: "获取图片失败" });
  }
};

// 删除回执图片
exports.deleteReceiptImage = async (req, res) => {
  try {
    const imageId = req.query.id;
    if (!imageId) {
      return res.status(400).json({ ok: false, message: "缺少图片ID" });
    }

    const delImgQuery = buildTenantQuery(req, { _id: imageId });
    const image = await ReceiptImage.findOne(delImgQuery).exec();
    if (!image) {
      return res.status(404).json({ ok: false, message: "图片记录不存在" });
    }

    // 删除文件
    if (fs.existsSync(image.file_path)) {
      fs.unlinkSync(image.file_path);
    }

    // 删除数据库记录
    await ReceiptImage.deleteOne(delImgQuery).exec();

    // 回执状态与图片解耦，删除图片不再自动重置回执状态

    res.json({ ok: true, message: "删除成功" });
  } catch (error) {
    console.error("删除图片失败:", error);
    res.status(500).json({ ok: false, message: "删除图片失败" });
  }
};

// 获取运单详情
exports.getWaybill = async (req, res) => {
  try {
    const wno = req.query.q;
    if (!wno) return res.status(400).json({ ok: false, message: "缺少运单号" });

    const wbQuery = buildTenantQuery(req, { waybill_no: wno });
    const invoice = await Invoice.findOne(wbQuery).lean().exec();
    if (!invoice)
      return res.status(404).json({ ok: false, message: "运单不存在" });

    const billIds = invoice.bills.map((b) => b.bill_id);
    const billQ = buildTenantQuery(req, { _id: { $in: billIds } });
    const bills = await Bill.find(billQ).lean().exec();

    res.json({ bills, invoices: [invoice] });
  } catch (error) {
    console.error("获取失败:", error);
    res.status(500).json({ ok: false, message: "获取失败" });
  }
};

// 获取车船结算初始数据（优化版：使用聚合管道）
exports.getVesselInitialData = async (req, res) => {
  try {
    let selfOwned = false;
    if (req.query.selfOwned === "true" || req.query.selfOwned === "1") {
      selfOwned = true;
    }

    var baseQ = { state: { $ne: "新建" }, selfOwned: 1 };
    if (!selfOwned) {
      baseQ.selfOwned = { $ne: 1 };
    }

    // 构建基础匹配条件
    const matchStage = { ...baseQ };
    if (req.tenantId) {
      matchStage.tenantId = req.tenantId;
    }

    // 并行执行多个聚合查询，大幅提升性能
    const [
      nameListResult,
      destListResult,
      vehListResult,
      vehicleVehListResult,
    ] = await Promise.all([
      // 1. 获取去重的发货名称列表
      Invoice.aggregate([
        { $match: matchStage },
        { $group: { _id: "$ship_name" } },
        { $match: { _id: { $ne: null } } },
        { $project: { name: "$_id", _id: 0 } },
      ]),

      // 2. 获取去重的目的地列表
      Invoice.aggregate([
        { $match: matchStage },
        { $group: { _id: "$ship_to" } },
        { $match: { _id: { $ne: null } } },
        { $project: { name: "$_id", _id: 0 } },
      ]),

      // 3. 获取去重的车船号列表（主运单级别）
      Invoice.aggregate([
        { $match: matchStage },
        { $group: { _id: "$vehicle_vessel_name" } },
        { $match: { _id: { $ne: null } } },
        { $project: { name: "$_id", _id: 0 } },
      ]),

      // 4. 获取去重的车船号列表（bills.vehicles 级别）
      Invoice.aggregate([
        { $match: matchStage },
        { $unwind: { path: "$bills", preserveNullAndEmptyArrays: false } },
        {
          $unwind: {
            path: "$bills.vehicles",
            preserveNullAndEmptyArrays: false,
          },
        },
        { $group: { _id: "$bills.vehicles.veh_name" } },
        { $match: { _id: { $ne: null } } },
        { $project: { name: "$_id", _id: 0 } },
      ]),
    ]);

    // 合并车船号列表（主运单 + bills.vehicles）
    const vehSet = new Set();
    vehListResult.forEach((item) => item.name && vehSet.add(item.name));
    vehicleVehListResult.forEach((item) => item.name && vehSet.add(item.name));
    const vehList = Array.from(vehSet);

    // 查询车辆信息（只查询在运单中出现的车辆）
    const vehPersonMap = {};
    const vehCategoryMap = {};
    const contactNameSet = new Set();

    if (vehList.length > 0) {
      const vehQuery = { name: { $in: vehList } };
      if (req.tenantId) {
        vehQuery.tenantId = req.tenantId;
      }

      const vehs = await Vehicle.find(vehQuery)
        .select("name boss real_boss veh_category")
        .lean()
        .exec();

      vehs.forEach(function (veh) {
        if (veh.boss && (veh.boss.includes(",") || veh.boss.includes("，"))) {
          const list = veh.boss.split(/,|，/);
          list.forEach(function (b) {
            const trimmed = b.trim();
            if (trimmed) contactNameSet.add(trimmed);
          });
          vehPersonMap[veh.name] = { boss: veh.boss, real_boss: veh.real_boss };
        } else if (veh.boss) {
          contactNameSet.add(veh.boss);
          vehPersonMap[veh.name] = veh.boss;
        }
        if (veh.veh_category) {
          vehCategoryMap[veh.name] = veh.veh_category;
        }
      });
    }

    // 提取并排序数据
    const nameList = nameListResult.map((item) => item.name).filter(Boolean);
    const destList = destListResult.map((item) => item.name).filter(Boolean);
    const contactNameList = Array.from(contactNameSet);

    // 拼音排序
    const sortedNameList = utils.pinyin_sort(nameList);
    const sortedVehList = utils.pinyin_sort(vehList);
    const sortedContactList = utils.pinyin_sort(contactNameList);

    const options = {
      vehicleList: sortedVehList,
      contactList: sortedContactList,
      nameList: sortedNameList,
      destList: destList,
      vehPersonMap: vehPersonMap,
      vehCategoryMap: vehCategoryMap,
    };

    res.json({ ok: true, options });
  } catch (error) {
    console.error("获取初始数据失败:", error);
    res.status(500).json({ ok: false, message: "获取初始数据失败" });
  }
};

// 独立切换回执状态
exports.toggleVesselReceipt = async (req, res) => {
  try {
    const { wno, receipt } = req.body;
    if (!wno || (receipt !== 0 && receipt !== 1)) {
      return res.status(400).json({ ok: false, message: "参数错误" });
    }

    const waybillNo = wno.substring(0, 17);
    const invQ = buildTenantQuery(req, { waybill_no: waybillNo });
    const invoice = await Invoice.findOne(invQ).exec();
    if (!invoice) {
      return res.status(404).json({ ok: false, message: "运单不存在" });
    }

    if (wno.length > 17) {
      // 内部运单
      if (!invoice.inner_settle) invoice.inner_settle = [];
      let innerSettle = invoice.inner_settle.find(
        (is) => is.inner_waybill_no === wno,
      );
      // 取消回执时，检查是否已结算或已付款
      if (receipt === 0 && innerSettle) {
        const state = innerSettle.state;
        if (state === "已结算" || state === "已付款") {
          return res.status(400).json({ ok: false, message: `该运单${state}，不能取消回执` });
        }
      }
      if (!innerSettle) {
        invoice.inner_settle.push({
          inner_waybill_no: wno,
          state: "未结算",
          date: null,
          receipt: receipt,
        });
      } else {
        innerSettle.receipt = receipt;
      }
      invoice.markModified('inner_settle');
    } else {
      // 主运单 - 取消回执时，检查是否已结算或已付款
      if (receipt === 0) {
        const state = invoice.vessel_settle_state;
        if (state === "已结算" || state === "已付款") {
          return res.status(400).json({ ok: false, message: `该运单${state}，不能取消回执` });
        }
      }
      invoice.receipt = receipt;
    }

    await invoice.save();
    res.json({ ok: true });
  } catch (error) {
    console.error("切换回执状态失败:", error);
    res.status(500).json({ ok: false, message: "切换回执状态失败" });
  }
};

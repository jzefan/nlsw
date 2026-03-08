const Invoice = require("../../models/Invoice");
const Bill = require("../../models/Bill");
const Vehicle = require("../../models/Vehicle");
const ReceiptImage = require("../../models/ReceiptImage");
const fs = require("fs");
const path = require("path");
const utils = require("../utils");
const { uploadReceiptImages } = require("../../config/multer");
const { buildTenantQuery, injectTenantId } = require("../../utils/tenant");

// 查询车船结算运单（优化版：使用聚合管道，避免 populate）
exports.getInvoiceSettleVessel = async (req, res) => {
  try {
    const {
      fVeh,
      fContact,
      fName,
      fDest,
      fDate1,
      fDate2,
      fSettledState,
      fReceipt,
      fAmount,
      fWeight,
      selfOwned,
    } = req.query;

    // Debug logging
    // console.log("[getInvoiceSettleVessel] Query params:", {
    //   fSettledState,
    //   fDate1,
    //   fDate2,
    //   tenantId: req.tenantId,
    //   selfOwned,
    // });

    // 构建聚合管道
    const pipeline = [];

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
    if (fDest) matchStage.ship_to = fDest;

    // 日期过滤：已结算状态使用结算日期，其他状态使用发货日期
    if (fDate1 && fDate2) {
      if (fSettledState === "已结算" || fSettledState === "已付款") {
        // 已结算/已付款状态：按结算日期过滤
        matchStage.vessel_settle_date = {
          $gte: utils.parseLocalDate(fDate1),
          $lte: utils.parseLocalDate(fDate2),
        };
      } else {
        // 未结算/不需要结算/全部：按发货日期过滤
        matchStage.ship_date = {
          $gte: utils.parseLocalDate(fDate1),
          $lte: utils.parseLocalDate(fDate2),
        };
      }
    }

    if (fSettledState && fSettledState !== "全部")
      matchStage.vessel_settle_state = fSettledState;
    if (fReceipt != null && fReceipt != 2)
      matchStage.receipt = parseInt(fReceipt);
    if (fAmount) matchStage.vessel_price = parseFloat(fAmount);
    if (fWeight) matchStage.total_weight = parseFloat(fWeight);

    // 自有车过滤
    if (selfOwned === "1" || selfOwned === 1) {
      matchStage.selfOwned = 1;
    } else if (selfOwned === "0" || selfOwned === 0) {
      matchStage.selfOwned = { $ne: 1 };
    }

    // Debug logging: show final match stage
    console.log(
      "[getInvoiceSettleVessel] Final matchStage:",
      JSON.stringify(matchStage, null, 2),
    );

    pipeline.push({ $match: matchStage });

    // 第二步：按发货日期降序排序
    pipeline.push({ $sort: { ship_date: -1 } });

    // 第三步：限制结果数量（防止一次性返回太多数据）
    // 默认最多返回 5000 条，前端可以通过分页或日期范围缩小查询
    pipeline.push({ $limit: 5000 });

    // 第四步：关联 bills 集合（使用 $lookup 替代 populate）
    pipeline.push({
      $lookup: {
        from: "bills",
        let: { billIds: "$bills.bill_id" },
        pipeline: [
          {
            $match: {
              $expr: { $in: ["$_id", "$$billIds"] },
            },
          },
          {
            // 只选择必要字段，减少数据传输
            $project: {
              _id: 1,
              order: 1,
              bill_no: 1,
              billing_name: 1,
              block_num: 1,
              total_weight: 1,
              warehouse: 1,
              ship_warehouse: 1,
              brand_no: 1,
              vehicles: 1,
              contract_no: 1,
              shipping_address: 1,
              product_type: 1,
            },
          },
        ],
        as: "billDetails",
      },
    });

    // 第五步：合并 bills 数据到原有的 bills 数组
    pipeline.push({
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
    });

    // 第六步：移除临时字段
    pipeline.push({ $project: { billDetails: 0 } });

    // 执行聚合查询
    const invs = await Invoice.aggregate(pipeline).exec();

    // Debug logging: show result count
    console.log("[getInvoiceSettleVessel] Found", invs.length, "invoices");

    // 构建 vehPersonMap (只查询结果集中出现的车辆)
    const vehSet = new Set();
    invs.forEach((inv) => {
      // 主运单车船号
      if (inv.vehicle_vessel_name) vehSet.add(inv.vehicle_vessel_name);
      // bills.vehicles 中的车船号
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

    const vehPersonMap = {};
    if (vehSet.size > 0) {
      const vehQuery = { name: { $in: Array.from(vehSet) } };
      if (req.tenantId) {
        vehQuery.tenantId = req.tenantId;
      }

      const vehs = await Vehicle.find(vehQuery)
        .select("name boss real_boss")
        .lean()
        .exec();

      vehs.forEach(function (veh) {
        if (veh.boss && (veh.boss.includes(",") || veh.boss.includes("，"))) {
          vehPersonMap[veh.name] = { boss: veh.boss, real_boss: veh.real_boss };
        } else if (veh.boss) {
          vehPersonMap[veh.name] = veh.boss;
        }
      });
    }

    // 查询哪些运单号有回执图片
    const allWaybillNos = [];
    invs.forEach((inv) => {
      allWaybillNos.push(inv.waybill_no);
      if (inv.bills) {
        inv.bills.forEach((bill) => {
          if (bill.vehicles) {
            bill.vehicles.forEach((veh) => {
              if (veh.inner_waybill_no) {
                allWaybillNos.push(veh.inner_waybill_no);
              }
            });
          }
        });
      }
    });

    let imageWaybills = [];
    if (allWaybillNos.length > 0) {
      const imgQuery = { waybill_no: { $in: allWaybillNos } };
      if (req.tenantId) {
        imgQuery.tenantId = req.tenantId;
      }
      imageWaybills = await ReceiptImage.distinct("waybill_no", imgQuery);
    }

    res.json({ ok: true, invs, vehPersonMap, imageWaybills });
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
      } else {
        invoice.bills.forEach((bill) => {
          bill.vehicles.forEach((veh) => {
            if (veh.inner_waybill_no === pd.wno) {
              veh.veh_price = pd.unitPrice;
              veh.price_remark = pd.remark;
            }
          });
        });
      }
      await invoice.save();
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

    for (const wno of wayNoList) {
      const waybillNo = wno.substring(0, 17);
      const invQ = buildTenantQuery(req, { waybill_no: waybillNo });
      const invoice = await Invoice.findOne(invQ).exec();
      if (!invoice) continue;

      if (wno.length > 17) {
        invoice.bills.forEach((bill) => {
          bill.vehicles.forEach((veh) => {
            if (veh.inner_waybill_no === wno)
              veh.veh_price = notNeeded ? -1 : 0;
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
      } else {
        if (notNeeded) {
          invoice.vessel_price = -1;
          invoice.vessel_settle_state = "不需要结算";
          invoice.vessel_settle_date = new Date();
        } else {
          invoice.vessel_price = 0;
          invoice.vessel_settle_state = "未结算";
          invoice.vessel_settle_date = null;
        }
      }

      await invoice.save();
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

      // 重命名文件以包含运单号，并保存元数据到数据库
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

        // 重命名文件
        fs.renameSync(oldPath, newPath);

        // 确保 original_filename 正确处理 UTF-8 编码
        const originalFilename = Buffer.from(
          file.originalname,
          "latin1",
        ).toString("utf8");

        const receiptData = injectTenantId(req, {
          waybill_no: inv_no,
          uploader: uploader,
          upload_time: new Date(),
          file_path: newPath,
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

    const filePath = path.join(
      __dirname,
      "../../uploads/receipts",
      receiptImage,
    );
    if (!fs.existsSync(filePath))
      return res.status(404).json({ ok: false, message: "图片文件不存在" });

    const imageData = fs.readFileSync(filePath);
    const base64Data = imageData.toString("base64");

    const ext = path.extname(receiptImage).toLowerCase();
    let contentType = "image/jpeg";
    if (ext === ".png") contentType = "image/png";
    else if (ext === ".gif") contentType = "image/gif";

    res.json({ ok: true, contentType, data: base64Data });
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

    if (!fs.existsSync(image.file_path)) {
      return res.status(404).json({ ok: false, message: "图片文件不存在" });
    }

    const imageData = fs.readFileSync(image.file_path);
    const base64Data = imageData.toString("base64");

    res.json({
      ok: true,
      contentType: image.mime_type,
      data: base64Data,
      filename: image.original_filename,
    });
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

    if (!fs.existsSync(image.file_path)) {
      return res.status(404).json({ ok: false, message: "图片文件不存在" });
    }

    res.set("Content-Type", image.mime_type || "image/jpeg");
    res.set("Cache-Control", "private, max-age=86400");
    res.sendFile(path.resolve(image.file_path));
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
    const contactNameSet = new Set();

    if (vehList.length > 0) {
      const vehQuery = { name: { $in: vehList } };
      if (req.tenantId) {
        vehQuery.tenantId = req.tenantId;
      }

      const vehs = await Vehicle.find(vehQuery)
        .select("name boss real_boss")
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
      if (!innerSettle) {
        innerSettle = {
          inner_waybill_no: wno,
          state: "未结算",
          date: null,
          receipt: 0,
        };
        invoice.inner_settle.push(innerSettle);
      }
      innerSettle.receipt = receipt;
    } else {
      // 主运单
      invoice.receipt = receipt;
    }

    await invoice.save();
    res.json({ ok: true });
  } catch (error) {
    console.error("切换回执状态失败:", error);
    res.status(500).json({ ok: false, message: "切换回执状态失败" });
  }
};

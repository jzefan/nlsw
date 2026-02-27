const Invoice = require('../../models/Invoice');
const Bill = require('../../models/Bill');
const Vehicle = require('../../models/Vehicle');
const ReceiptImage = require('../../models/ReceiptImage');
const fs = require('fs');
const path = require('path');
const utils = require('../utils');
const { uploadReceiptImages } = require('../../config/multer');
const { buildTenantQuery, injectTenantId } = require('../../utils/tenant');

// 查询车船结算运单
exports.getInvoiceSettleVessel = async (req, res) => {
  try {
    const { fVeh, fContact, fName, fDest, fDate1, fDate2, fSettledState, fReceipt, fAmount, fWeight, selfOwned } = req.query;

    const baseQuery = { state: { $in: ['已配发', '已结算'] } };

    if (fVeh) baseQuery.$or = [{ vehicle_vessel_name: fVeh }, { 'bills.vehicles.veh_name': fVeh }];
    if (fName) baseQuery.ship_name = fName;
    if (fDest) baseQuery.ship_to = fDest;
    if (fDate1 && fDate2) baseQuery.ship_date = { $gte: new Date(fDate1), $lte: new Date(fDate2) };
    if (fSettledState && fSettledState !== '全部') baseQuery.vessel_settle_state = fSettledState;
    if (fReceipt != null && fReceipt != 2) baseQuery.receipt = parseInt(fReceipt);
    if (fAmount) baseQuery.vessel_price = parseFloat(fAmount);
    if (fWeight) baseQuery.total_weight = parseFloat(fWeight);

    // 自有车过滤
    if (selfOwned === '1' || selfOwned === 1) {
      baseQuery.selfOwned = 1;
    } else if (selfOwned === '0' || selfOwned === 0) {
      baseQuery.selfOwned = { $ne: 1 };
    }
    // 如果 selfOwned 未指定，不过滤（显示所有运单）

    const query = buildTenantQuery(req, baseQuery);
    const invs = await Invoice.find(query).populate('bills.bill_id').sort({ ship_date: -1 }).lean().exec();

    res.json({ ok: true, invs });
  } catch (error) {
    console.error('查询失败:', error);
    res.status(500).json({ ok: false, message: '查询失败' });
  }
};

// 更新价格
exports.updateVesselPrice = async (req, res) => {
  try {
    const { wnoList, priceData } = req.body;
    const invQuery = buildTenantQuery(req, { waybill_no: { $in: wnoList } });
    const invoices = await Invoice.find(invQuery).exec();

    for (const pd of priceData) {
      const invoice = invoices.find(inv => inv.waybill_no === pd.wno || inv.waybill_no === pd.wno.substring(0, 17));
      if (!invoice) continue;

      if (pd.inner === 0) {
        invoice.vessel_price = pd.unitPrice;
        invoice.price_remark = pd.remark;
      } else {
        invoice.bills.forEach(bill => {
          bill.vehicles.forEach(veh => {
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
    console.error('更新价格失败:', error);
    res.status(500).json({ ok: false, message: '更新价格失败' });
  }
};

// 结算/取消结算
exports.settleVessel = async (req, res) => {
  try {
    const { allSelectedInvNo, allInvNoFromInner, allInnerNo, settle } = req.body;
    const date = settle ? new Date() : null;
    const state = settle ? '已结算' : '未结算';

    if (allSelectedInvNo?.length > 0) {
      const updateQuery = buildTenantQuery(req, { waybill_no: { $in: allSelectedInvNo } });
      await Invoice.updateMany(
        updateQuery,
        { $set: { vessel_settle_state: state, vessel_settle_date: date } }
      ).exec();
    }

    if (allInvNoFromInner?.length > 0) {
      const innerQuery = buildTenantQuery(req, { waybill_no: { $in: allInvNoFromInner } });
      const invoices = await Invoice.find(innerQuery).exec();
      for (const invoice of invoices) {
        if (!invoice.inner_settle) invoice.inner_settle = [];
        allInnerNo.forEach(innerNo => {
          let innerSettle = invoice.inner_settle.find(is => is.inner_waybill_no === innerNo);
          if (!innerSettle) {
            innerSettle = { inner_waybill_no: innerNo, state: '未结算', date: null };
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
    console.error('结算失败:', error);
    res.status(500).json({ ok: false, message: '结算失败' });
  }
};

// 付款/取消付款
exports.settleVesselPay = async (req, res) => {
  try {
    const { allPayInvNo, allInvNoFromInner, allInnerNo, forPay, ticketNo } = req.body;
    const date = forPay ? new Date() : null;
    const state = forPay ? '已付款' : '已结算';

    if (allPayInvNo?.length > 0) {
      const payQuery = buildTenantQuery(req, { waybill_no: { $in: allPayInvNo } });
      const updateData = { vessel_settle_state: state, pay_date: date };
      if (forPay && ticketNo) {
        updateData.ticket_no = ticketNo;
      }
      await Invoice.updateMany(payQuery, { $set: updateData }).exec();
    }

    if (allInvNoFromInner?.length > 0) {
      const innerPayQuery = buildTenantQuery(req, { waybill_no: { $in: allInvNoFromInner } });
      const invoices = await Invoice.find(innerPayQuery).exec();
      for (const invoice of invoices) {
        allInnerNo.forEach(innerNo => {
          const innerSettle = invoice.inner_settle?.find(is => is.inner_waybill_no === innerNo);
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
    console.error('付款失败:', error);
    res.status(500).json({ ok: false, message: '付款失败' });
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
        let innerSettle = invoice.inner_settle.find(is => is.inner_waybill_no === wno);
        if (!innerSettle) {
          innerSettle = { inner_waybill_no: wno, state: '未结算', date: null };
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
    console.error('更新失败:', error);
    res.status(500).json({ ok: false, message: '更新失败' });
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
        invoice.bills.forEach(bill => {
          bill.vehicles.forEach(veh => {
            if (veh.inner_waybill_no === wno) veh.veh_price = notNeeded ? -1 : 0;
          });
        });

        if (!invoice.inner_settle) invoice.inner_settle = [];
        let innerSettle = invoice.inner_settle.find(is => is.inner_waybill_no === wno);
        if (!innerSettle) {
          innerSettle = { inner_waybill_no: wno, state: '未结算', date: null };
          invoice.inner_settle.push(innerSettle);
        }

        if (notNeeded) {
          innerSettle.state = '不需要结算';
          innerSettle.date = new Date();
        } else {
          innerSettle.state = '未结算';
          innerSettle.date = null;
        }
      } else {
        if (notNeeded) {
          invoice.vessel_price = -1;
          invoice.vessel_settle_state = '不需要结算';
          invoice.vessel_settle_date = new Date();
        } else {
          invoice.vessel_price = 0;
          invoice.vessel_settle_state = '未结算';
          invoice.vessel_settle_date = null;
        }
      }

      await invoice.save();
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('操作失败:', error);
    res.status(500).json({ ok: false, message: '操作失败' });
  }
};

// 更新承运单位
exports.postCarrierDepartment = async (req, res) => {
  try {
    const { vehName, wno, boss } = req.body;
    const vehQ = buildTenantQuery(req, { name: vehName });
    const vehicle = await Vehicle.findOne(vehQ).exec();
    if (!vehicle) return res.status(404).json({ ok: false, message: '车辆不存在' });

    if (!vehicle.real_boss) vehicle.real_boss = [];
    const existingIndex = vehicle.real_boss.findIndex(rb => rb.waybill_no === wno);
    if (existingIndex >= 0) vehicle.real_boss[existingIndex].rb = boss;
    else vehicle.real_boss.push({ waybill_no: wno, rb: boss });

    await vehicle.save();
    res.json({ ok: true, data: { name: vehicle.name, boss: vehicle.boss, real_boss: vehicle.real_boss } });
  } catch (error) {
    console.error('更新失败:', error);
    res.status(500).json({ ok: false, message: '更新失败' });
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
        return res.status(400).json({ ok: false, message: '缺少运单号' });
      }

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ ok: false, message: '没有上传文件' });
      }

      // 获取上传人信息（从session或body中）
      const uploader = req.user?.userid || req.body.uploader || 'unknown';

      // 验证运单是否存在
      const waybillNo = inv_no.substring(0, 17);
      const invQ = buildTenantQuery(req, { waybill_no: waybillNo });
      const invoice = await Invoice.findOne(invQ).exec();
      if (!invoice) {
        // 删除已上传的文件
        req.files.forEach(file => {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        });
        return res.status(404).json({ ok: false, message: '运单不存在' });
      }

      // 重命名文件以包含运单号，并保存元数据到数据库
      const savedImages = [];
      for (const file of req.files) {
        // 获取原始文件路径和目录
        const oldPath = file.path;
        const dir = path.dirname(oldPath);
        const ext = path.extname(file.filename);

        // 生成新文件名：运单号_时间戳_随机数.扩展名
        const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
        const randomStr = Math.random().toString(36).substring(2, 8);
        const newFilename = `${inv_no}_${timestamp}_${randomStr}${ext}`;
        const newPath = path.join(dir, newFilename);

        // 重命名文件
        fs.renameSync(oldPath, newPath);

        // 确保 original_filename 正确处理 UTF-8 编码
        const originalFilename = Buffer.from(file.originalname, 'latin1').toString('utf8');

        const receiptData = injectTenantId(req, {
          waybill_no: inv_no,
          uploader: uploader,
          upload_time: new Date(),
          file_path: newPath,
          original_filename: originalFilename,
          file_size: file.size,
          mime_type: file.mimetype
        });
        const receiptImage = new ReceiptImage(receiptData);

        await receiptImage.save();
        savedImages.push(receiptImage);
      }

      // 更新运单的回执状态
      if (inv_no.length > 17) {
        // 内部运单
        if (!invoice.inner_settle) invoice.inner_settle = [];
        let innerSettle = invoice.inner_settle.find(is => is.inner_waybill_no === inv_no);
        if (!innerSettle) {
          innerSettle = { inner_waybill_no: inv_no, state: '未结算', date: null, receipt: 0 };
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
        images: savedImages.map(img => ({
          id: img._id,
          filename: path.basename(img.file_path),
          size: img.file_size,
          upload_time: img.upload_time
        }))
      });
    } catch (error) {
      console.error('上传失败:', error);

      // 如果出错，清理已上传的文件（包括已重命名的文件）
      if (req.files) {
        req.files.forEach(file => {
          // 尝试删除原始文件
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
          // 尝试删除可能已重命名的文件
          const dir = path.dirname(file.path);
          const pattern = new RegExp(`^${inv_no || 'temp'}_.*${path.extname(file.filename)}$`);
          try {
            const files = fs.readdirSync(dir);
            files.forEach(f => {
              if (pattern.test(f)) {
                const fullPath = path.join(dir, f);
                if (fs.existsSync(fullPath)) {
                  fs.unlinkSync(fullPath);
                }
              }
            });
          } catch (cleanupError) {
            console.error('清理文件失败:', cleanupError);
          }
        });
      }

      res.status(500).json({
        ok: false,
        message: error.message || '上传失败'
      });
    }
  }
];

// 获取回执图片
exports.getReceiptImg = async (req, res) => {
  try {
    const wno = req.query.q;
    if (!wno) return res.status(400).json({ ok: false, message: '缺少运单号' });

    const waybillNo = wno.substring(0, 17);
    const invQ = buildTenantQuery(req, { waybill_no: waybillNo });
    const invoice = await Invoice.findOne(invQ).lean().exec();
    if (!invoice) return res.status(404).json({ ok: false, message: '运单不存在' });

    let receiptImage = null;
    if (wno.length > 17) {
      const innerSettle = invoice.inner_settle?.find(is => is.inner_waybill_no === wno);
      receiptImage = innerSettle?.receipt_image;
    } else {
      receiptImage = invoice.receipt_image;
    }

    if (!receiptImage) return res.status(404).json({ ok: false, message: '回执图片不存在' });

    const filePath = path.join(__dirname, '../../uploads/receipts', receiptImage);
    if (!fs.existsSync(filePath)) return res.status(404).json({ ok: false, message: '图片文件不存在' });

    const imageData = fs.readFileSync(filePath);
    const base64Data = imageData.toString('base64');

    const ext = path.extname(receiptImage).toLowerCase();
    let contentType = 'image/jpeg';
    if (ext === '.png') contentType = 'image/png';
    else if (ext === '.gif') contentType = 'image/gif';

    res.json({ ok: true, contentType, data: base64Data });
  } catch (error) {
    console.error('获取失败:', error);
    res.status(500).json({ ok: false, message: '获取失败' });
  }
};

// 获取运单的所有回执图片列表
exports.getReceiptImagesList = async (req, res) => {
  try {
    const wno = req.query.q;
    if (!wno) {
      return res.status(400).json({ ok: false, message: '缺少运单号' });
    }

    // 从数据库查询该运单的所有回执图片
    const imgQuery = buildTenantQuery(req, { waybill_no: wno });
    const images = await ReceiptImage.find(imgQuery)
      .sort({ upload_time: -1 }) // 按上传时间倒序
      .lean()
      .exec();

    // 返回图片列表（不包含实际图片数据，只返回元数据）
    const imageList = images.map(img => ({
      id: img._id,
      filename: path.basename(img.file_path),
      original_filename: img.original_filename,
      file_size: img.file_size,
      mime_type: img.mime_type,
      uploader: img.uploader,
      upload_time: img.upload_time
    }));

    res.json({
      ok: true,
      images: imageList,
      total: imageList.length
    });
  } catch (error) {
    console.error('获取图片列表失败:', error);
    res.status(500).json({ ok: false, message: '获取图片列表失败' });
  }
};

// 获取单张回执图片（通过图片ID）
exports.getReceiptImageById = async (req, res) => {
  try {
    const imageId = req.query.id;
    if (!imageId) {
      return res.status(400).json({ ok: false, message: '缺少图片ID' });
    }

    const imgByIdQuery = buildTenantQuery(req, { _id: imageId });
    const image = await ReceiptImage.findOne(imgByIdQuery).lean().exec();
    if (!image) {
      return res.status(404).json({ ok: false, message: '图片记录不存在' });
    }

    if (!fs.existsSync(image.file_path)) {
      return res.status(404).json({ ok: false, message: '图片文件不存在' });
    }

    const imageData = fs.readFileSync(image.file_path);
    const base64Data = imageData.toString('base64');

    res.json({
      ok: true,
      contentType: image.mime_type,
      data: base64Data,
      filename: image.original_filename
    });
  } catch (error) {
    console.error('获取图片失败:', error);
    res.status(500).json({ ok: false, message: '获取图片失败' });
  }
};

// 删除回执图片
exports.deleteReceiptImage = async (req, res) => {
  try {
    const imageId = req.query.id;
    if (!imageId) {
      return res.status(400).json({ ok: false, message: '缺少图片ID' });
    }

    const delImgQuery = buildTenantQuery(req, { _id: imageId });
    const image = await ReceiptImage.findOne(delImgQuery).exec();
    if (!image) {
      return res.status(404).json({ ok: false, message: '图片记录不存在' });
    }

    // 删除文件
    if (fs.existsSync(image.file_path)) {
      fs.unlinkSync(image.file_path);
    }

    // 删除数据库记录
    await ReceiptImage.deleteOne(delImgQuery).exec();

    // 检查该运单是否还有其他图片
    const remainImgQuery = buildTenantQuery(req, { waybill_no: image.waybill_no });
    const remainingImages = await ReceiptImage.find(remainImgQuery).exec();

    // 如果没有剩余图片，更新运单的回执状态为0
    if (remainingImages.length === 0) {
      const waybillNo = image.waybill_no.substring(0, 17);
      const invQ = buildTenantQuery(req, { waybill_no: waybillNo });
      const invoice = await Invoice.findOne(invQ).exec();

      if (invoice) {
        if (image.waybill_no.length > 17) {
          // 内部运单
          const innerSettle = invoice.inner_settle?.find(is => is.inner_waybill_no === image.waybill_no);
          if (innerSettle) {
            innerSettle.receipt = 0;
          }
        } else {
          // 主运单
          invoice.receipt = 0;
        }
        await invoice.save();
      }
    }

    res.json({ ok: true, message: '删除成功' });
  } catch (error) {
    console.error('删除图片失败:', error);
    res.status(500).json({ ok: false, message: '删除图片失败' });
  }
};

// 获取运单详情
exports.getWaybill = async (req, res) => {
  try {
    const wno = req.query.q;
    if (!wno) return res.status(400).json({ ok: false, message: '缺少运单号' });

    const wbQuery = buildTenantQuery(req, { waybill_no: wno });
    const invoice = await Invoice.findOne(wbQuery).lean().exec();
    if (!invoice) return res.status(404).json({ ok: false, message: '运单不存在' });

    const billIds = invoice.bills.map(b => b.bill_id);
    const billQ = buildTenantQuery(req, { _id: { $in: billIds } });
    const bills = await Bill.find(billQ).lean().exec();

    res.json({ bills, invoices: [invoice] });
  } catch (error) {
    console.error('获取失败:', error);
    res.status(500).json({ ok: false, message: '获取失败' });
  }
};

// 获取车船结算初始数据
exports.getVesselInitialData = async (req, res) => {
  try {
    let selfOwned = false;
    if (req.query.selfOwned === 'true' || req.query.selfOwned === '1') {
      selfOwned = true;
    }

    var baseQ = { state: { $ne: '新建' }, selfOwned: 1 };
    if (!selfOwned) {
      baseQ.selfOwned = { $ne: 1 };
    }

    let data = {
      nameList: [],
      vehList: [],
      destList: [],
      contactNameList: [],
      vehPersonMap: {},
    }

    const initQuery = buildTenantQuery(req, baseQ);
    const invs = await Invoice.find(initQuery).select({ "_id": 0, "settle_flag": 1, "ship_name": 1, "vehicle_vessel_name": 1, "ship_to": 1, "bills": 1 }).exec();
    
    function pushArr(arr, elem) {
      if (elem && arr.indexOf(elem) < 0) {
        arr.push(elem);
      }
    };

    invs.forEach(function (inv) {
      pushArr(data.nameList, inv.ship_name);
      pushArr(data.destList, inv.ship_to);

      pushArr(data.vehList, inv.vehicle_vessel_name);
      if (inv.bills && inv.bills.length) {
        inv.bills.forEach(function (bill) {
          if (bill.vehicles && bill.vehicles.length) {
            bill.vehicles.forEach(function (veh) {
              pushArr(data.vehList, veh.veh_name);
            })
          }
        })
      }
    });

    const vehInitQuery = buildTenantQuery(req, {});
    const vehs = await Vehicle.find(vehInitQuery).select('name contact_name boss real_boss').lean().exec()
    vehs.forEach(function (veh) {
      const isExist = data.vehList.find((item) => item === veh.name);
      if (isExist) {
        if (veh.boss && (veh.boss.includes(',') || veh.boss.includes('，'))) {
          const list = veh.boss.split(/,|，/);
          list.forEach(function (b) {
            pushArr(data.contactNameList, b.trim());
          })

          data.vehPersonMap[veh.name] = { boss: veh.boss, real_boss: veh.real_boss };
        } else if (veh.boss) {
          pushArr(data.contactNameList, veh.boss);
          data.vehPersonMap[veh.name] = veh.boss;
        }
      }
    })

    data.nameList = utils.pinyin_sort(data.nameList);
    data.vehList = utils.pinyin_sort(data.vehList);
    data.contactNameList = utils.pinyin_sort(data.contactNameList);

    const options = {
      vehicleList: data.vehList,
      contactList: data.contactNameList,
      nameList: data.nameList,
      destList: data.destList,
      vehPersonMap: data.vehPersonMap
    };

    res.json({ ok: true, options });

  } catch (error) {
    console.error('获取初始数据失败:', error);
    res.status(500).json({ ok: false, message: '获取初始数据失败' });
  }
};

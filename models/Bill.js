var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var billSchema = new Schema({
  order: String,
  bill_no: String,         // 提单号
  order_no: String,        // 订单号
  order_item_no: Number,  // 订单项次号
  brand_no: String,       // 牌号
  billing_name: String,   // 开单名称

  len: Number,          // 长 (if size_type is '单定' then display it with "L"
  width: Number,        // 宽
  thickness: Number,    // 厚
  size_type: String, // default: '定尺'

  weight: Number,         // 单块重
  block_num: Number,     // 可发货块数
  total_weight: Number,  // 总重量
  left_num: Number,       // 剩余块数/重量

  customer_price: Number,   // 客户总价
  collection_price: Number, // 以一个提单为基础的价格

  invoices: [
    {
      inv_no: String,
      veh_ves_name: String,  // 车船号
      num: Number,            // 运单发送数量
      weight: Number,
      price: Number,          // 客户单价 (重量为一顿的价格）可能每个运单价格不一样 (自提)
      veh_ves_price: Number, // 车船价 (出给车司机的价格)
      ship_to: String,        // 发往目的地
      ship_from: String,

      vehicles: [             // 车号, 如果运单选择是船,则同时每个提单还要记录车号, 否则为空
        {
          inner_waybill_no: String,
          veh_name: String,
          veh_ship_from: String,
          send_num: Number,
          send_weight: Number,
          veh_price: Number   // 车价 (出给车司机的价格)
        }
      ],

      inv_settle_flag: { type: Number, default: 0 }
    }
  ],

  warehouse: { type: String, default: '' }, // 存放仓库
  ship_warehouse: String, // 发货仓库

  contract_no: String,
  sales_dep: String,
  shipping_address: String, // 收货地址
  
  create_date: { type: Date, default: Date.now }, // 提单生成日期
  shipping_date: Date,
  settle_date: Date,
  creater: String,
  shipper: String,
  settler: String,

  status: { type: String, default: '新建' }, // 新建, 待配发, 已配发, 部分配发, 已结算
  status_flag: { type: Number, default: 0 }, // 0 - 新建, 1 - 部分配发, 2 - 已配发, 3 - 已结算, 4 - 已开票, 5 - 已回款
  settle_flag: { type: Number, default: 0 }, // 0000: no settle, 0001: customer settle, 0010: collection settle, 0100: vessel settle

  remark: String,
  product_type: String // 产品型态
});

billSchema.index({ order: 1, bill_no: 1 }); // schema level
billSchema.index({ billing_name: 1, create_date: -1, left_num: 1 }); // Optimize customer active bill search
billSchema.index({ billing_name: 1, order_no: 1 }); // Optimize specific order lookup
billSchema.index({ order_no: 1 }); // Optimize order lookup

billSchema.pre('save', function (next) {
  if (this.isModified('status')) {
    if (this.status === '新建') {
      this.status_flag = 0;
    } else if (this.status === '已配发') {
      this.status_flag = 2;
    } else if (this.status === '已结算') {
      this.status_flag = 3;
    } else if (this.status === '已开票') {
      this.status_flag = 4;
    } else if (this.status === '已回款') {
      this.status_flag = 5;
    } else if (this.status.startsWith('已配发') || this.status === '待配发' || this.status === '部分配发') {
      this.status_flag = 1;
    }
  }
  next();
});

billSchema.pre('findOneAndUpdate', function (next) {
  const update = this.getUpdate();
  if (update.status || (update.$set && update.$set.status)) {
    const status = update.status || update.$set.status;
    let status_flag = -1;
    if (status === '新建') {
      status_flag = 0;
    } else if (status === '已配发') {
      status_flag = 2;
    } else if (status === '已结算') {
      status_flag = 3;
    } else if (status === '已开票') {
      status_flag = 4;
    } else if (status === '已回款') {
      status_flag = 5;
    } else if (status.startsWith('已配发') || status === '待配发' || status === '部分配发') {
      status_flag = 1;
    }

    if (status_flag !== -1) {
      if (update.$set) {
        update.$set.status_flag = status_flag;
      } else {
        update.status_flag = status_flag;
      }
    }
  }
  next();
});

module.exports = mongoose.model('Bill', billSchema);
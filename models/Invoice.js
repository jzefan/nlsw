/**
 * Created by ezefjia on 4/29/2014.
 */

var mongoose = require('mongoose');
//var Bill = require('./Bill');

var Schema = mongoose.Schema,
    ObjectId = Schema.ObjectId;

var invoiceSchema = new Schema({
  // === SaaS 多租户字段 ===
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true
  },

  waybill_no: { type: String },  // 改为租户内唯一
  vehicle_vessel_name: String, // 车船号
  ship_warehouse: String,       // 发货仓库
  ship_name: String,             // 发货名称/单位
  ship_customer: String,        // 发货单位/客户
  ship_date: Date,  // 发货日期
  ship_to: String,  // 发货目的地
  ship_from: String,

  bills: [
    {
      bill_id: { type: ObjectId, ref: 'Bill' },
      num: Number,         // 数量
      weight: Number,      // 重量
      vehicles: [          // 车号, 如果运单选择是船,则同时每个提单还要记录车号
        {
          inner_waybill_no: String,
          veh_name: String,
          veh_ship_from: String,
          send_num: Number,
          send_weight: Number,
          veh_price: Number,
          price_mode: Number,
          price_remark: String,
        }
      ]
    }
  ],

  total_weight: Number,
  shipper: String,  // 发货人
  username: String, // 创建人
  state: String,    // 新建, 配发, 结算 (客户/代收代付)
  create_date: Date,  // 创建日期
  settle_flag: { type: Number, default: 0 },

  vessel_settle_state: { type: String, default: '未结算' }, // 车船结算状态
  vessel_settle_date: Date,
  vessel_settler: String,
  vessel_price: { type: Number, default: 0 },
  price_mode: { type: Number, default: 0 }, // 价格方式， 0 每吨， 1 打包
  price_remark: String, // 车船价格备注
  ticket_no: String, // 票号
  incoming_price_remark: String, // 客户或代收代付价格备注

  unship_date: Date,                        // 卸船日期
  delay_day: { type: Number, default: 0 }, // 滞留天数
  advance_charge_mode: { type: String, default: '现金' }, // 现金; 油
  advance_charge: { type: Number, default: 0 },
  charge_cash: { type: Number, default: 0 },
  charge_oil: { type: Number, default: 0 },
  receipt: { type: Number, default: 0 },  // 是否回执: 0, no receipt; 1, receipt

  inner_settle: [ // 装船的车结算状态
    {
      inner_waybill_no: String,
      state: { type: String, default: '未结算' },
      price: { type: Number, default: 0 },
      date: Date,
      unship_date: Date,
      delay_day: { type: Number, default: 0 },
      advance_charge_mode: { type: String, default: '现金' },
      advance_charge: { type: Number, default: 0 },
      charge_cash: { type: Number, default: 0 },
      charge_oil: { type: Number, default: 0 },
      receipt: { type: Number, default: 0 },
      remark: String,
      ticket_no: String,
      pay_date: Date
    }
  ],

  selfOwned: { type: Number, default: 0}, // 0 非自有， 1 自有
  // boss: String, // 承运单位

  remark: String,
  pay_date: Date   // 付款日期
});

module.exports = mongoose.model('Invoice', invoiceSchema);
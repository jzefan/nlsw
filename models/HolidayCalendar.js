const mongoose = require('mongoose');

/**
 * 国务院办公厅每年公布的节假日安排（放假日 + 调休上班日）。
 * 这是全国统一数据、与租户无关，所以**不声明 tenantId**（全局租户插件只对带 tenantId 的 schema 生效）。
 * 首次需要某个年度时从线上抓一次并写到这里，之后直接读库，不再联网。
 */
const daySchema = new mongoose.Schema({
  date: { type: String, required: true }, // YYYY-MM-DD
  type: { type: String, enum: ['holiday', 'workday'], required: true },
  name: { type: String, default: '' } // 假期名（调休上班日带的是所属假期名）
}, { _id: false });

const holidayCalendarSchema = new mongoose.Schema({
  year: { type: Number, required: true, unique: true },
  days: { type: [daySchema], default: [] },
  source: { type: String, default: '' }, // 抓取来源标识
  notice: { type: String, default: '' }, // 国务院通知原文链接（数据源提供时）
  fetchedAt: { type: Date, default: Date.now }
}, { versionKey: false, collection: 'holiday_calendars' });

module.exports = mongoose.model('HolidayCalendar', holidayCalendarSchema);

/**
 * Created by ezefjia on 2015/5/9.
 */

var Vehicle = require('../models/Vehicle');
var VehVesCost = require('../models/VesselCost');
var utils = require('./utils');
const { buildTenantQuery, injectTenantId, isPlatformUser } = require('../utils/tenant');
const { hasPermission, PERMISSIONS } = require('../utils/permissions');

exports.getVehVesMgt = async function (req, res) {
  if (!hasPermission(req.user.privilege, PERMISSIONS.ACCOUNT)) {
    res.status(404);
    res.render('404');
  }
  else {
    try {
      const vehs = await Vehicle.find(buildTenantQuery(req, {veh_category:'自有'})).exec();
      var vehList = [];
      vehs.forEach(function (veh) {
        if (veh.veh_type === '车') {
          vehList.push(veh.name);
        }
      });

      var vehicles = [];
      const vvc = await VehVesCost.find(buildTenantQuery(req, {vv_type:'che'})).select('name').sort({month: 'asc'}).exec();
      vvc.forEach(function (item) {
        if (vehicles.indexOf(item.name) < 0) {
          vehicles.push(item.name);
        }
      });

      res.render('statistics/vehves_cost_mgt', {
        title: '车船固定费用',
        curr_page: '固定费用管理',
        curr_page_name: '车船',
        dData: {
          vehicles: (vehicles.length ? utils.pinyin_sort(vehicles) : []),
          vehList: utils.pinyin_sort(vehList),
          allVehves: vehs
        },
        scripts: [
          '/js/plugins/select2/select2.min.js',
          '/js/plugins/select2/select2_locale_zh-CN.js',
          '/js/vehves_cost_mgt.js'
        ]
      });
    } catch (err) {
      req.flash('车船数据表查找错', err);
      res.render('statistics/vehves_cost_mgt', {
        title: '车船固定费用',
        curr_page: '固定费用管理',
        curr_page_name: '读数据错',
        scripts: [
          '/js/plugins/select2/select2.min.js',
          '/js/plugins/select2/select2_locale_zh-CN.js',
          '/js/vehves_cost_mgt.js'
        ]
      });
    }
  }
};

exports.getVFCData = async function(req, res) {
  var query = req.query;
  var b1 = (query.fDate1 && query.fDate2);
  var b2 = utils.isExist(query.fVVName);

  if (!b1 && !b2) {
    return res.end(JSON.stringify({ ok: false }));
  }

  var qObj;
  if (b1 && b2) {
    qObj = { $and: [ {vv_type: query.fVVType}, {name: { $in: query.fVVName }}, {month: { $gte: query.fDate1, $lte: query.fDate2 }} ] };
  } else if (b1) {
    qObj = { $and: [ {vv_type: query.fVVType}, {month: { $gte: query.fDate1, $lte: query.fDate2 }} ]};
  } else if (b2) {
    qObj = { $and: [ {vv_type: query.fVVType}, {name: { $in: query.fVVName }} ] };
  }

  try {
    const vvcList = await VehVesCost.find(buildTenantQuery(req, qObj)).sort({month: 'asc'}).exec();
    res.end(JSON.stringify({ ok: true, vvcList: vvcList }));
  } catch (err) {
    res.end(JSON.stringify({ ok: false, response: err }));
  }
};

exports.getOneVFCData = async function(req, res) {
  var query = req.query;
  try {
    const vvc = await VehVesCost.findOne(buildTenantQuery(req, {name: query.fName, month: query.fMonth})).exec();
    if (!vvc) {
      res.end(JSON.stringify({ ok: false }));
    }
    else {
      res.end(JSON.stringify({ ok: true, vvc: vvc }));
    }
  } catch (err) {
    res.end(JSON.stringify({ ok: false, response: err }));
  }
};

exports.postOneVFCData = async function(req, res) {
  var data = req.body;
  try {
    let dbVVCost = await VehVesCost.findOne(buildTenantQuery(req, {name: data.name, month: data.month})).exec();
    if (!dbVVCost) {
      dbVVCost = new VehVesCost(injectTenantId(req, data));
    } else {
      dbVVCost.ic = data.ic;
      dbVVCost.pc = data.pc;
      dbVVCost.pcc = data.pcc;
      dbVVCost.aux = data.aux;
      dbVVCost.fittings = data.fittings;
      dbVVCost.repair = data.repair;
      dbVVCost.aunual_survey = data.aunual_survey;
      dbVVCost.salary = data.salary;
      dbVVCost.oil = data.oil;
      dbVVCost.toll = data.toll;
      dbVVCost.fine = data.fine;
      dbVVCost.other = data.other;
      dbVVCost.total = data.total;
    }
    await dbVVCost.save();
    res.end(JSON.stringify({ ok: true }));
  } catch(err) {
    var s = '保存出错！(车船号:' + data.name + ', 月份:' + data.month + ', 原因:' + err;
    res.end(JSON.stringify({ ok: false, response: s }));
  }
};

exports.postDeleteVFCData = async function(req, res) {
  var data = req.body;
  if (data.name && data.month) {
    try {
      await VehVesCost.deleteMany(buildTenantQuery(req, {name: data.name, month: data.month})).exec();
      res.end(JSON.stringify({ ok: true }));
    } catch (err) {
      console.error('remove vehves cost error! %s', err);
      res.end(JSON.stringify({ ok: false, response: '删除车船固定记录出错:' + err }));
    }
  } else {
    res.end(JSON.stringify({ ok: false, response: 'Data not correct'}));
  }
};

exports.searchVehicles = async function(req, res) {
  try {
    const { search, type, category, boss, affiliated, includeAffiliated, page = 1, limit = 20 } = req.query;
    const baseQuery = {};

    // 只有明确指定 type 时才过滤类型，否则搜索所有车船
    if (type) {
      baseQuery.veh_type = type;
    }

    // 按类别过滤（自有/外挂）
    if (category) {
      if (category === '自有') {
        if (includeAffiliated === 'true' || includeAffiliated === true) {
          baseQuery.$or = [
            { veh_category: '自有' },
            { affiliated: true },
          ];
        } else {
          baseQuery.veh_category = '自有';
        }
      } else if (category === '外挂') {
        // 外挂：veh_category 为 '外挂' 或不是 '自有' 的所有记录
        baseQuery.veh_category = { $ne: '自有' };
      }
    }
    // 如果 category 未指定，不过滤（显示所有车辆）

    // 按承运单位过滤
    if (boss) {
      baseQuery.boss = { $regex: boss, $options: 'i' };
    }

    if (affiliated === 'true') {
      baseQuery.affiliated = true;
    } else if (affiliated === 'false') {
      baseQuery.affiliated = { $ne: true };
    }

    if (search) {
      baseQuery.name = { $regex: search, $options: 'i' };
    }

    // 过滤掉异常的长车船号（正常车船号不会超过20个字符）
    const query = buildTenantQuery(req, baseQuery);
    const vehicles = await Vehicle.find(query)
      .sort({ create_time: -1 })
      .lean();

    // 只保留合理长度的车船号，并按拼音排序
    const validVehicles = utils.pinyin_sort_2(vehicles.filter(v => v.name && v.name.length <= 20));

    // 应用分页
    const total = validVehicles.length;
    const start = (parseInt(page) - 1) * parseInt(limit);
    const paginatedVehicles = validVehicles.slice(start, start + parseInt(limit));

    res.json({
      ok: true,
      data: paginatedVehicles,
      total: total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit))
    });
  } catch (error) {
    console.error('searchVehicles error:', error);
    res.status(500).json({ ok: false, error: error.toString(), stack: error.stack });
  }
};

// 获取不重复的承运单位列表
exports.getVehicleBossList = async function(req, res) {
  try {
    const bossList = await Vehicle.distinct('boss', buildTenantQuery(req, {}));
    // boss 字段可能包含逗号分隔的多个单位，拆分去重
    const set = new Set();
    bossList.forEach(b => {
      if (b) b.split(/[,，]/).map(s => s.trim()).filter(Boolean).forEach(s => set.add(s));
    });
    const sorted = Array.from(set).sort();
    res.json({ ok: true, data: sorted });
  } catch (error) {
    console.error('getVehicleBossList error:', error);
    res.status(500).json({ ok: false, error: error.toString() });
  }
};

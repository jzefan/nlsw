/**
 * Created by ezefjia on 5/15/2014.
 */

var Vehicle = require('../models/Vehicle');
var Company = require('../models/Company');
var Warehouse = require('../models/Warehouse');
var Destination = require('../models/Destination');
var Brand = require('../models/Brand');
var SaleDep = require('../models/SaleDep');
var utils = require('./utils');
var Inv = require('../models/Invoice');
var Bill = require('../models/Bill');

exports.httpGetVehicle = function (req, res) {
  initRender(req, res, Vehicle, 'datamgt/vehicle', '车船号管理', '车船号', 'vehicle');
};

exports.httpPostVehicleAdd = async function (req, res) {
  var obj = new Vehicle({
    name: req.body.name,
    veh_type: req.body.veh_type,
    veh_category: req.body.veh_category,
    contact_name: req.body.contact_name,
    phone: req.body.phone,
    boss: req.body.boss
  });
  try {
    await obj.save();
    res.end(JSON.stringify({ok: true}));
  } catch (err) {
    res.end(JSON.stringify({ok: false, response: '保存失败:' + err}));
  }
};

exports.httpPostVehicleModify = function (req, res) {
  modify(req, res, Vehicle, {name: req.body.name});
};

exports.httpPostVehicleDelete = async function (req, res) {
  var name = req.body.name;
  var qobj = {
    $or : [
      { vehicle_vessel_name: name },
      {"bills.vehicles.veh_name": {$all: [name]}}
    ]
  };

  try {
    const invs = await Inv.find(qobj).select('waybill_no').exec();
    if (invs && invs.length) {
      res.end(JSON.stringify({ok: false, response: '不能删除！此车船号已经被运单使用'}));
    } else {
      await remove(req, res, Vehicle, {name: name});
    }
  } catch (err) {
    res.end(JSON.stringify({ok: false, response: '不能删除!'}));
  }
};

exports.httpGetCompany = function (req, res) {
  initRender(req, res, Company, 'datamgt/company', '发货单位管理', '发货单位', 'company');
};

exports.httpPostCompanyAdd = async function (req, res) {
  var obj = new Company({
    name: req.body.name,
    customers: req.body.customers,
    contact_name: req.body.contact_name,
    phone: req.body.phone,
    address: req.body.address
  });
  try {
    await obj.save();
    res.end(JSON.stringify({ok: true}));
  } catch (err) {
    res.end(JSON.stringify({ok: false, response: '保存失败:' + err}));
  }
};

exports.httpPostCompanyModify = function (req, res) {
  modify(req, res, Company, {name: req.body.name});
};

exports.httpPostCompanyDelete = async function (req, res) {
  var name = req.body.name;
  try {
    const bills = await Bill.find({billing_name: name}).select('billing_name').exec();
    if (bills && bills.length) {
      res.end(JSON.stringify({ok: false, response: '不能删除！存在此发货单位的提单。'}));
    } else {
      await remove(req, res, Company, {name: name});
    }
  } catch (err) {
    res.end(JSON.stringify({ok: false, response: '不能删除!'}));
  }
};

exports.httpGetWarehouse = function (req, res) {
  initRender(req, res, Warehouse, 'datamgt/warehouse', '仓库管理', '仓库', 'warehouse');
};

exports.httpPostWarehouseAdd = async function (req, res) {
  var obj = new Warehouse({
    name: req.body.name,
    contact_name: req.body.contact_name,
    phone: req.body.phone,
    address: req.body.address
  });
  try {
    await obj.save();
    res.end(JSON.stringify({ok: true}));
  } catch (err) {
    res.end(JSON.stringify({ok: false, response: '保存失败:' + err}));
  }
};

exports.httpPostWarehouseModify = function (req, res) {
  modify(req, res, Warehouse, {name: req.body.name});
};

exports.httpPostWarehouseDelete = function (req, res) {
  remove(req, res, Warehouse, {name: req.body.name});
};

exports.httpGetDestination = function (req, res) {
  initRender(req, res, Destination, 'datamgt/destination', '目的地管理', '目的地', 'destination');
};

exports.httpPostDestinationAdd = async function (req, res) {
  var obj = new Destination({
    name: req.body.name,
    contact_name: req.body.contact_name,
    phone: req.body.phone,
    address: req.body.address
  });
  try {
    await obj.save();
    res.end(JSON.stringify({ok: true}));
  } catch (err) {
    res.end(JSON.stringify({ok: false, response: '保存失败:' + err}));
  }
};

exports.httpPostDestinationModify = function (req, res) {
  modify(req, res, Destination, {name: req.body.name});
};

exports.httpPostDestinationDelete = function (req, res) {
  remove(req, res, Destination, {name: req.body.name});
};

exports.httpGetBrand = function (req, res) {
  initRender(req, res, Brand, 'datamgt/brand', '牌号管理', '牌号', 'brand');
};

exports.httpPostBrandAdd = async function (req, res) {
  var obj = new Brand({
    name: req.body.name
  });
  try {
    await obj.save();
    res.end(JSON.stringify({ok: true}));
  } catch (err) {
    res.end(JSON.stringify({ok: false, response: '保存失败:' + err}));
  }
};

exports.httpPostBrandModify = function (req, res) {
  modify(req, res, Brand, {name: req.body.name});
};

exports.httpPostBrandDelete = function (req, res) {
  remove(req, res, Brand, {name: req.body.name});
};

exports.httpGetSaleDep = function (req, res) {
  initRender(req, res, SaleDep, 'datamgt/sale_dep', '销售部门管理', '销售部门', 'sale_dep');
};

exports.httpPostSaleDepAdd = async function (req, res) {
  var obj = new SaleDep({
    name: req.body.name
  });
  try {
    await obj.save();
    res.end(JSON.stringify({ok: true}));
  } catch (err) {
    res.end(JSON.stringify({ok: false, response: '保存失败:' + err}));
  }
};

exports.httpPostSaleDepModify = function (req, res) {
  modify(req, res, SaleDep, {name: req.body.name});
};

exports.httpPostSaleDepDelete = function (req, res) {
  remove(req, res, SaleDep, {name: req.body.name});
};

async function initRender(req, res, table, route, page_name, sm_page_name, operObject) {
  try {
    const result = await table.find({}).sort({name: 'asc'}).exec();
    res.render(route, {
      title: '数据字典',
      curr_page: page_name,
      curr_page_name: sm_page_name,
      dData: utils.pinyin_sort_2(result),
      dOperationObject: operObject,
      scripts: [
        '/js/plugins/select2/select2.min.js',
        '/js/plugins/select2/select2_locale_zh-CN.js',
        '/js/data_dict_mgt.js' ]
    });
  } catch (err) {
    req.flash('errors', err);
    res.render(route, {
      title: '数据字典',
      curr_page: page_name,
      curr_page_name: sm_page_name
    });
  }
}

async function add(res, dataObj) {
  try {
    await dataObj.save();
    res.end(JSON.stringify({ok: true}));
  } catch(err) {
    res.end(JSON.stringify({ok: false, response: '保存失败:' + err}));
  }
}

async function modify(req, res, table, query) {
  try {
    const result = await table.findOne(query).exec();
    if (!result) {
      res.end(JSON.stringify({ok: false, response: '数据库没找到!'}));
    } else {
      result.contact_name = req.body.contact_name;
      result.phone = req.body.phone;
      if (((typeof req.body.address != 'undefined') && undefined != req.body.address)) {
        result.address = req.body.address;
      }
      if (((typeof req.body.veh_type != 'undefined') && undefined != req.body.veh_type)) {
        result.veh_type = req.body.veh_type;
      }
      if (((typeof req.body.veh_category != 'undefined') && undefined != req.body.veh_category)) {
        result.veh_category = req.body.veh_category;
      }
      if (((typeof req.body.customers != 'undefined') && undefined != req.body.customers)) {
        result.customers = req.body.customers;
      }
      if (((typeof req.body.boss != 'undefined') && undefined != req.body.boss)) {
        result.boss = req.body.boss;
      }

      await result.save();
      res.end(JSON.stringify({ok: true}));
    }
  } catch (err) {
    res.end(JSON.stringify({ok: false, response: '失败:' + err}));
  }
}

async function remove(req, res, table, query) {
  try {
    await table.deleteMany(query).exec();
    res.end(JSON.stringify({ok: true}));
  } catch (err) {
    res.end(JSON.stringify({ok: false, response: '数据库没找到!' + err}));
  }
}
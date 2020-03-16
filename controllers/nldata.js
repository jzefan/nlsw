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

exports.httpPostVehicleAdd = function (req, res) {
  var obj = new Vehicle({
    name: req.body.name,
    veh_type: req.body.veh_type,
    veh_category: req.body.veh_category,
    contact_name: req.body.contact_name,
    phone: req.body.phone
  });
  obj.save(function(err) {
    if (err) {
      res.end(JSON.stringify({ok: false, response: '保存失败:' + err}));
    } else {
      res.end(JSON.stringify({ok: true}));
    }
  });
};

exports.httpPostVehicleModify = function (req, res) {
  modify(req, res, Vehicle, {name: req.body.name});
};

exports.httpPostVehicleDelete = function (req, res) {
  var name = req.body.name;
  var qobj = {
    $or : [
      { vehicle_vessel_name: name },
      {"bills.vehicles.veh_name": {$all: [name]}}
    ]
  };

  Inv.find(qobj).select('waybill_no').exec(function(err, invs) {
    if (err) {
      res.end(JSON.stringify({ok: false, response: '不能删除!'}));
    } else if (invs && invs.length) {
      res.end(JSON.stringify({ok: false, response: '不能删除！此车船号已经被运单使用'}));
    } else {
      remove(req, res, Vehicle, {name: name});
    }
  })
};

exports.httpGetCompany = function (req, res) {
  initRender(req, res, Company, 'datamgt/company', '发货单位管理', '发货单位', 'company');
};

exports.httpPostCompanyAdd = function (req, res) {
  var obj = new Company({
    name: req.body.name,
    customers: req.body.customers,
    contact_name: req.body.contact_name,
    phone: req.body.phone,
    address: req.body.address
  });
  obj.save(function(err) {
    if (err) {
      res.end(JSON.stringify({ok: false, response: '保存失败:' + err}));
    } else {
      res.end(JSON.stringify({ok: true}));
    }
  });
};

exports.httpPostCompanyModify = function (req, res) {
  modify(req, res, Company, {name: req.body.name});
};

exports.httpPostCompanyDelete = function (req, res) {
  var name = req.body.name;
  Bill.find({billing_name: name}).select('billing_name').exec(function(err, bills) {
    if (err) {
      res.end(JSON.stringify({ok: false, response: '不能删除!'}));
    } else if (bills && bills.length) {
      res.end(JSON.stringify({ok: false, response: '不能删除！存在此发货单位的提单。'}));
    } else {
      remove(req, res, Company, {name: name});
    }
  })
};

exports.httpGetWarehouse = function (req, res) {
  initRender(req, res, Warehouse, 'datamgt/warehouse', '仓库管理', '仓库', 'warehouse');
};

exports.httpPostWarehouseAdd = function (req, res) {
  var obj = new Warehouse({
    name: req.body.name,
    contact_name: req.body.contact_name,
    phone: req.body.phone,
    address: req.body.address
  });
  obj.save(function(err) {
    if (err) {
      res.end(JSON.stringify({ok: false, response: '保存失败:' + err}));
    } else {
      res.end(JSON.stringify({ok: true}));
    }
  });
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

exports.httpPostDestinationAdd = function (req, res) {
  var obj = new Destination({
    name: req.body.name,
    contact_name: req.body.contact_name,
    phone: req.body.phone,
    address: req.body.address
  });
  obj.save(function(err) {
    if (err) {
      res.end(JSON.stringify({ok: false, response: '保存失败:' + err}));
    } else {
      res.end(JSON.stringify({ok: true}));
    }
  });
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

exports.httpPostBrandAdd = function (req, res) {
  var obj = new Brand({
    name: req.body.name
  });
  obj.save(function(err) {
    if (err) {
      res.end(JSON.stringify({ok: false, response: '保存失败:' + err}));
    } else {
      res.end(JSON.stringify({ok: true}));
    }
  });
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

exports.httpPostSaleDepAdd = function (req, res) {
  var obj = new SaleDep({
    name: req.body.name
  });
  obj.save(function(err) {
    if (err) {
      res.end(JSON.stringify({ok: false, response: '保存失败:' + err}));
    } else {
      res.end(JSON.stringify({ok: true}));
    }
  });
};

exports.httpPostSaleDepModify = function (req, res) {
  modify(req, res, SaleDep, {name: req.body.name});
};

exports.httpPostSaleDepDelete = function (req, res) {
  remove(req, res, SaleDep, {name: req.body.name});
};

function initRender(req, res, table, route, page_name, sm_page_name, operObject) {
  table.find({}).sort({name: 'asc'}).exec(function (err, result) {
    if (err) {
      req.flash('errors', err);
      res.render(route, {
        title: '数据字典',
        curr_page: page_name,
        curr_page_name: sm_page_name
      });
    } else {
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
    }
  });
}

function add(res, dataObj) {
  dataObj.save(function(err) {
    if (err) {
      res.end(JSON.stringify({ok: false, response: '保存失败:' + err}));
    } else {
      res.end(JSON.stringify({ok: true}));
    }
  });
}

function modify(req, res, table, query) {
  table.findOne(query).exec(function (err, result) {
    if (err) {
      req.flash('errors', err);
      res.end(JSON.stringify({ok: false, response: '数据库没找到!' + err}));
    } else {
      console.log('result;' + result);
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

      result.save(function(err) {
        if (err) {
          res.end(JSON.stringify({ok: false, response: '失败:' + err}));
        } else {
          res.end(JSON.stringify({ok: true}));
        }
      });
    }
  });
}

function remove(req, res, table, query) {
  table.remove(query, function (err) {
    if (err) {
      req.flash('errors', err);
      res.end(JSON.stringify({ok: false, response: '数据库没找到!' + err}));
    } else {
      res.end(JSON.stringify({ok: true}));
    }
  });
}


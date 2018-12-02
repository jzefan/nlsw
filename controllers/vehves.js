/**
 * Created by ezefjia on 2015/5/9.
 */

var Vehicle = require('../models/Vehicle');
var VehVesCost = require('../models/VesselCost');
var utils = require('./utils');

exports.getVehVesMgt = function (req, res) {
  if (req.user.privilege[2] !== '1') {
    res.status(404);
    res.render('404');
  }
  else {
    Vehicle.find({veh_category:'自有'}).exec(function (err, vehs) {
      if (err) {
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
      else {
        var vehList = [];
        vehs.forEach(function (veh) {
          if (veh.veh_type === '车') {
            vehList.push(veh.name);
          }
        });

        var vehicles = [];
        VehVesCost.find({vv_type:'che'}).select('name').sort({month: 'asc'}).exec(function(err, vvc) {
          if (!err) {
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
          }
        })
      }
    });
  }
};

exports.getVFCData = function(req, res) {
  var query = req.query;
  var b1 = (query.fDate1 && query.fDate2);
  var b2 = utils.isExist(query.fVVName);
  console.log(query);

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

  VehVesCost.find(qObj).sort({month: 'asc'}).exec(function(err, vvcList) {
    if (err) {
      res.end(JSON.stringify({ ok: false, response: err }));
    }
    else {
      res.end(JSON.stringify({ ok: true, vvcList: vvcList }));
    }
  })
};

exports.getOneVFCData = function(req, res) {
  var query = req.query;
  VehVesCost.findOne({name: query.fName, month: query.fMonth}, function(err, vvc) {
    if (err || !vvc) {
      res.end(JSON.stringify({ ok: false, response: err }));
    }
    else {
      res.end(JSON.stringify({ ok: true, vvc: vvc }));
    }
  })
};

exports.postOneVFCData = function(req, res) {
  var data = req.body;
  VehVesCost.findOne({name: data.name, month: data.month}, function(err, dbVVCost) {
    if (err) {
      res.end(JSON.stringify({ ok: false, response: err }));
    }
    else {
      if (!dbVVCost) {
        dbVVCost = new VehVesCost(data);
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

      dbVVCost.save(function (err) {
        if (err) {
          var s = '保存出错！(车船号:' + data.name + ', 月份:' + data.month + ', 原因:' + err;
          res.end(JSON.stringify({ ok: false, response: s }));
        } else {
          res.end(JSON.stringify({ ok: true }));
        }
      });
    }
  })
};

exports.postDeleteVFCData = function(req, res) {
  var data = req.body;
  if (data.name && data.month) {
    VehVesCost.remove({name: data.name, month: data.month}, function(err, vvc) {
      if (err) {
        console.error('remove vehves cost error! %s', err);
        res.end(JSON.stringify({ ok: false, response: '删除车船固定记录出错:' + err }));
      } else {
        res.end(JSON.stringify({ ok: true }));
      }
    })
  } else {
    res.end(JSON.stringify({ ok: false, response: 'Data not correct'}));
  }
};

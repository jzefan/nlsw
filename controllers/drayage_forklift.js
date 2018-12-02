/**
 * Created by ezefjia on 2015/7/6.
 */

var Vehicle = require('../models/Vehicle');
var DrayageForklift = require('../models/DrayageForklift');
var utils = require('./utils');

exports.getDFMgt = function (req, res) {
  DrayageForklift.find({}).sort({month: 'asc'}).exec(function(err, dfc) {
    res.render('statistics/drayage_forklift_mgt', {
      title: '短驳/叉车应收款',
      curr_page: '短驳/叉车应收款管理',
      curr_page_name: '短驳/叉车应收款',
      dData: dfc,

      scripts: [
        '/js/plugins/select2/select2.min.js',
        '/js/plugins/select2/select2_locale_zh-CN.js',
        '/js/df_receivables_mgt.js'
      ]
    });
  })
};

exports.getVFCData = function(req, res) {
  var query = req.query;
  var b1 = (query.fDate1 && query.fDate2);
  var b2 = utils.isExist(query.fVVName);
  //console.log(query);

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

  DrayageForklift.find(qObj).sort({month: 'asc'}).exec(function(err, vvcList) {
    if (err) {
      res.end(JSON.stringify({ ok: false, response: err }));
    }
    else {
      res.end(JSON.stringify({ ok: true, vvcList: vvcList }));
    }
  })
};

exports.getOneDfData = function(req, res) {
  var query = req.query;
  DrayageForklift.findOne({month: query.month}, function(err, vvc) {
    if (err || !vvc) {
      res.end(JSON.stringify({ ok: false, response: err }));
    }
    else {
      res.end(JSON.stringify({ ok: true, vvc: vvc }));
    }
  })
};

exports.postOneDfData = function(req, res) {
  var data = req.body;
  DrayageForklift.findOne({month: data.month}, function(err, dbVVCost) {
    if (err) {
      res.end(JSON.stringify({ ok: false, response: err }));
    }
    else {
      if (!dbVVCost) {
        dbVVCost = new DrayageForklift({
          month: data.month,
          drayage: data.drayage,
          forklift: data.forklift
        });
      } else {
        dbVVCost.drayage = data.drayage;
        dbVVCost.forklift = data.forklift;
      }

      dbVVCost.save(function (err) {
        if (err) {
          var s = '保存出错！月份:' + data.month + ', 原因:' + err;
          res.end(JSON.stringify({ ok: false, response: s }));
        } else {
          res.end(JSON.stringify({ ok: true }));
        }
      });
    }
  })
};

exports.postDeleteDfData = function(req, res) {
  var data = req.body;
  if (data.month) {
    DrayageForklift.remove({month: data.month}, function(err, vvc) {
      if (err) {
        res.end(JSON.stringify({ ok: false, response: '删除记录出错:' + err }));
      } else {
        res.end(JSON.stringify({ ok: true }));
      }
    })
  } else {
    res.end(JSON.stringify({ ok: false, response: 'Data not correct'}));
  }
};

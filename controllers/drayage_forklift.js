/**
 * Created by ezefjia on 2015/7/6.
 */

var Vehicle = require('../models/Vehicle');
var DrayageForklift = require('../models/DrayageForklift');
var utils = require('./utils');

exports.getDFMgt = async function (req, res) {
  try {
    const dfc = await DrayageForklift.find({}).sort({month: 'asc'}).exec();
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
  } catch (err) {
    // Handle error, maybe render an error page or the same page with an error message
    res.status(500).send(err.message);
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
    const vvcList = await DrayageForklift.find(qObj).sort({month: 'asc'}).exec();
    res.json(JSON.stringify({ ok: true, vvcList: vvcList }));
  } catch (err) {
    res.end(JSON.stringify({ ok: false, response: err }));
  }
};

exports.getOneDfData = async function(req, res) {
  var query = req.query;
  try {
    const vvc = await DrayageForklift.findOne({month: query.month}).exec();
    if (!vvc) {
      res.end(JSON.stringify({ ok: false }));
    } else {
      res.json(JSON.stringify({ ok: true, vvc: vvc }));
    }
  } catch (err) {
    res.end(JSON.stringify({ ok: false, response: err }));
  }
};

exports.postOneDfData = async function(req, res) {
  var data = req.body;
  try {
    let dbVVCost = await DrayageForklift.findOne({month: data.month}).exec();
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
    await dbVVCost.save();
    res.end(JSON.stringify({ ok: true }));
  } catch (err) {
    var s = '保存出错！月份:' + data.month + ', 原因:' + err;
    res.end(JSON.stringify({ ok: false, response: s }));
  }
};

exports.postDeleteDfData = async function(req, res) {
  var data = req.body;
  if (data.month) {
    try {
      await DrayageForklift.deleteMany({month: data.month}).exec();
      res.end(JSON.stringify({ ok: true }));
    } catch (err) {
      res.end(JSON.stringify({ ok: false, response: '删除记录出错:' + err }));
    }
  } else {
    res.end(JSON.stringify({ ok: false, response: 'Data not correct'}));
  }
};
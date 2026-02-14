/**
 * GET /
 * Home page.
 */
var Bill = require('../models/Bill');
var Invoice = require('../models/Invoice');
var utils = require('./utils');
var User = require('../models/User');
var fs = require('fs');
var secrets = require('../config/secrets');
var { validationResult } = require('express-validator');

exports.index = async function (req, res) {
  if (req.headers.accept && req.headers.accept.indexOf('application/json') > -1) {
    if (!req.user) return res.json({ user: null });
    var html = fs.readFileSync("views/post.html", "UTF-8");
    return res.json({ 
       user: { 
         userid: req.user.userid, 
         name: req.user.profile.name,
         privilege: req.user.privilege
       },
       dHtmlText: html
    });
  }

  if (!(req.user)) {
    return res.redirect('/login');
  } else {
    if (!(req.user.no)) {
      var uid = req.user.userid;
      try {
        const users = await User.find({}).sort({no: 'desc'}).exec();
        var max = 0;
        if (!users || users.length === 0 || isNaN(users[0].no)) {
          max = (users ? users.length : 0) + 1;
        } else {
          max = users[0].no + 1;
        }
        await User.updateOne({userid: uid}, { $set: {no : max}});
        console.log('更新顺序号成功!');
      } catch (err) {
        console.log('UpdateUserNo: 错误' + err);
      }
    }
  }

  var html	= fs.readFileSync("views/post.html", "UTF-8");
  res.render('home', {
    title: 'Home',
    curr_page: '欢迎进入' + secrets.companyName + '管理系统',
    curr_page_name: '欢迎',
//    carousel_width: 1079,
    dHtmlText: html,
    scripts: [
      'js/plugins/ckeditor/ckeditor.js', 'js/plugins/ckeditor/lang/zh-cn.js'
//      'js/plugins/holder.js'
    ]
  });
};

exports.postSubmitNews = function(req, res) {
  var data = req.body;
  var html	= fs.readFileSync("views/post.html", "UTF-8");
  fs.writeFileSync("views/post.html", data.html +  "\n" + html);
  res.end(JSON.stringify({ok: true}));
};

exports.postUpdateNews = function(req, res) {
  var data = req.body;
  fs.writeFileSync("views/post.html", data.html);
  res.end(JSON.stringify({ok: true}));
};

exports.search = async function (req, res) {
  var errors = validationResult(req);

  if (!errors.isEmpty()) {
    req.flash('errors', errors.array());
    return res.redirect('/');
  }

  var query_text = req.query.q;
  if (query_text.length > 0) {
    var reg = new RegExp(query_text, 'gi');

    try {
      const bills = await Bill.find()
        .or([
          {'order_no': {$regex: reg}},
          {'bill_no': {$regex: reg}}
        ])
        .exec();

      if (bills.length) {
        res.render('home', {
          title: 'Search',
          curr_page: '查询提单记录里订单号或提单号中包含"' + query_text + '"的结果.',
          curr_page_name: '简单查询',
          bShowDataTable: true,
          bShowTableTools: true,
          simple_query_result: bills,
          scripts: [
            '/js/plugins/datatables/jquery.dataTables.min.js',
            '/js/plugins/datatables/TableTools/dataTables.tableTools.min.js'
          ]
        });
      } else {
        const invoices = await Invoice.find({'waybill_no': {$regex: reg}}).exec();
        if (invoices.length) {
          invoices.forEach(function (inv) {
            if (inv.ship_date) {
              inv.ship_date_str = inv.ship_date.yyyymmdd();
            }

            inv.bills.forEach(function (subfill) {
              //
            })
          });

          res.render('home', {
            title: 'Search',
            curr_page: '查询运单记录中在运单号中包含"' + query_text + '"的结果.',
            curr_page_name: '简单查询',
            bShowDataTable: true,
            bShowTableTools: true,
            bWaybillSearch: true,
            simple_query_result: invoices,
            scripts: [
              '/js/plugins/datatables/jquery.dataTables.min.js',
              '/js/plugins/datatables/TableTools/dataTables.tableTools.min.js'
            ]
          });
        } else {
          var m = '无数据：数据库中不存在订单号或提单号中或运单记录中运单号包含' + query_text + '的记录!';
          req.flash('errors', { msg: m });
          res.render('home', {
            title: 'Search',
            curr_page: '在订单号或提单号中查询"' + query_text + '"的结果.',
            curr_page_name: '简单查询'
          });
        }
      }
    } catch (err) {
      req.flash('errors', err);
      return res.redirect('/');
    }
  } else {
    res.redirect('/');
  }
}

/**
 * Created by ezefjia on 2015/1/2.
 */

$(function () {
  "use strict";

  var dbDictData = local_data;
  var bfCustomerSelect = $('#bf-customer');
  var startDateGrp     = $('#start-date-grp');
  var endDateGrp       = $('#end-date-grp');
  var iStartDate       = $('#start-date');
  var iEndDate         = $('#end-date');
  var iBillNo          = $('#bf-bill-no');
  var iOrderNo         = $('#bf-order-no');
  var tableBody        = $('#table-tbody');
  var tableHead        = $('#table-thead');
  var btnExport        = $('#search-export');
  var ckDestForVessel  = $('#to-ship-vessel');
  var ckShowNotSent    = $('#show-not-sent');
  var bfVehicleMode    = $('#bf-vehicle-mode');
  var bfVehicle = $('#bf-vehicle');
  var bfBillName = $('#bf-bill-name');
  var bfDest = $('#bf-destination');

  var totNum, totWeight;
  var currDBData = [];
  var sDate, eDate;

  var vehicleList = sort_pinyin(dbDictData.vehicles);
  var destList = sort_pinyin(dbDictData.destination);
  var billNameList = sort_pinyin(getAllList(false, dbDictData.company, "name"));

  unselected(bfVehicleMode);

  /*
  var billNameFilter = new FilterElementD($('#bf-bill-name'), billNameList, true, false,
    function (selected) {
      var allCusters = [];
      selected.forEach(function (sel_name) {
        for (var i = 0, l = dbDictData.company.length; i < l; ++i) {
          var company = dbDictData.company[i];
          if (company.name === sel_name) {
            allCusters.push.apply(allCusters, company.customers);
            break;
          }
        }
      });

      initSelect(bfCustomerSelect, sort_pinyin(allCusters), true);
      // bfCustomerSelect.select2();
    });
    */

  //var vehicleFilter = new FilterElementD($('#bf-vehicle'), vehicleList, false, true, null);
  //var destFilter = new FilterElementD($('#bf-destination'), destList, false, true, null);

  initSelect(bfVehicle, vehicleList, false);
  bfVehicle.select2();

  initSelect(bfBillName, billNameList, false);
  bfBillName.select2();

  initSelect(bfDest, destList, false);
  bfDest.select2();

  elementEventRegister(bfBillName, 'change', function() {
    var name = bfBillName.val();
    var allCusters = [];
    name && name.forEach(function (sel_name) {
      for (var i = 0, l = dbDictData.company.length; i < l; ++i) {
        var company = dbDictData.company[i];
        if (company.name === sel_name) {
          allCusters.push.apply(allCusters, company.customers);
          break;
        }
      }
    });

    initSelect(bfCustomerSelect, sort_pinyin(allCusters), true);

    if (name || name.includes('南京钢铁集团国际经济贸易有限公司')) {
      setDateGrpMinMaxRange(startDateGrp, endDateGrp)
    }
  })

  // initialize table sorter
  $.extend($.tablesorter.defaults, { theme: 'blue' });
  $('#query-table').tablesorter({widgets:['stickyHeaders']});

  elementEventRegister($('#filter'), 'click', function() { $('#filter-ui').toggle(); });
  elementEventRegister(btnExport, 'click', function() {
    var columns = ["已配发结算状态", "提单状态", "订单号", "提单号", "开单名称", "车船号", "目的地", "发运块数", "发运重量", "客户单价", "南钢单价", "应付单价", "发货日期", "发货人", "运单号", "发货仓库", "牌号", "规格", "尺寸", "总块数", "总重量", "合同号", "销售部门", "创建日期", "创建人"]
    if (local_user.privilege !== '11111111') {
      columns = ["已配发结算状态", "提单状态", "订单号", "提单号", "开单名称", "车船号", "目的地", "发运块数", "发运重量", "发货日期", "发货人", "运单号", "发货仓库", "牌号", "规格", "尺寸", "总块数", "总重量", "合同号", "销售部门", "创建日期", "创建人"]
    }
    var data = []
    if (showNotSent) {
      currDBData.forEach(function(bill) {
        var w = (bill.block_num > 0 ? (bill.left_num * bill.weight) : bill.left_num);
        if (local_user.privilege === '11111111') {
          data.push([
            '', getStrByStatus(bill.status, bill.status), getOrder(bill.order_no, bill.order_item_no), bill.bill_no, bill.billing_name,
            '', '', 0, 0, getStrValue(w), '', '', '', '', '',
            bill.ship_warehouse ? bill.ship_warehouse : '', bill.brand_no ? bill.brand_no.replace(/,/g, '，') : "",
            bill.thickness + '*' + bill.width + '*' + bill.len,
            bill.size_type, bill.block_num, getStrValue(bill.total_weight),
            bill.contract_no ? bill.contract_no : '',
            bill.sales_dep ? bill.sales_dep : '',
            date2Str(bill.create_date), bill.creater ? bill.creater : ''
          ])
        } else {
          data.push([
            '', getStrByStatus(bill.status, bill.status), getOrder(bill.order_no, bill.order_item_no), bill.bill_no, bill.billing_name,
            '', '', 0, 0, getStrValue(w), '', '', 
            bill.ship_warehouse ? bill.ship_warehouse : '', bill.brand_no ? bill.brand_no.replace(/,/g, '，') : "",
            bill.thickness + '*' + bill.width + '*' + bill.len,
            bill.size_type, bill.block_num, getStrValue(bill.total_weight),
            bill.contract_no ? bill.contract_no : '',
            bill.sales_dep ? bill.sales_dep : '',
            date2Str(bill.create_date), bill.creater ? bill.creater : ''
          ])
        }
      })
    } else {
      currDBData.forEach(function (bill) {
        var settleState = "";
        if (bill.inv_settle_flag === 0) {
          if (bill.collection_price < 0 && bill.price < 0) {
            settleState = '客户，代收都不需要结算';
          } else if (bill.collection_price < 0) {
            settleState = '客户未结算，代收不需要结算';
          } else {
            settleState = '客户，代收都未结算';
          }
        } else if (bill.inv_settle_flag === 1) {
          if (bill.collection_price < 0) {
            settleState = '客户已结算，代收不需要结算 - ' + bill.status_2;
          } else {
            settleState = "客户已结算，代收未结算 - " + bill.status_2;
          }
        } else if (bill.inv_settle_flag === 2) {
          if (bill.price < 0) {
            settleState = '客户不需要结算，代收已结算 - ' + bill.status_2;
          } else {
            settleState = "代收已结算，客户未结算 - " + bill.status_2;
          }
        } else if (bill.inv_settle_flag === 3) {
          settleState = "客户，代收付都已结算 - " + bill.status_2;
        }

        var name = (bill.ship_customer ? (bill.billing_name + "/" + bill.ship_customer) : bill.billing_name);
        if (local_user.privilege === '11111111') {
          data.push([
            settleState, bill.status, getOrder(bill.order_no, bill.order_item_no), bill.bill_no, name,
            bill.veh_ves_name, bill.ship_to, bill.send_num, getStrValue(bill.send_weight),
            getStrValue(bill.price),
            getStrValue(bill.collection_price),
            getStrValue(bill.veh_ves_price),
            date2Str(bill.inv_ship_date), bill.inv_shipper ? bill.inv_shipper : '', bill.inv_no ? bill.inv_no : "",
            bill.ship_warehouse ? bill.ship_warehouse : '', bill.brand_no ? bill.brand_no.replace(/,/g, '，') : "",
            bill.thickness + '*' + bill.width + '*' + bill.len,
            bill.size_type, bill.block_num, getStrValue(bill.total_weight),
            bill.contract_no ? bill.contract_no : '',
            bill.sales_dep ? bill.sales_dep : '',
              date2Str(bill.create_date), bill.creater ? bill.creater : ''
          ])
        } else {
          data.push([
            settleState, bill.status, getOrder(bill.order_no, bill.order_item_no), bill.bill_no, name,
            bill.veh_ves_name, bill.ship_to, bill.send_num, getStrValue(bill.send_weight),
            date2Str(bill.inv_ship_date), bill.inv_shipper ? bill.inv_shipper : '', bill.inv_no ? bill.inv_no : "",
            bill.ship_warehouse ? bill.ship_warehouse : '', bill.brand_no ? bill.brand_no.replace(/,/g, '，') : "",
            bill.thickness + '*' + bill.width + '*' + bill.len,
            bill.size_type, bill.block_num, getStrValue(bill.total_weight),
            bill.contract_no ? bill.contract_no : '',
            bill.sales_dep ? bill.sales_dep : '',
              date2Str(bill.create_date), bill.creater ? bill.creater : ''
          ])
        }
      })
    }

    excelExport({ fileName: '综合查询', suffix: 'csv', titles: columns, dataSource: data })
  })

  elementEventRegister($('#account-checking-export'), 'click', function() {
    if (currDBData.length) {
      var html = '<table><tr><th>状态</th><th>订单号</th><th>提单号</th><th>开单名称</th><th>车船号</th><th>目的地</th><th>发运块数</th><th>发运重量</th><th>总块数</th><th>总重量</th><th>发货日期</th><th>发货人</th><th>运单号</th><th>发货仓库</th><th>牌号</th><th>厚</th><th>宽</th><th>长</th><th>尺寸</th><th>合同号</th><th>销售部门</th><th>创建日期</th><th>创建人</th><th>结算状态</th></tr>';
      var thead = ["状态","订单号","提单号","开单名称","车船号","目的地","发运块数","发运重量","总块数","总重量","发货日期","发货人","运单号","发货仓库","牌号","厚","宽","长","尺寸","合同号","销售部门","创建日期","创建人","结算状态"];
      var str = '<tr>';
      for (var i = 0, len = thead.length; i < len; ++i) {
        str += "<td>{" + i + "}</td>";
      }
      str += "</tr>";

      if (showNotSent) {
        currDBData.forEach(function (bill) {
          var w = (bill.block_num > 0 ? (bill.left_num * bill.weight) : bill.left_num);
          html += str.format(getStrByStatus(bill.status, bill.status), getOrder(bill.order_no, bill.order_item_no), bill.bill_no, bill.billing_name,
            '', '', 0, getStrValue(w), '', '', '',
            bill.ship_warehouse ? bill.ship_warehouse : '', bill.brand_no ? bill.brand_no : "",
            getStrValue(bill.thickness), getStrValue(bill.width), getStrValue(bill.len), bill.size_type, bill.block_num, getStrValue(bill.total_weight),
            bill.contract_no ? bill.contract_no : '', bill.sales_dep ? bill.sales_dep : '',
            date2Str(bill.create_date), bill.creater ? bill.creater : '', '');
          //totWeight += w;
        });
      } else {
        var prevBill = null;
        var same = false;
        for (i = 0, len = currDBData.length; i < len; ++i) {
          var bill = currDBData[i];
          var settleState = "";
          if (bill.settle_flag === 0) {
            settleState = "未结算";
          } else if (bill.settle_flag === 1) {
            settleState = "客户结算";
          } else if (bill.settle_flag === 2) {
            settleState = "代收付结算";
          } else if (bill.settle_flag === 3) {
            settleState = "客户,代收付结算";
          }

          var name = (bill.ship_customer ? (bill.billing_name + "/" + bill.ship_customer) : bill.billing_name);
          same = (!!prevBill && sameBill(prevBill, bill));

          if (!same && prevBill && prevBill.left_num > 0) {
            var left = prevBill.block_num > 0 ? prevBill.left_num * prevBill.weight : prevBill.left_num;
            html += str.format(getStrByStatus(prevBill.status, prevBill.status), getOrder(prevBill.order_no, prevBill.order_item_no), prevBill.bill_no, name,
              '', '', '0', '0', prevBill.block_num, getStrValue(left), '', '', '',
              prevBill.ship_warehouse ? prevBill.ship_warehouse : '', prevBill.brand_no ? prevBill.brand_no : "",
              getStrValue(prevBill.thickness), getStrValue(prevBill.width), getStrValue(prevBill.len), prevBill.size_type,
              prevBill.contract_no ? prevBill.contract_no : '', prevBill.sales_dep ? prevBill.sales_dep : '',
              date2Str(prevBill.create_date), prevBill.creater ? prevBill.creater : '', settleState);
          }

          var tWeight = 0;
          if (!same) {
            if (bill.block_num > 0) {
              if (bill.left_num !== bill.block_num) {
                tWeight = (bill.block_num - bill.left_num) * bill.weight;
              } else {
                tWeight = bill.total_weight;
              }
            } else {
              if (bill.left_num !== bill.total_weight) {
                tWeight = bill.total_weight - bill.left_num;
              } else {
                tWeight = bill.total_weight;
              }
            }
          }

          html += str.format(getStrByStatus(bill.status, bill.status), getOrder(bill.order_no, bill.order_item_no), bill.bill_no, name,
            bill.veh_ves_name, bill.ship_to, bill.send_num, getStrValue(bill.send_weight), bill.block_num, getStrValue(tWeight),
            date2Str(bill.inv_ship_date), bill.inv_shipper ? bill.inv_shipper : '', bill.inv_no ? bill.inv_no : "",
            bill.ship_warehouse ? bill.ship_warehouse : '', bill.brand_no ? bill.brand_no : "",
            getStrValue(bill.thickness), getStrValue(bill.width), getStrValue(bill.len), bill.size_type,
            bill.contract_no ? bill.contract_no : '', bill.sales_dep ? bill.sales_dep : '',
            date2Str(bill.create_date), bill.creater ? bill.creater : '', settleState);

          prevBill = bill;
        }
      }

      tableToExcel(html, '对账数据', date2Str(new Date()) + ".xls");
    }
  });

  startDateGrp.datetimepicker(getDateTimePickerOptions()).on('dp.change', function(e) {
    sDate = e.date.startOf('day');
    endDateGrp.data("DateTimePicker").setMinDate(e.date);
  });
  endDateGrp.datetimepicker(getDateTimePickerOptions()).on('dp.change', function(e) {
    eDate = e.date.endOf('day');
    startDateGrp.data("DateTimePicker").setMaxDate(e.date);
  });

  var edate = moment();
  var sdate = moment().subtract(1, 'months');
  var startGrp = startDateGrp.datetimepicker(getDateTimePickerOptions());
  var endGrp = endDateGrp.datetimepicker(getDateTimePickerOptions());
  endDateGrp.data("DateTimePicker").setDate(edate);
  startDateGrp.data("DateTimePicker").setDate(sdate);

  // 设置只能查询一年以内的数据
  if (local_user.privilege === '11111111') {
    setDateGrpMinMaxRange(startDateGrp, endDateGrp, 120);
  } else {
    setDateGrpMinMaxRange(startDateGrp, endDateGrp);
  }
  // setDateGrpMinMaxRange(startDateGrp, endDateGrp);

  var showDestForVessel = false;
  ckDestForVessel.iCheck('uncheck');
  ckDestForVessel.on('ifChecked', function() { showDestForVessel = true; });
  ckDestForVessel.on('ifUnchecked', function() { showDestForVessel = false; });

  var showNotSent = false;
  ckShowNotSent.iCheck('uncheck');
  ckShowNotSent.on('ifChecked', function() {
    showNotSent = true;
    showNotSentButtonsEnabled();
  });
  ckShowNotSent.on('ifUnchecked', function() {
    showNotSent = false;
    showNotSentButtonsEnabled();
  });

  function showNotSentButtonsEnabled() {
    setHtmlElementDisabled(bfVehicle, showNotSent);
    //vehicleFilter.disabled(showNotSent);
    // destFilter.disabled(showNotSent);
    setHtmlElementDisabled(bfDest, showNotSent);
    if (showNotSent) {
      ckDestForVessel.iCheck('disable');
      setHtmlElementDisabled(iStartDate, true);
      setHtmlElementDisabled(iEndDate, true);
      setHtmlElementDisabled(bfCustomerSelect, true);
      $('#head-weight').text('未配发重量');
      setHtmlElementDisabled(bfVehicleMode, true);
      //$('#lb-send-weight').text('未配发重量');
      showHtmlElement($('#lb-send-num'), false);
    } else {
      ckDestForVessel.iCheck('enable');
      setHtmlElementDisabled(iStartDate, false);
      setHtmlElementDisabled(iEndDate, true);
      setHtmlElementDisabled(bfCustomerSelect, false);
      $('#head-weight').text('发运重量');
      //$('#lb-send-weight').text('发运重量');
      showHtmlElement($('#lb-send-num'), true);
      setHtmlElementDisabled(bfVehicleMode, false);
    }
  }

  $('#query-ok').on('click', function() {
    var d1 = iStartDate.val();
    var d2 = iEndDate.val();
    var b = !isEmpty(d1) && !isEmpty(d2);
    var obj = {
      fName: bfBillName.val(), //  billNameFilter.selected,
      fVeh: bfVehicle.val(), //vehicleFilter.selected,
      fVehMode: bfVehicleMode.val(),
      fDest: bfDest.val(), // destFilter.selected,
      fDate1: b ? sDate.toISOString() : null,
      fDate2: b ? eDate.toISOString(): null,
      fBno: iBillNo.val(),
      fOrder: iOrderNo.val(),
      fType: 'bill-first',
      fShowDestForVessel: showDestForVessel ? 1 : 0,
      fCustomerName: bfCustomerSelect.val(),
      fShowUnsend: 0
    };

    if (showNotSent) {
      obj.fVeh = [];
      obj.fDest = [];
      obj.fVehMode = '';
      obj.fShowDestForVessel = 0;
      obj.fCustomerName = null;
      obj.fShowUnsend = 1;
      obj.fDate1 = null;
      obj.fDate2 = null;
    } else {
      // if (billNameFilter.selectNone() && !bfVehicle.val() && destFilter.selectNone() && !b && !obj.fBno && !obj.fOrder) {
      if (!bfBillName.val() && !bfVehicle.val() && !bfDest.val() && !b && !obj.fBno && !obj.fOrder) {
        currDBData = [];
        resetTable(currDBData);
        return; // Empty condition, return directly.
      }
    }

    nlApp.setTitle('获取数据...');
    nlApp.showPleaseWait();
    $.get('/get_invoices_bill', obj, function(data) {
      currDBData = [];
      if (data.ok) {
        currDBData = data.bills;
      } else {
        //vehicleFilter.rebuild(vehicleList, null);
        // destFilter.rebuild(destList, null);
      }

      resetTable(currDBData);
      nlApp.hidePleaseWait();
    })
  });

  function resetTable(bills) {
    tableBody.empty();
    totNum = 0;
    totWeight = 0;

    var str = '<tr>';
    var len = tableHead.find("th").length;
    for (var i = 0; i < len; ++i) {
      str += "<td>{" + i + "}</td>";
    }
    str += "</tr>";

    if (showNotSent) {
      for (var i = 0; i < bills.length; ++i) {
        var bill = bills[i];
        var w = (bill.block_num > 0 ? (bill.left_num * bill.weight) : bill.left_num);
        if (i < 500) {
          tableBody.append(str.format('', getStrByStatus(bill.status, bill.status), getOrder(bill.order_no, bill.order_item_no), bill.bill_no, bill.billing_name,
            '', '', 0, 0, getStrValue(w), '', '', '', '', '',
            bill.ship_warehouse ? bill.ship_warehouse : '', bill.brand_no ? bill.brand_no : "",
            bill.thickness + '*' + bill.width + '*' + bill.len,
            bill.size_type, bill.block_num, getStrValue(bill.total_weight),
            bill.contract_no ? bill.contract_no : '',
            bill.sales_dep ? bill.sales_dep : '',
            date2Str(bill.create_date), bill.creater ? bill.creater : ''));
        }
        totWeight += w;
      }
    } else {
      for (var i = 0; i < bills.length; ++i) {
        var bill = bills[i];
        if (i < 500) {
          var settleState = "";
          if (bill.inv_settle_flag === 0) {
            if (bill.collection_price < 0 && bill.price < 0) {
              settleState = '客户,代收都不需要结算';
            } else if (bill.collection_price < 0) {
              settleState = '客户未结算,代收不需要结算';
            } else {
              settleState = '客户,代收都未结算';
            }
          } else if (bill.inv_settle_flag === 1) {
            if (bill.collection_price < 0) {
              settleState = '客户已结算,代收不需要结算 - ' + bill.status_2;
            } else {
              settleState = "客户已结算,代收未结算 - " + bill.status_2;
            }
          } else if (bill.inv_settle_flag === 2) {
            if (bill.price < 0) {
              settleState = '客户不需要结算,代收已结算 - ' + bill.status_2;
            } else {
              settleState = "代收已结算,客户未结算 - " + bill.status_2;
            }
          } else if (bill.inv_settle_flag === 3) {
            settleState = "客户,代收付都已结算 - " + bill.status_2;
          }

          var name = (bill.ship_customer ? (bill.billing_name + "/" + bill.ship_customer) : bill.billing_name);
          tableBody.append(str.format(settleState, getStrByStatus(bill.status, bill.status), getOrder(bill.order_no, bill.order_item_no), bill.bill_no, name,
            bill.veh_ves_name, bill.ship_to, bill.send_num, getStrValue(bill.send_weight),
            getStrValue(bill.price),
            getStrValue(bill.collection_price),
            getStrValue(bill.veh_ves_price),
            date2Str(bill.inv_ship_date), bill.inv_shipper ? bill.inv_shipper : '', bill.inv_no ? bill.inv_no : "",
            bill.ship_warehouse ? bill.ship_warehouse : '', bill.brand_no ? bill.brand_no : "",
            bill.thickness + '*' + bill.width + '*' + bill.len,
            //getStrValue(bill.thickness), getStrValue(bill.width), getStrValue(bill.len),
            bill.size_type, bill.block_num, getStrValue(bill.total_weight),
            bill.contract_no ? bill.contract_no : '',
            bill.sales_dep ? bill.sales_dep : '',
            date2Str(bill.create_date), bill.creater ? bill.creater : ''));
        }

        totNum += bill.send_num;
        totWeight += bill.send_weight;
      }
      $('#lb-total-num').text(getStrValue(totNum));
    }

    $('#lb-total-weight').text(getStrValue(totWeight));
    if (bills.length > 500) {
      var len = `总${bills.length}行，暂显示500行,可以导出查看`;
      $('#curr-number').text(len);//tableBody.find("tr").length);
    } else {
      $('#curr-number').text(bills.length);//tableBody.find("tr").length);
    }

    if (local_user.privilege === '11111111') {
      $('td:nth-child(10),th:nth-child(10)').show();
      $('td:nth-child(11),th:nth-child(11)').show();
      $('td:nth-child(12),th:nth-child(12)').show();
    } else {
      $('td:nth-child(10),th:nth-child(10)').hide();
      $('td:nth-child(11),th:nth-child(11)').hide();
      $('td:nth-child(12),th:nth-child(12)').hide();
    }
    $('#query-table').show();
    //if (showNotSent) {
    //  $.extend($.tablesorter.defaults, { theme: 'blue' });
    //  $('#query-table').tablesorter({widgets:['stickyHeaders']});
    //
    //  $('td:nth-child(5),th:nth-child(5)').hide();
    //  $('td:nth-child(6),th:nth-child(6)').hide();
    //  $('td:nth-child(7),th:nth-child(7)').hide();
    //  $('td:nth-child(8),th:nth-child(8)').hide();
    //  $('td:nth-child(9),th:nth-child(9)').hide();
    //  $('td:nth-child(10),th:nth-child(10)').hide();
    //  $('td:nth-child(11),th:nth-child(11)').hide();
    //} else {
    //  $('td:nth-child(5),th:nth-child(5)').show();
    //  $('td:nth-child(6),th:nth-child(6)').show();
    //  $('td:nth-child(7),th:nth-child(7)').show();
    //  $('td:nth-child(8),th:nth-child(8)').show();
    //  $('td:nth-child(9),th:nth-child(9)').show();
    //  $('td:nth-child(10),th:nth-child(10)').show();
    //  $('td:nth-child(11),th:nth-child(11)').show();
    //}
    $("#query-table").trigger("update");
  }

  $('#adjust-data').on('click', function() {
    ajaxRequestHandle('/initial_settle_flag', 'POST', {}, '纠正数据', null);
  })
});

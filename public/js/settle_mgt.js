/**
 * Created by ezefjia on 12/4/2014.
 */

$(function () {
  "use strict";

  var tableBody        = $('#table-tbody');
  var btnCustomer      = $('#customer-btn');
  var btnCollection    = $('#collection-btn');
  var btnFilter        = $('#filter');
  var btnExport        = $('#search-export');
  var singlePriceInput = $('#single-price-input');
  var batchPriceInput  = $('#batch-price-input');
  var btnSettle        = $('#settle-bill');
  var btnNonSettle     = $('#non-settle-bill');

  var dbBills = [];
  var curr_bills = []; // 存放查询得到的所有提单
  var selected_bills = [];
  var curr_show_bills = [];

  var action = "CUSTOMER";

  var CUSTOMER_SETTLE_FLAG   = 1; // 0001
  var COLLECTION_SETTLE_FLAG = 2; // 0010

  var qFilter = new QueryFilterD(local_data, local_data_2, action, filterData);

  $('#first-th').html('<input id="select-all" type="checkbox" data-toggle="tooltip" data-placement="bottom" title="选择所有记录" />');
  enableButtons();
  showHtmlElement($('#lb-selected-group'), false);

  elementEventRegister(btnCustomer, 'click', function() {
    if (action != "CUSTOMER") {
      action = "CUSTOMER";
      btnCustomer.removeClass("btn-default");
      btnCustomer.addClass("btn-primary");
      btnCollection.removeClass("btn-primary");
      btnCollection.addClass("btn-default");
      qFilter.reset(action);
      showHintText();
    }
  });

  elementEventRegister(btnCollection, 'click', function() {
    if (action != "COLLECTION") {
      action = "COLLECTION";
      btnCollection.removeClass("btn-default");
      btnCollection.addClass("btn-primary");
      btnCustomer.removeClass("btn-primary");
      btnCustomer.addClass("btn-default");
      qFilter.reset(action);
      showHintText();
    }
  });

  elementEventRegister(singlePriceInput, 'click', function() {
    if (selected_bills.length === 1) {
      buildPriceDialog(selected_bills[0]);
    } else if (selected_bills.length > 1) {
      bootbox.alert("您选择了多行，请使用批量输入！");
    } else {
      bootbox.alert("请先选定某一行才能输入价格");
    }
  });

  elementEventRegister(batchPriceInput, 'click', function() {
    if (selected_bills.length) {
      if (action === 'COLLECTION') {
        buildBatchInputForCollection(selected_bills);
      } else {
        buildPriceBatchInputDialog(selected_bills);
      }
    } else {
      if (action === 'COLLECTION') {
        buildBatchInputForCollection(curr_show_bills);
      } else {
        buildPriceBatchInputDialog(curr_show_bills);
      }
    }
  });

  elementEventRegister($('#select-all'), 'click', function() {
    if (curr_show_bills.length > 0) {
      var checkBox = $('.select-bill');
      if (selected_bills.length === curr_show_bills.length) { // 之前已经选择
        checkBox.prop("checked", false);
        selected_bills = [];
        tableBody.find("tr").removeClass('invoice-highlighted');
      } else {
        checkBox.prop("checked", true);
        selected_bills = curr_show_bills.slice(0);
        tableBody.find("tr").addClass('invoice-highlighted');
      }
      enableButtons();
      showSelectedTotalValue();
    }
  });

  elementEventRegister(btnSettle, 'click', function() {
    if (selected_bills.length) {
      var allName = [];
      var shipToList = [];
      for (var i = 0; i < selected_bills.length; ++i) {
        var b = selected_bills[i];
        if (allName.indexOf(b.billing_name) < 0) {
          allName.push(b.billing_name);
          if (allName.length > 1) {
            bootbox.alert("您选择的提单中存在多个开单名称, 一次只能结算一个开单名称的提单");
            return;
          }
        }

        if (shipToList.indexOf(b.ship_to) < 0) {
          shipToList.push(b.ship_to);
        }

        if (action === "COLLECTION") {
          if (b.collection_price === -1) {
            bootbox.alert("您选择的提单:" + b.bill_no + "_" + b.order + " 已经确定为不需要结算!");
            return;
          } else if (b.collection_price === 0) {
            bootbox.alert("您选择的提单:" + b.bill_no + "_" + b.order + " 还没有完全输入价格,不能结算");
            return;
          }
        } else {
          if (b.price === -1) {
            bootbox.alert("您选择的提单:" + b.bill_no + "_" + b.order + " 已经确定为不需要结算!");
            return;
          } else if (b.price === 0) {
            bootbox.alert("您选择的提单:" + b.bill_no + "_" + b.order + " 还没有完全输入价格,不能结算");
            return;
          }
        }
      }

      var settleObj = [];
      var totPrice = 0;
      selected_bills.forEach(function(b) {
        if (action === "COLLECTION") {
          totPrice += b.collection_price * b.send_weight;
          b.inv_settle_flag |= COLLECTION_SETTLE_FLAG;
          b.settle_flag |= COLLECTION_SETTLE_FLAG;
        } else {
          totPrice += b.price * b.send_weight;
          b.inv_settle_flag |= CUSTOMER_SETTLE_FLAG;
        }

        settleObj.push({
          bid: b._id,
          inv_no: b.inv_no,
          num: b.send_num,
          weight: b.send_weight,
          settle_flag: b.inv_settle_flag // (action === "COLLECTION") ? b.settle_flag : b.inv_settle_flag
        });
      });

      var bname = (selected_bills[0].ship_customer ? (selected_bills[0].billing_name + "/" + selected_bills[0].ship_customer) : selected_bills[0].billing_name);
      setHtmlElementDisabled(btnSettle, true);
      ajaxRequestHandle('/settle_bill', 'POST',
        { settleObj: settleObj,
          price: totPrice,
          settle_type: action,
          billName: bname,
          shipTo: shipToList.join(",")
        }, '结算', function () {
          resetTableRow();
          setHtmlElementDisabled(btnSettle, false);
        });
    } else {
      bootbox.alert("请先选择您要结算的提单");
    }
  });

  function getNonSettleParamObj() {
    var res = [];
    if (action === "CUSTOMER") {
      selected_bills.forEach(function (b) {
        b.inv_settle_flag &= ~CUSTOMER_SETTLE_FLAG;
        b.price = -1;
        res.push({ bid: b._id, inv_no: b.inv_no });
      });
    } else {
      selected_bills.forEach(function (b) {
        b.inv_settle_flag &= ~COLLECTION_SETTLE_FLAG;
        b.collection_price = -1;
        res.push({ bid: b._id, inv_no: b.inv_no, settle_flag: b.inv_settle_flag });
      });
    }

    return res;
  }

  elementEventRegister(btnNonSettle, 'click', function() {
    if (selected_bills.length) {
      var hasPrice = false;
      var bothNotSettle = false;
      selected_bills.forEach(function(b) {
        if (action === "CUSTOMER") {
          if (b.price > 0) hasPrice = true;

          if (b.collection_price < 0) {
            bothNotSettle = true;
          }
        } else {
          if (b.collection_price > 0) hasPrice = true;

          if (b.price < 0) {
            bothNotSettle = true;
          }
        }
      });

      if (bothNotSettle) {
        if (local_user.privilege !== '11111111') {
          bootbox.alert('点击此不需要结算后，存在客户和代收代付都不需要结算的情况，你并没有相应权限，请联系管理员！');
        } else {
          bootbox.confirm('点击此不需要结算后，存在客户和代收代付都不需要结算的情况，确定不需要结算？', function() {
            var nonSettleObj = [];
            if (hasPrice) {
              bootbox.confirm("您选择的提单中已经输入过价格, 不结算后这些价格都会清除为0, 确认吗?", function(result) {
                if (result) {
                  nonSettleObj = getNonSettleParamObj();
                  ajaxRequestHandle('/collection_not_require_settle', 'POST',
                    { nonSettleObj: nonSettleObj, settle_type: action }, '不需结算', function () {
                      resetTableRow();
                    });
                }
              })
            } else {
              nonSettleObj = getNonSettleParamObj();
              ajaxRequestHandle('/collection_not_require_settle', 'POST',
                { nonSettleObj: nonSettleObj, settle_type: action }, '不需结算', function () {
                  resetTableRow();
                });
            }
          });
        }
      } else {
        var nonSettleObj = [];
        if (hasPrice) {
          bootbox.confirm("您选择的提单中已经输入过价格, 不结算后这些价格都会清除为0, 确认吗?", function (result) {
            if (result) {
              nonSettleObj = getNonSettleParamObj();
              ajaxRequestHandle('/collection_not_require_settle', 'POST',
                {nonSettleObj: nonSettleObj, settle_type: action}, '不需结算', function () {
                  resetTableRow();
                });
            }
          })
        } else {
          nonSettleObj = getNonSettleParamObj();
          ajaxRequestHandle('/collection_not_require_settle', 'POST',
            {nonSettleObj: nonSettleObj, settle_type: action}, '不需结算', function () {
              resetTableRow();
            });
        }
      }

    } else {
      bootbox.alert("请先选择您不打算进行结算的提单");
    }
  });

  elementEventRegister($('#update-bill'), 'click', function() {
    ajaxRequestHandle('/initial_settle_flag', 'POST', {}, '初始化数据', function () { });
  });

  var showNonSettle = false;
  var showHideNotSettle = $('#show-hide-non-settle');
  showHideNotSettle.iCheck('uncheck');
  showHideNotSettle.on('ifChecked', function() {
    showNonSettle = true;
    showHintText();
  });
  showHideNotSettle.on('ifUnchecked', function() {
    showNonSettle = false;
    showHintText();
  });

  ////////////////////////////////////////////////////////////////////////////////////////////////////////
  /// Function list
  ////////////////////////////////////////////////////////////////////////////////////////////////////////
  function enableButtons() {
    if (curr_show_bills.length) {
      setHtmlElementDisabled(btnExport, false);
      setHtmlElementDisabled(batchPriceInput, false);
    } else {
      setHtmlElementDisabled(btnExport, true);
      setHtmlElementDisabled(batchPriceInput, true);
    }

    if (selected_bills.length) {
      if (selected_bills.length === 1) {
        setHtmlElementDisabled(singlePriceInput, false);
      } else {
        setHtmlElementDisabled(singlePriceInput, true);
      }

      setHtmlElementDisabled(btnSettle, false);
      setHtmlElementDisabled(btnNonSettle, false);
    } else {
      setHtmlElementDisabled(btnSettle, true);
      setHtmlElementDisabled(btnNonSettle, true);
      setHtmlElementDisabled(singlePriceInput, true);
    }
  }

  function getPriceText(price) {
    var priceText = "";
    if (price > 0) {
      priceText = '<code style="color:green">' + getStrValue(price) + '</code>';
    } else if (price < 0) {
      priceText = '<code style="color:blue">不需要结算</code>';
    } else {
      priceText = '<code style="color:red">0</code>';
    }

    return priceText;
  }

  function updatePriceColumn(tr, bill) {
    tr.find("td").eq(1).html(getState(bill));
    tr.find("td").eq(7).html(getPriceText(action === "CUSTOMER" ? bill.price : bill.collection_price));
    //tr.popover('hide').attr('data-content', getBillTooltip(bill));
  }

  function buildPriceDialog(bill) {
    var id = "";
    var msg = '<div class="row form-horizontal"><div class="col-md-10">';
    var str = '<div class="form-group"><label for="{0}" class="control-label col-sm-4">{1}</label><div class="input-group col-sm-8"><input id="{2}" type="text" name="{3}" class="form-control" value="{4}"><span style="font-size: 11px">始发: {5}, 目的地: {6}</span></div></div>';
    if (action === 'COLLECTION') {
      id = bill.bill_no + '_' + bill.order;
      msg += str.format(id, '代收代付价格', id, id, getStrValue(bill.collection_price, "", ""));
    } else {
      if (bill.veh_ves_name) { // 正常有运单一定有运单车船，需要再检查？
        id = bill.inv_no;
        msg += str.format(id, bill.veh_ves_name, id, id, getStrValue(bill.price), bill.ship_from, bill.ship_to);
      }
    }
    msg += '</div>';

    bootbox.dialog({
      message: msg,
      title: "单行价格输入",
      buttons: {
        cancel: { label: "取消", className: "btn-default" },
        main:   { label: "确定", className: "btn-primary", callback: ok }
      }
    });

    function ok() {
      var obj = {
        bid : bill._id,
        inv_no: bill.inv_no,
        price: 0
      };
      var updated = false;
      var price = -1;
      if (action === 'COLLECTION') {
        price = getPriceValue(bill.bill_no + '_' + bill.order);
        if ((price >= 0 || price === -1) && bill.collection_price != price) {
          bill.collection_price = price;
          obj.price = price;
          updated = true;
        }
      } else {
        if (bill.veh_ves_name) {
          id = bill.inv_no;
          price = getPriceValue(id);
          if ((price >= 0 || price === -1) && bill.price != price) {
            bill.price = price;
            obj.price = price;
            updated = true;
          }
        }
      }

      if (updated) {
        ajaxRequestHandle('/price_input', 'POST', { data: [ obj ], act: action }, 'no_message', function() {
          var numOfRow = tableBody.find("tr").length;
          for (var i = 0; i < numOfRow; ++i) {
            var tr = getRowChildren(tableBody, i);
            var b = getTableCellChildren(tr, 3).text();
            var o = getTableCellChildren(tr, 2).text();
            var no = getTableCellChildren(tr, 13).text();
            if (bill.bill_no === b && getOrder(bill.order_no, bill.order_item_no) === o && bill.inv_no === no) {
              updatePriceColumn(tr, bill);
              break;
            }
          }
        });
      }
    }
  }

  function buildBatchInputForCollection(bills) {
    bootbox.dialog({
      message: '<div class="row form-horizontal"><div class="col-md-10"><div class="form-group"><label for="collection_00001" class="control-label col-sm-4">批量输入代收代付价格</label><div class="input-group col-sm-8"><input id="collection_00001" type="text" name="collection_00001" class="form-control"></div></div></div></div>',
      title: "批量价格输入",
      buttons: {
        cancel: { label: "取消", className: "btn-default" },
        main:   { label: "确定", className: "btn-primary", callback: function() {
          var price = getPriceValue("collection_00001");
          if (price >= 0 || price === -1) {
            var obj = [];
            bills.forEach(function(b) {
              b.collection_price = price;
              obj.push({
                bid : b._id,
                inv_no: b.inv_no,
                price: price
              })
            });
            ajaxRequestHandle('/price_input', 'POST', { data: obj, act: action }, 'no_message', function() {
              tableBody.find('tr').each(function(idx) {
              //$('#table-tbody tr').each(function(idx) {
                updatePriceColumn($(this), curr_show_bills[idx]);
              });
            });
          }
        } }
      }
    });
  }

  function buildPriceBatchInputDialog(bills) {
    var idata = {}; // { billname : { veh_ves_name: [] }  }
    bills.forEach(function(bill) {
      if (!isExist(idata[bill.billing_name])) {
        idata[bill.billing_name] = [];
      }

      if (bill.veh_ves_name && bill.ship_to) {
        var vv2dest = bill.veh_ves_name + '-' + bill.ship_to;
        if (idata[bill.billing_name].indexOf(vv2dest) < 0) {
          idata[bill.billing_name].push(vv2dest);
        }
      }
    });

    var msg = '<div class="row form-horizontal">';
    var str = '<div class="form-group"><label for="{0}" class="control-label col-sm-4">{1}</label><div class="input-group col-sm-8"><input id="{2}" type="text" name="{3}" class="form-control"><span style="font-size: 11px">目的地: {4}</span></div></div>';
    var id = "";
    for (var name in idata) {
      if (idata.hasOwnProperty(name) && idata[name].length) {
        var html = '<div class="col-md-10"><label>' + name + '</label>';
        idata[name].forEach(function(item) {
          var temp = item.split('-');
          id = name.replace(/[\s\(\)#]+/g, '') + '__' + item.replace(/[\s\(\)#]+/g, "999");
          html += str.format(id, temp[0], id, id, temp[1]);
        });
        msg += html + '</div>';
      }
    }
    msg += '</div>';

    bootbox.dialog({
      message: msg,
      title: "批量输入价格",
      buttons: {
        cancel: { label: "取消", className: "btn-default", callback: function() { }},
        main:   { label: "确定", className: "btn-primary", callback: ok }
      }
    });

    function ok() {
      var id = "";
      var idxList = [];
      for (var name in idata) {
        if (idata.hasOwnProperty(name)) {
          idata[name].forEach(function (item) {
            var temp = item.split('-');
            id = name.replace(/[\s\(\)#]+/g, '') + '__' + item.replace(/[\s\(\)#]+/g, "999");
            var price = getPriceValue(id);
            if (price >= 0 || price === -1) {
              $.each(bills, function (index, b) {
                if (b.billing_name === name && b.veh_ves_name === temp[0] && b.ship_to === temp[1]) {
                  b.price = price;
                  if (idxList.indexOf(index) < 0) {
                    idxList.push(index);
                  }
                }
              });
            }
          });
        }
      }

      if (idxList.length) {
        var obj = [];
        idxList.forEach(function(idx) {
          obj.push({
            bid : bills[idx]._id,
            inv_no: bills[idx].inv_no,
            price: bills[idx].price
          });
        });
        ajaxRequestHandle('/price_input', 'POST', { data: obj, act: action }, 'no_message', function() {
          tableBody.find('tr').each(function(idx) {
          //$('#table-tbody tr').each(function(idx) {
            updatePriceColumn($(this), curr_show_bills[idx]);
          });
        });
      }
    }
  }

  function getPriceValue(id) {
    var jqId = '#' + id;
    var v = $(jqId).val();
    if (v) {
      var value = parseFloatHTML($(jqId).val());
      if (isNaN(value) || value == 0) {
        return 0;
      } else {
        return value;
      }
    } else {
      return 0;
    }
  }

  function resetTableRow() {
    tableBody.empty();
    selected_bills = [];
    curr_show_bills = [];
    var html_text = [];
    curr_bills.forEach(function (bill) {
      if (action === 'CUSTOMER') {
        if (showNonSettle) {
          if (bill.price === -1) {
            html_text.push(makeTableBodyTr(bill));
            curr_show_bills.push(bill);
          }
        }
        else {
          if ((bill.inv_settle_flag & CUSTOMER_SETTLE_FLAG) != CUSTOMER_SETTLE_FLAG && bill.price >= 0) {
            html_text.push(makeTableBodyTr(bill));
            curr_show_bills.push(bill);
          }
        }
      } else if (action === "COLLECTION") {
        if (showNonSettle) {
          if (bill.collection_price === -1) {
            html_text.push(makeTableBodyTr(bill));
            curr_show_bills.push(bill);
          }
        }
        else {
          if ((bill.inv_settle_flag & COLLECTION_SETTLE_FLAG) != COLLECTION_SETTLE_FLAG && bill.collection_price >= 0) {
            html_text.push(makeTableBodyTr(bill));
            curr_show_bills.push(bill);
          }
        }
      }
    });

    tableBody.append(html_text.join('\n'));

    //$('#lb-total-weight').text(getStrValue(totalWeight));
    //$('#lb-total-num').text(getStrValue(totalNumber));
    //$('#curr-bills-number').text(tableBody.find("tr").length);

    $('#select-all').prop("checked", false);
    enableButtons();

    tableBody.find('tr').on('click', function () {
      selectRow($(this), true);
    });

    $('.select-bill').on('click', function(e) {
      e.stopImmediatePropagation();
      selectRow($(this).closest('tr'), false);
    });

//    $('[data-toggle="popover"]').popover({ trigger: "hover", html: true, placement: "bottom" });
  }

  function selectRow(me, needUpdateCheckbox) {
    var b = curr_show_bills[me.index()];
    var found = false;
    for (var i = 0; i < selected_bills.length; ++i) {
      if (sameBill(selected_bills[i], b) && b.inv_no === selected_bills[i].inv_no && b.veh_ves_name === selected_bills[i].veh_ves_name) {
        selected_bills.remove(i);
        found = true;
        break;
      }
    }

    if (found) {
      me.removeClass('invoice-highlighted');
    } else {
      selected_bills.push(b);
      me.addClass('invoice-highlighted');
    }

    if (needUpdateCheckbox) {
      me.find('input[type="checkbox"]').prop("checked", !found);
    }

    $('#select-all').prop("checked", selected_bills.length === tableBody.find("tr").length);
    enableButtons();
    showSelectedTotalValue();
  }

  function showSelectedTotalValue() {
    var selectedTotalNumber = 0;
    var selectedTotalWeight = 0;
    selected_bills.forEach(function (sb) {
      selectedTotalNumber += sb.send_num; // priceInfoObj.totalNumber;
      selectedTotalWeight += sb.send_weight; // bill.total_weight;
    });

    if (selectedTotalNumber > 0) {
      showHtmlElement($('#lb-selected-group'), true);
      setElementValue($('#lb-selected-total-num'), getStrValue(selectedTotalNumber));
      setElementValue($('#lb-selected-total-weight'), getStrValue(selectedTotalWeight));
    } else {
      showHtmlElement($('#lb-selected-group'), false);
    }
  }

  function getState(bill) {
    var statusStr = "";
    if (isEmpty(bill.inv_settle_flag) || bill.inv_settle_flag === 0) {
      if (bill.price === -1 && bill.collection_price === -1) {
        statusStr = getStrByStatus("客户,代收不需结算", bill.status);
      } else if (bill.price === -1) {
        statusStr = getStrByStatus("客户不需结算", bill.status);
      } else if (bill.collection_price === -1) {
        statusStr = getStrByStatus("代收不需结算", bill.status);
      } else {
        statusStr = getStrByStatus("未结算", bill.status);
      }
    } else {
      var statusText = [];
      if ((bill.inv_settle_flag & CUSTOMER_SETTLE_FLAG) === CUSTOMER_SETTLE_FLAG) {
        statusText.push("客户");
      }
      if ((bill.inv_settle_flag & COLLECTION_SETTLE_FLAG) === COLLECTION_SETTLE_FLAG) {
        statusText.push("代收付");
      }
      statusStr = getStrByStatus(statusText.join(',') + '已结算', bill.status);
    }

    return statusStr;
  }

  function makeTableBodyTr(bill) {
    var trHtml = '<tr><td align="center"><input class="select-bill" type="checkbox"></td>';

    //totalNumber += bill.send_num; // priceInfoObj.totalNumber;
    //totalWeight += bill.send_weight; // bill.total_weight;

    var priceText = getPriceText(action === "CUSTOMER" ? bill.price : bill.collection_price);
    var name = (bill.ship_customer ? (bill.billing_name + "/" + bill.ship_customer) : bill.billing_name);

    var remark = '';
    if (bill.width < 3000 && bill.len < 13500) {
      remark = '正常';
    } else if ((bill.width >= 3000 && bill.width < 3300) || (bill.len >= 13500 && bill.len < 16500)) {
      remark = '超长宽';
    } else if (bill.width >= 3300 || bill.len >= 16500) {
      remark = '特长宽';
    }

    trHtml += '<td>{0}</td><td>{1}</td><td>{2}</td><td>{3}</td><td>{4}</td><td>{5}</td><td>{6}</td><td>{7}</td><td>{8}</td><td>{9}</td><td>{10}</td><td>{11}</td><td>{12}</td><td>{13}</td></tr>';
    return trHtml.format(getState(bill), getOrder(bill.order_no, bill.order_item_no), bill.bill_no,
      name, bill.veh_ves_name, bill.ship_to, priceText,
      bill.send_num > 0 ? bill.send_num : '', getStrValue(bill.send_weight),
      bill.ship_warehouse ? bill.ship_warehouse : '', date2Str(bill.inv_ship_date), bill.inv_shipper ? bill.inv_shipper : '', bill.inv_no, remark);
  }

  elementEventRegister(btnExport, 'click', function() {
    var html_text = [];
    var head = '<thead><tr><th>状态</th><th>订单号</th><th>提单号</th><th>开单名称</th><th>车船</th><th>目的地</th><th>价格</th><th>发运块数</th>' +
      '<th>发运重量</th><th>发货仓库</th><th>发货日期</th><th>发货人</th><th>运单号</th><th>规格</th><th>规格大小</th><th>合同号</th></tr></thead><tbody>';
    html_text.push(head);

    var trHtml = '<tr><td>{0}</td><td>{1}</td><td>{2}</td><td>{3}</td><td>{4}</td><td>{5}</td><td>{6}</td><td>{7}</td><td>{8}</td><td>{9}</td><td>{10}</td><td>{11}</td><td>{12}</td><td>{13}</td><td>{14}</td><td>{15}</td></tr>';
    curr_show_bills.forEach(function (bill) {
      var priceText = getPriceText(action === "CUSTOMER" ? bill.price : bill.collection_price);
      var name = (bill.ship_customer ? (bill.billing_name + "/" + bill.ship_customer) : bill.billing_name);

      var remark = '';
      var spec = bill.thickness + '*' + bill.width + '*' + bill.len;
      if (bill.width < 3000 && bill.len < 13500) {
        remark = '正常';
      } else if ((bill.width >= 3000 && bill.width < 3300) || (bill.len >= 13500 && bill.len < 16500)) {
        remark = '超长宽';
      } else if (bill.width >= 3300 || bill.len >= 16500) {
        remark = '特长宽';
      }

      html_text.push(trHtml.format(getState(bill), getOrder(bill.order_no, bill.order_item_no), bill.bill_no,
        name, bill.veh_ves_name, bill.ship_to, priceText,
        bill.send_num > 0 ? bill.send_num : '', getStrValue(bill.send_weight),
        bill.ship_warehouse ? bill.ship_warehouse : '', date2Str(bill.inv_ship_date),
        bill.inv_shipper ? bill.inv_shipper : '', bill.inv_no, remark, spec, bill.contract_no));
    });
    html_text.push('</tbody>');

    tableToExcel(html_text.join('\n'), "data");
  });

  var showFilter = false;
  var acquireVehicles = false;
  elementEventRegister(btnFilter, 'click', function() {
    $('#filter-ui').toggle();
    showFilter = !showFilter;
    if (showFilter && !acquireVehicles) {
      $.get('/settle_vehicle_list', { }, function (data) {
        var result = JSON.parse(data);
        qFilter.setAllVehicles(result.vehicles);
        acquireVehicles = true;
      })
    }
  });

  elementEventRegister($('#show-data'), 'click', function() {
    resetTableRow();
    showHtmlElement($('#lb-selected-group'), false);
  });

  function filterData(needUpdateDbData, emptyDbData) {
    if (needUpdateDbData) {
      $('body').css({'cursor':'wait'});
      var obj = qFilter.getQueryParams();
      $.get('/get_invoices_bill', obj, function (data) {
        var result = jQuery.parseJSON(data);
        dbBills = [];
        if (result.ok) {
          dbBills = sortByKey(result.bills, "inv_ship_date", "DSC");
        }
        curr_bills = qFilter.updateOptions(dbBills, false);
        showHintText();
        $('body').css({'cursor':'default'});
      });
    } else {
      if (emptyDbData) {
        dbBills = [];
      }
      curr_bills = qFilter.updateOptions(dbBills, emptyDbData);
      showHintText();
    }
  }

  function showHintText() {
    tableBody.empty();
    selected_bills = [];
    curr_show_bills = [];
    var totalNumber = 0;
    var totalWeight = 0;
    var num = 0;
    var price = 0;
    if (action === 'CUSTOMER') {
      curr_bills.forEach(function (bill) {
        if (showNonSettle) {
          if (bill.price === -1) {
            totalNumber += bill.send_num;
            totalWeight += bill.send_weight;
            ++num;
          }
        }
        else {
          //console.log(bill);
          if ((bill.inv_settle_flag & CUSTOMER_SETTLE_FLAG) != CUSTOMER_SETTLE_FLAG && bill.price >= 0) {
            totalNumber += bill.send_num;
            totalWeight += bill.send_weight;
            ++num;
            price += bill.price * bill.send_weight;
          }
        }
      });
    } else if (action === "COLLECTION") {
      curr_bills.forEach(function (bill) {
        if (showNonSettle) {
          if (bill.collection_price === -1) {
            totalNumber += bill.send_num;
            totalWeight += bill.send_weight;
            ++num;
          }
        }
        else {
          if ((bill.inv_settle_flag & COLLECTION_SETTLE_FLAG) != COLLECTION_SETTLE_FLAG && bill.collection_price >= 0) {
            totalNumber += bill.send_num;
            totalWeight += bill.send_weight;
            ++num;
            price += bill.collection_price * bill.send_weight;
          }
        }
      });
    }

    $('#lb-total-amount').text(getStrValue(price));
    $('#lb-total-weight').text(getStrValue(totalWeight));
    $('#lb-total-num').text(getStrValue(totalNumber));
    $('#curr-bills-number').text(num);
  }
});

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
var QueryFilterD = function(options, options_2, action, filter) {
  this.currSelected = 0;
  var self = this;

  this.uiElems = {
    sBfOrder : new FilterElementD($('#bf-order-no'), [], false, true, function() {
      self.currSelected = 2;
      filter(false, self.isAllEmpty());
    }),

    sBfBillName :  $('#bf-bill-name'),
    sBfDest :      $('#bf-destination'),
    sBfVehicle :   $('#bf-vehicle'),
    startDateGrp : $('#start-date-grp'),
    endDateGrp :   $('#end-date-grp'),
    iStartDate :   $('#start-date'),
    iEndDate :     $('#end-date'),
    sBfVehType :   $('#bf-vehtype'),

    sBfBillNo: new FilterElementD($('#bf-bill-no'), [], false, true, function() {
      self.currSelected = 6;
      filter(false, self.isAllEmpty());
    })
  };

  this.options = options;
  this.options_2 = options_2;
  this.action = action;
  this.selectedVeh = [];
  this.selectedDest = [];
  this.veh_list = null;
  this.allVehicles = null;
  this.veh_type = 0; // 0: both, 1: che, 2: chuan

  if (action === "CUSTOMER") {
    initSelect(this.uiElems.sBfBillName, options.nameList, true);
    initSelect(this.uiElems.sBfVehicle, options.vehList, false);
    initSelect(this.uiElems.sBfDest, options.destList, false);
    this.veh_list = options.vehList;
  }
  else if (action === "COLLECTION") {
    initSelect(this.uiElems.sBfBillName, options_2.nameList, true);
    initSelect(this.uiElems.sBfVehicle, options_2.vehList, false);
    initSelect(this.uiElems.sBfDest, options_2.destList, false);
    this.veh_list = options_2.vehList;
  }

  this.uiElems.sBfBillName.select2();
  this.uiElems.sBfVehicle.select2();
  this.uiElems.sBfDest.select2();

  this.eDate = moment();
  this.sDate = moment().subtract(1, 'months');
  var startGrp = self.uiElems.startDateGrp.datetimepicker(getDateTimePickerOptions());
  var endGrp = self.uiElems.endDateGrp.datetimepicker(getDateTimePickerOptions());
  this.uiElems.endDateGrp.data("DateTimePicker").setDate(this.eDate);
  this.uiElems.startDateGrp.data("DateTimePicker").setDate(this.sDate);

  this._selectFliterFunc = function(which, filter) {
    this.currSelected = which;
    if (this.isAllEmpty()) {
      filter(false, true);       // return to initial state
    }
    else {
      filter(true, false);
    }
  };

  this._dateFilterFunc = function(isStart, isEnd, filter) {
    var d1 = this.uiElems.iStartDate.val();
    var d2 = this.uiElems.iEndDate.val();
    var b = false;
    if (isStart && isEnd) {
      b = !isEmpty(d1) && !isEmpty(d2);
    } else if (isStart) {
      b = isEmpty(this.uiElems.iStartDate.val());
    } else if (isEnd) {
      b = isEmpty(this.uiElems.iEndDate.val());
    }

    if (b) {
      this.currSelected = 5;
      filter(true, false);
    }
  };

  self.uiElems.sBfBillName.on('change', function() { self._selectFliterFunc(1, filter); });

  self.uiElems.sBfVehicle.on('change', function(e) {
    if (e.added) {
      self.selectedVeh.push(e.added.text)
    } else if (e.removed) {
      var index = self.selectedVeh.indexOf(e.removed.text);
      if (index > -1) {
        self.selectedVeh.splice(index, 1);
      }
    }
    self._selectFliterFunc(3, filter);
  });

  self.uiElems.sBfDest.on('change', function(e) {
    if (e.added) {
      self.selectedDest.push(e.added.text)
    } else if (e.removed) {
      var index = self.selectedDest.indexOf(e.removed.text);
      if (index > -1) {
        self.selectedDest.splice(index, 1);
      }
    }
    self._selectFliterFunc(4, filter);
  });

  self.uiElems.sBfVehType.on('change', function(e) {
    var t = this.value;
    if (t === '车') {
      self.veh_type = 1;
    } else if (t === '船') {
      self.veh_type = 2;
    } else {
      self.veh_type = 0;
    }

    if (self.veh_type == 1) {
      var vehList = [];
      self.allVehicles.forEach(function(vs) {
        for (var i = 0; i < self.veh_list.length; ++i) {
          if (self.veh_list[i] === vs.name && vs.veh_type === '车') {
            vehList.push(self.veh_list[i]);
            break;
          }
        }
      })
      initSelect(self.uiElems.sBfVehicle, vehList, false);
    } else if (self.veh_type === 2) {
      var vehList = [];
      self.allVehicles.forEach(function(vs) {
        for (var i = 0; i < self.veh_list.length; ++i) {
          if (self.veh_list[i] === vs.name && vs.veh_type === '船') {
            vehList.push(self.veh_list[i]);
            break;
          }
        }
      });
      initSelect(self.uiElems.sBfVehicle, vehList, false);
    } else {
      initSelect(self.uiElems.sBfVehicle, self.veh_list, false);
    }
  });

  startGrp.on('dp.change', function(e) {
    e.preventDefault();
    e.stopImmediatePropagation();
    self.sDate = e.date.startOf('day');
    self.uiElems.endDateGrp.data("DateTimePicker").setMinDate(e.date);
    self._dateFilterFunc(true, true, filter);
  });
  endGrp.on('dp.change', function(e) {
    e.preventDefault();
    e.stopImmediatePropagation();
    self.eDate = e.date.endOf('day');
    self.uiElems.startDateGrp.data("DateTimePicker").setMaxDate(e.date);
    self._dateFilterFunc(true, true, filter);
  });
  self.uiElems.iStartDate.on('change', function(e) {
    e.stopImmediatePropagation();
    self._dateFilterFunc(true, false, filter);
  });
  self.uiElems.iEndDate.on('change', function(e) {
    e.stopImmediatePropagation();
    self._dateFilterFunc(false, true, filter);
  });

};

QueryFilterD.prototype.setAllVehicles = function(vehicles) {
  this.allVehicles = vehicles;
};

QueryFilterD.prototype.getQueryParams = function() {
  var name = this.uiElems.sBfBillName.val();
  var d1 = this.uiElems.iStartDate.val();
  var d2 = this.uiElems.iEndDate.val();
  var b = !isEmpty(d1) && !isEmpty(d2);

  return {
    fName: name ? [ name ] : null,
    fVeh: this.selectedVeh,
    fDest: this.selectedDest,
    fOrder: null, fBno: null,
    fDate1: b ? this.sDate.toISOString() : null,
    fDate2: b ? this.eDate.toISOString() : null,
    fType: "invoice-first"
  };
};

QueryFilterD.prototype.isAllEmpty = function() {
  var order = this.uiElems.sBfOrder.selected;
  var bno = this.uiElems.sBfBillNo.selected;
  var name = getSelectValue(this.uiElems.sBfBillName);
  var d1 = this.uiElems.iStartDate.val();
  var d2 = this.uiElems.iEndDate.val();

  return order.length === 0 && bno.length === 0 && this.selectedVeh.length === 0 && this.selectedDest.length === 0 &&
    isEmpty(name) && isEmpty(d1) && isEmpty(d2);
};

QueryFilterD.prototype.updateOptions = function(bills, reset) {
  var order = this.uiElems.sBfOrder.selected;
  var billNo = this.uiElems.sBfBillNo.selected;
  var name = getSelectValue(this.uiElems.sBfBillName);
  var nOptions = { orderList: [], vehList: [], destList: [], billNoList: [] };
  var visibleBills = [];
  if (reset) {
    if (this.action === "CUSTOMER") {
      nOptions = this.options;
    } else {
      nOptions = this.options_2;
    }
    visibleBills = bills;
    bills.forEach(function (bill) {
      if (bill.ship_to && nOptions.destList.indexOf(bill.ship_to) < 0) {
        nOptions.destList.push(bill.ship_to);
      }
    });
    nOptions.destList = sort_pinyin(nOptions.destList);
  }
  else {
    var vehs = this.selectedVeh;
    var ds = this.selectedDest;
    var act = this.action;

    bills.forEach(function (bill) {
      var b1 = !order.length || (order.indexOf(bill.order_no) >= 0);
      var b2 = vehs.length === 0 || (vehs.indexOf(bill.veh_ves_name) >= 0);
      var b3 = ds.length === 0 || (ds.indexOf(bill.ship_to) >= 0);
      var b4 = !name || name === bill.billing_name;
      var b6 = !billNo.length || (billNo.indexOf(bill.bill_no) >= 0);

      if (b2 && b3 && b4) {
        if (act === 'CUSTOMER') {
          if ((bill.inv_settle_flag & 1) !== 1) {
            if (nOptions.orderList.indexOf(bill.order_no) < 0) {
              nOptions.orderList.push(bill.order_no);
            }
            if (nOptions.billNoList.indexOf(bill.bill_no) < 0) {
              nOptions.billNoList.push(bill.bill_no);
            }
          }
        } else {
          if ((bill.inv_settle_flag & 2) !== 2) {
            if (nOptions.orderList.indexOf(bill.order_no) < 0) {
              nOptions.orderList.push(bill.order_no);
            }
            if (nOptions.billNoList.indexOf(bill.bill_no) < 0) {
              nOptions.billNoList.push(bill.bill_no);
            }
          }
        }

        if (b1 && b6) {
          if (bill.veh_ves_name && nOptions.vehList.indexOf(bill.veh_ves_name) < 0) {
            nOptions.vehList.push(bill.veh_ves_name);
          }
          if (bill.ship_to && nOptions.destList.indexOf(bill.ship_to) < 0) {
            nOptions.destList.push(bill.ship_to);
          }
          visibleBills.push(bill);
        }
      }
    });

    nOptions.destList = sort_pinyin(nOptions.destList);
    nOptions.orderList.sort();
    nOptions.billNoList = sort_pinyin(nOptions.billNoList);
    nOptions.vehList = sort_pinyin(nOptions.vehList);
  }

  vehList = nOptions.vehList;
  /*
  var vehList = [];
  if (this.veh_type == 1) {
    this.allVehicles.forEach(function(vs) {
      for (var i = 0; i < nOptions.vehList.length; ++i) {
        if (nOptions.vehList[i] === vs.name && vs.veh_type === '车') {
          vehList.push(nOptions.vehList[i]);
          break;
        }
      }
    })
  } else if (this.veh_type === 2) {
    this.allVehicles.forEach(function(vs) {
      for (var i = 0; i < nOptions.vehList.length; ++i) {
        if (nOptions.vehList[i] === vs.name && vs.veh_type === '船') {
          vehList.push(nOptions.vehList[i]);
          break;
        }
      }
    })
  } else {
    vehList = nOptions.vehList;
  }
  */

  if (this.currSelected === 2) {
    this.uiElems.sBfBillNo.rebuild(nOptions.billNoList.sort(), billNo);
    initSelect(this.uiElems.sBfVehicle, vehList, false);
    this.uiElems.sBfVehicle.select2('val', this.selectedVeh);
    initSelect(this.uiElems.sBfDest, nOptions.destList, false);
    this.uiElems.sBfDest.select2('val', this.selectedDest);
  }
  else if (this.currSelected === 3) {
    this.uiElems.sBfOrder.rebuild(nOptions.orderList.sort(), order);
    this.uiElems.sBfBillNo.rebuild(nOptions.billNoList.sort(), billNo);
    initSelect(this.uiElems.sBfDest, nOptions.destList, false);
    this.uiElems.sBfDest.select2('val', this.selectedDest);
  }
  else if (this.currSelected === 4) {
    this.uiElems.sBfOrder.rebuild(nOptions.orderList.sort(), order);
    this.uiElems.sBfBillNo.rebuild(nOptions.billNoList.sort(), billNo);

    initSelect(this.uiElems.sBfVehicle, vehList, false);
    this.uiElems.sBfVehicle.select2('val', this.selectedVeh);
  }
  else if (this.currSelected === 6) {
    initSelect(this.uiElems.sBfVehicle, vehList, false);
    this.uiElems.sBfVehicle.select2('val', this.selectedVeh);
    initSelect(this.uiElems.sBfDest, nOptions.destList, false);
    this.uiElems.sBfDest.select2('val', this.selectedDest);
    this.uiElems.sBfOrder.rebuild(nOptions.orderList.sort(), order);
  }
  else {
    this.uiElems.sBfBillNo.rebuild(nOptions.billNoList.sort(), billNo);
    this.uiElems.sBfOrder.rebuild(nOptions.orderList.sort(), order);
    initSelect(this.uiElems.sBfVehicle, vehList, false);
    this.uiElems.sBfVehicle.select2('val', this.selectedVeh);
    initSelect(this.uiElems.sBfDest, nOptions.destList, false);
    this.uiElems.sBfDest.select2('val', this.selectedDest);
  }

  return visibleBills;
};

QueryFilterD.prototype.reset = function(action) {
  var name = getSelectValue(this.uiElems.sBfBillName);

  if (action === "CUSTOMER") {
    initSelect(this.uiElems.sBfBillName, this.options.nameList, true, name);
    initSelect(this.uiElems.sBfVehicle, this.options.vehList, false);
    initSelect(this.uiElems.sBfDest, this.options.destList, false);
  } else if (action === "COLLECTION") {
    initSelect(this.uiElems.sBfBillName, this.options_2.nameList, true, name);
    initSelect(this.uiElems.sBfVehicle, this.options_2.vehList, false);
    initSelect(this.uiElems.sBfDest, this.options_2.destList, false);
  }

  this.action = action;
  this.uiElems.sBfBillName.select2("val", name);
  this.uiElems.sBfVehicle.select2("val", this.selectedVeh);
  this.uiElems.sBfDest.select2("val", this.selectedDest);
};
